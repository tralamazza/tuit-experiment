exports.start = function(options) {
  "use strict"

  var url = require('url');
  var path = require('path');
  var fs = require('fs');
  var spawn = require('child_process').spawn;
  var http = require('http');
  var send = require('send');
  var ntwitter = require('ntwitter');
  var twitter = new ntwitter(options.credentials);

  //
  var PUBLIC = path.normalize(__dirname + '/../public');
  var counta = 0;
  var cache = {};
  var flushes = fs.readdirSync(PUBLIC).filter(function(p) { return p.match(/\.gz/); })

  // simplistic regexp
  var xtract = /http:[^\s]+/g;

  // twitter
  twitter.stream('statuses/filter', { track: options.track }, function(stream) {
    stream.on('data', function(tweet) {
      var urls = [];
      if (tweet.retweeted_status)
        urls = urls.concat(tweet.retweeted_status.text.match(xtract));
      if (tweet.text)
        urls = urls.concat(tweet.text.match(xtract));
      urls.forEach(function(u) {
        counta++;
        if (!cache[u])
          cache[u] = 1;
        else
          cache[u]++;
      });
    });
  });

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
  io.sockets.on('connection', function(socket) {
    // send all flushes so far
    flushes.forEach(function(fname) {
      socket.emit('flush', { name: fname, url: fname });
    });

    // every second
    setInterval(function() {
      socket.emit('stats', {
        lps: counta,
        mem: process.memoryUsage(),
        csize: Object.keys(cache).length
      });
      // reset counta
      counta = 0;
      // flush ?
      if (Object.keys(cache).length > 10000) {
        var d = new Date;
        var fname = d.toISOString().replace(/:/g, '');
        try {
          fs.writeFileSync(PUBLIC + '/' + fname, JSON.stringify(cache), 'utf-8');
          spawn('gzip', [PUBLIC + '/' + fname]);
          fname = fname + '.gz';
          flushes.push(fname);
          socket.emit('flush', { name: fname, url: fname });
          console.log('Flush took:', (+new Date - d));
        } catch (err) {
          console.log('Flush error:', err);
        }
        cache = {};
      }
    }, 1000);
  });
}
