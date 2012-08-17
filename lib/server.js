var url = require('url');
var path = require('path');
var fs = require('fs');
var spawn = require('child_process').spawn;
var http = require('http');
var send = require('send');
var ntwitter = require('ntwitter');

var PUBLIC = path.normalize(__dirname + '/../public');
var counta = 0;
var cache = {};
var xtract = /https?:[^\s]+/g;
// read /public/*.gz
var flushes = fs.readdirSync(PUBLIC).filter(function(p) { return p.match(/\.gz/); })

exports.start = function(options) {
  "use strict"

  function setupTwitterStream() {
    // twitter
    var twitter = new ntwitter(options.credentials);
    twitter.stream('statuses/filter', { track: options.track }, function(stream) {
      stream.on('data', function(tweet) {
        var urls = [];
        if (tweet.retweeted_status)
          urls = urls.concat(tweet.retweeted_status.text.match(xtract));
        if (tweet.text)
          urls = urls.concat(tweet.text.match(xtract));
        urls.forEach(function(u) {
          if (u) {
            counta++;
            if (!cache[u])
              cache[u] = 1;
            else
              cache[u]++;
          }
        });
      });
      // Handle a disconnection
      stream.on('end', function (res) {
        console.error('Twitter disconnected (end):', res);
        setupTwitterStream();
      });
      // Handle a 'silent' disconnection from Twitter, no end/error event fired
      stream.on('destroy', function (res) {
        console.error('Twitter disconnected (destroy):', res);
        setupTwitterStream();
      });
    });
  };
  setupTwitterStream();

  // http server
  var server = http.createServer(function (req, res) {
    send(req, url.parse(req.url).pathname)
      .root(PUBLIC)
      .on('error', function(err) {
        res.statusCode = err.status || 500;
        res.end(err.message || 'boop');
      })
      .on('directory', function() {
        res.statusCode = 301;
        res.setHeader('Location', req.url + '/');
        res.end('Redirecting to ' + req.url + '/');
      })
      .pipe(res);
  }).listen(options.port);

  // socket.io
  var io = require('socket.io').listen(server);
  io.configure('production', function() {
    io.enable('browser client minification'); // send minified client
    io.enable('browser client gzip'); // gzip the file
    io.set('log level', 1); // reduce logging
    io.set('transports', [ 'websocket', 'xhr-polling', 'jsonp-polling' ]);
  });
  io.sockets.on('connection', function(socket) {
    // send all flushes so far
    flushes.forEach(function(fname) {
      socket.emit('flush', { name: fname, url: fname });
    });

    // every second
    setInterval(function() {
      var current_csize = Object.keys(cache).length;
      socket.emit('stats', {
        lps: counta,
        mem: process.memoryUsage(),
        csize: current_csize
      });
      // reset counta
      counta = 0;
      // flush ?
      if (current_csize > options.cache_size) {
        var tmp = cache;
        cache = {}; // reset cache
        var d = new Date;
        var fname = d.toISOString().replace(/:/g, '');
        fs.writeFile(PUBLIC + '/' + fname, JSON.stringify(tmp), 'utf-8', function(err) {
          if (err)
            console.error(err);
          else {
            spawn('gzip', [PUBLIC + '/' + fname]);
            fname = fname + '.gz';
            flushes.push(fname);
            socket.emit('flush', { name: fname, url: fname });
            console.log('Flush %s took: %d', fname, (+new Date - d));
          }
        });
      }
    }, 1000);
  });
}
