$(document).ready(function() {
  var socket = io.connect();

  socket.on('stats', function(data) {
    $('#lps').text(data.lps);
    $('#mem').text(Math.round(data.mem.heapUsed / 1024));
    $('#csize').text(data.csize);
  });

  socket.on('flush', function(data) {
    $('#flushes').append('<li><a href="' + data.url + '">' + data.name + '</a>');
  });
});
