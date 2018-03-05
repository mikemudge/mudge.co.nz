var CameraController = function(config, director, $interval, loginService, $resource, $routeParams, $scope, poseService) {
  window.ctrl = this;
  this.director = director;
  this.camera = director.camera;
  this.controls = director.controls;

  this.current_user = loginService.user8i;
  if (!this.current_user.id) {
    var loginPromise = loginService.loginAnon('0425b457-bfb4-4d93-9c63-8678e1e11885');

    loginPromise.then(function(response) {
      window.location.reload();
    });
    return;
  }

  this.director.webglRenderer.setClearAlpha(0);

  var pose_id = $routeParams['pose_id'];
  this.pose = poseService.Pose.get({'id': pose_id});

  this.pose.$promise.then(function() {
    // TODO pose.scene_wrapper.scene has sceneObjects.
    this.director.loadScene(this.pose.scene_wrapper.scene);
  }.bind(this));

  director.clearBackground();
  // Prevent any other backgrounds from getting added.
  director.background = true;
  director.webglRenderer.setClearAlpha(0);
  this.showWebCameraBackground();

  this.controls.onTapped = function() {
    this.director.togglePlay();
  }.bind(this);

  this.director.looping = true;

  if (window.orientation !== undefined) {
    // TODO touches seem to rotate the camera.
    // TODO need to manage how touch controls work with device controls.

    this.controls.enableTouch();

    this.camera.position.set(0, 1.50, 2.00);
    this.device_controls = new DeviceOrientationControls(
      this.camera, this.controls.target, {
        'controls': this.controls,
      });

    // TODO should this be an optional control?
    this.device_controls.connect();
    director.registerUpdatable(this.device_controls);
  }

  $scope.$on("$destroy", function() {
    // Stop using the camera afterwards.
    var video = document.querySelector('video');
    video.src = null;
  });
}

CameraController.prototype.showWebCameraBackground = function() {
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

CameraController.prototype.updateVideoFeed = function(cameraSource) {
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

angular.module('holo_web', [
  'config',
  'holo_browse',
  'player2Service',
  'loginService2',
  'ngRoute',
  'ngResource'
])
.controller('CameraController', CameraController)
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
      .when('/pose/:pose_id', {
        templateUrl: '/static/angular/holo_web/camera.html',
      })
      .otherwise({
        templateUrl: '/static/angular/holo_web/browse.html',
      })
})
.run(function($location, $rootScope, config) {
  // loginService.ensureLoggedIn();
  // Prevent loading any resources?

  // variables on $rootScope will be available for reading from all $scopes
  // through scope inheritance.
  $rootScope.config = config;
  $rootScope.api_url = config.API_URL;
})
.config(function($httpProvider) {
  // So we remain logged in when making ajax requests to the API_URL.
  // $httpProvider.defaults.withCredentials = true;
  $httpProvider.interceptors.push('AuthInterceptor');
})
.factory('AuthInterceptor', function ($injector, $q) {
  return {
    // This might be fixing a $http request issue?
    // Hard to reproduce the error.
    requestError: function(request) {
      console.log(request);
    },
    response: function(response) {
      if (response.data.data) {
        // Handle API's which always return json with a data object.
        result = response.data.data;
        // Use $ to prevent sending this back up to the server.
        result.$pagination = response.data.pagination;
        response.data = result;
      }
      return $q.resolve(response);
    },
    responseError: function (response) {
      if (response.status == 0) {
        // I don't know why this happens.
        // Perhaps its a template cache thing?
        return;
      }
      if (response.status == 403 || response.status == 401) {
        // Need to lazy inject this to avoid a dependency cycle.
        var loginService = $injector.get('loginService');
        // loginService.badResponse();

        // Do an anonymous login, like the clients would.
        var loginPromise = loginService.loginAnon('0425b457-bfb4-4d93-9c63-8678e1e11885');

        loginPromise.then(function(response) {
          window.location.reload();
        });

        return $q.reject(response);
      }

      // We expect that these errors will be set for all known error responses.
      if (response.error) {
        console.warn('Error response:', JSON.stringify(response.error));
        response.errors = response.error;
      } else {
        console.error('Error response:', response);
        response.errors = {
          'code': 'UNKNOWN_ERROR',
          'message': 'See the console for more information'
        }
      }
      return $q.reject(response);
    }
  }
})
;
