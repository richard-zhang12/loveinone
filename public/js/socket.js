$(document).ready(function () {
    var socket = io();
    socket.on('connect', function (socketio) {
        console.log('Client is connected to Server');
    })

    //listen to event
    socket.on('newMessage', function (message) {
        console.log(message);
    })

    socket.on('disconnect', function () {
        console.log('Client is disconnected from server');
    })
})