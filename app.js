
var version = '1.12';


var args = process.argv.slice(2);

var httpServer = 'http://192.168.0.100:8080';
var socketServer = 'http://192.168.0.100:3000/';
if (typeof args[0] != 'undefined') {		
    socketServer = 'http://' + args[0];		
}
if (typeof args[1] != 'undefined') {		
    httpServer = 'http://' + args[1];		
}

var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var childProcess;

var path = require('path');

var socket = require('socket.io/node_modules/socket.io-client')(socketServer);

var fs = require('fs');

var FormData = require('form-data');
var request = require('request');

var os = require('os');
var ifaces = os.networkInterfaces();

// Random name generator
var marvel = require('marvel-characters')

var lastReceiveTime;
var photoStartTime;
var takeId;

var imagePath = '/';
var imageName = 'output.jpg';

var deviceNamePath = path.join(__dirname, "/device-name");

var cameraName = marvel();

var ipAddress = null;


socket.on('take-photo', function(data){
    console.log("Taking a photo");
    
    photoStartTime  = Date.now();
    lastReceiveTime = data.time
    takeId          = data.takeId;
    
    takeImage();
    
});


socket.on('connect', function(){
    console.log('A socket connection was made');
    
    // Lookup our IP address
    Object.keys(ifaces).forEach(function (ifname) {
      var alias = 0;

      ifaces[ifname].forEach(function (iface) {
        if ('IPv4' !== iface.family || iface.internal !== false) {
          // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
          return;
        }
        ipAddress = iface.address;
      });
    });
    
    fs.readFile(deviceNamePath, function(err, buffer){
        if (typeof buffer == 'undefined') {
            return;
        }
        var savedName = buffer.toString();
        if (savedName) {
            cameraName = savedName;
            console.log('saved device name', cameraName);
        }
    });
    
    socket.emit('camera-online', {name: cameraName, ipAddress: ipAddress, version: version});
    
    // Setup a regular heartbeat interval
    var heartbeatIntervalID = setInterval(heartbeat, 1000);

});

socket.on('update-software', function(data){
    console.log("Updating software");

    updateSoftware();
});

socket.on('update-name', function(data){
    
    if (data.ipAddress == ipAddress) {
        //console.log("Updating device name", data.newId, deviceNamePath);
        
        // If we have a proper name update the camera name, if its being reset switch back to a marvel character
        if (data.newName) {
            cameraName = data.newName;
        } else {
            cameraName = marvel();
        }
        
        fs.writeFile(deviceNamePath, cameraName, function(err) {
            if (err) {
                console.log("Error saving the device name");
            }
        });
    }
    
});

function heartbeat() {
    socket.emit('camera-online', {name: cameraName, ipAddress: ipAddress, version: version});
}

function getAbsoluteImagePath() {
    return path.join(__dirname, imagePath, imageName);
}

function sendImage(code) {
    
    //console.log("Photo capture complete, status code:" + code);
    
    // A success should come back with exit code 0
    if (code !== 0) {
        socket.emit('photo-error', {takeId:takeId});
        return;
    }
    
    socket.emit('sending-photo', {takeId:takeId});
    
    
    // Post the image data via an http request
    var form = new FormData();
    form.append('takeId', takeId);
    form.append('image', fs.createReadStream(getAbsoluteImagePath()));

    form.submit(httpServer + '/new-image', function(err, res) {
        if (err) {
            console.log("Error uploading the image", err)
        } else {
            console.log("Image uploaded");
        }
        res.resume();
    });
    
    fs.readFile(getAbsoluteImagePath(), function(err, buffer){
        
        if (typeof buffer == 'undefined') {
            socket.emit('photo-error', {takeId:takeId});
            return;
        }
        
        //console.log(err);
        //console.log(buffer);
        //io.sockets.emit('live-stream', buffer.toString('base64'));
        var totalDelay = Date.now() - lastReceiveTime;
        var imageDelay = Date.now() - photoStartTime;
        socket.emit('new-photo', {
            data: buffer.toString('base64'), 
            takeId:takeId, 
            startTime:lastReceiveTime, 
            time:Date.now(), 
            photoStartTime:photoStartTime,
            totalDelay: totalDelay,
            imageDelay: imageDelay
        });
        
        // Remove the image
        fs.unlink(getAbsoluteImagePath(), function () {
            // file deleted
        });
    });
}

function takeImage() {
    var args = [
        '-w', 2592,   // width
        '-h', 1944,  // height
        //'-t', 100,  // how long should taking the picture take?
        '-q', 30,     // quality
        '-awb', 'fluorescent', 
        '-o', getAbsoluteImagePath()   // path + name
    ];
    var imageProcess = spawn('raspistill', args);
    imageProcess.on('exit', sendImage);
}

function updateSoftware() {
    childProcess = exec('cd ' + __dirname + '; git pull; npm install', function (error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error !== null) {
            console.log('exec error: ' + error);
        }
        process.exit();
    });
}
  
function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}
