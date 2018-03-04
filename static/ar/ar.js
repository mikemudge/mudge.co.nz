var MyController = function() {
  window.ctrl = this;
  var fov = 60; // For nexus 5. TODO change based on user agent?
  this.camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 1, 1000 );
  this.camera.position.z = 80;
  this.camera.position.y = 80;
  // This is 45 degrees down onto the map.
  this.camera.rotation.x = -Math.PI * 1 / 4;

  this.threeScene = new THREE.Scene();

  this.renderer = new THREE.WebGLRenderer({canvas: document.getElementById('canvas'), antialias: true, alpha: true});
  this.renderer.setPixelRatio( window.devicePixelRatio );
  this.renderer.setSize( window.innerWidth, window.innerHeight );
  this.renderer.setClearColor(0, 0);
  window.addEventListener( 'resize', this.resize.bind(this), false );

  var ambient = new THREE.AmbientLight( 0xFFFFFF );
  this.threeScene.add( ambient );

  var gridHelper = new THREE.GridHelper(100, 1);
  this.threeScene.add(gridHelper);

  if (window.orientation !== undefined) {
    // Mobile detection.

    // TODO needs a target to work???
    var mesh = new THREE.CubeGeometry( 20, 20, 20 );
    var material = new THREE.MeshNormalMaterial();
    this.cube = new THREE.Mesh(mesh, material);
    this.cube.position.y = 15;

    this.controls = new THREE.DeviceOrientationControls(this.camera, this.cube);
    this.setupVideo();
  } else {
    this.controls = new THREE.OrbitControls(this.camera);
  }

  this.game = new Game(this.threeScene);

  requestAnimationFrame(this.animate.bind(this));
}

MyController.prototype.resize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();

  this.renderer.setSize( window.innerWidth, window.innerHeight );
}

MyController.prototype.animate = function(time) {
  this.game.update(time);
  this.controls.update(time);

  this.renderer.render( this.threeScene, this.camera );

  requestAnimationFrame(this.animate.bind(this));
}


MyController.prototype.setupVideo = function() {
  // TODO if the new navigator.mediaDevices.getUserMedia exists we should use that.

  // Show the device video feed as the background.
  navigator.getUserMedia = navigator.getUserMedia
      || navigator.webkitGetUserMedia
      || navigator.mozGetUserMedia
      || navigator.msGetUserMedia;

  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    console.log("enumerateDevices() not supported.");
    // Update video feed if we can.
    this.updateVideoFeed();
    return;
  } else {
    navigator.mediaDevices.enumerateDevices()
        .then(angular.bind(this, function(devices) {
          var cameraSource = null;
          devices.forEach(function(device) {
            if (device.kind == "videoinput" && !cameraSource) {
              cameraSource = device;
            }
            // Use the environment facing camera (AR works like this)
            if (device.label.indexOf("back") > -1) {
              cameraSource = device;
            }
          });
          this.updateVideoFeed(cameraSource);
        }))
        .catch(function(err) {
          console.log(err.name + ": " + err.message);
        });
  }
}


MyController.prototype.updateVideoFeed = function(cameraSource) {
  // Safari doesn't have this method currently, so we just don't render a background.
  if (!navigator.getUserMedia) {
    setTimeout(function() {
      var child = document.getElementById("video");
      child.parentNode.removeChild(child);
    }, 0);
    return;
  }

  // Not showing vendor prefixes.
  var videoContraints = true;
  if (cameraSource) {
    videoContraints = {
      optional: [{
        sourceId: cameraSource.deviceId
      }]
    };
  }
  navigator.getUserMedia({
    video: videoContraints,
    audio: false /* Audio is annoying in AR */
  }, function(localMediaStream) {
    var video = document.querySelector('video');
    video.src = window.URL.createObjectURL(localMediaStream);
    video.autoplay = true;

    // Note: onloadedmetadata doesn't fire in Chrome when using it with getUserMedia.
    // See crbug.com/110938.
    video.onloadedmetadata = function(e) {
      // Ready to go. Do some stuff.
    };
  }, function(e) {
    console.log('Reeeejected!', e);
  });
};

angular.module('ar', [
  'ngRoute'
])
.controller('MyController', MyController)
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    templateUrl: '/static/ar/ar.html'
  })
})
;
