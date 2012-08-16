//var cluster = require('cluster');
//var numCPUs = require('os').cpus().length;
var server = require('./lib/server');
var credentials = require('./credentials');

/*if (cluster.isMaster) {
  for (var i = 0; i < numCPUs; i++)
  cluster.fork();
  cluster.on('exit', function(worker, code, signal) {
    console.log('worker ' + worker.process.pid + ' died');
  });
} else */
  server.start({
    port: 80,
    credentials: credentials,
    track: [ 'http', 'https' ]
  });
