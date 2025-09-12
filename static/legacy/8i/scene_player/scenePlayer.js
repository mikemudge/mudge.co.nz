var PlayController = function(config, director, $interval, $resource, $routeParams, $scope, $timeout) {
  $scope.director = director;
  this.director = director;
  // Hacky but the template is using ctrl.playerService.*
  // TODO remove all those and only use the controller.
  this.playerService = director;
  this.camera = director.camera;
  this.controls = director.controls;
  this.$scope = $scope;
  this.$timeout = $timeout;
  this.jumpTo = 0;
  this.muted = false;
  this.progress = 0;

  window.ctrl = this;

  var userAgent = {
    android: !!navigator.userAgent.match(/Android/i),
    iOS: !!navigator.userAgent.match(/iPhone|iPad|iPod/i),
    chrome: !!navigator.userAgent.match(/Chrome/i),
    safari: !!navigator.userAgent.match(/AppleWebKit/i) && !(
        // TODO Have to eliminate browsers one by one?
        // As lots of things will match Safari but they also contain more.
        navigator.userAgent.match(/CriOS/i) ||
        navigator.userAgent.match(/OpiOS/i))
  };
  this.$scope.userAgent = userAgent;
  if (userAgent.android && !userAgent.chrome) {
    userAgent.unsupported = true;
  }
  if (userAgent.iOS && !userAgent.safari) {
    userAgent.unsupported = true;
  }
  if (userAgent.unsupported) {
    // TODO handle this better?
    return;
  }
  this.Scene = $resource(config.API_URL + '/api/v2/scene/:id', {'id': '@id'}, {
  });
  var scene_id = $routeParams.id;
  if (!scene_id) {
    // Attempt to load from the config.
    scene_id = config.scene_id;
  }

  if (!scene_id) {
    this.error = "No scene_id found";
    // Just allow the user to pick a scene from related?
    return
  }

  if (scene_id.length < 5) {
    // This looks like an old scene key.
    this.Scene = $resource(config.API_URL + '/api/v1/scene/:key');
    this.scene = this.Scene.get({key: scene_id},
        angular.bind(this, this.loadScene),
        angular.bind(this, this.errorResponse));
  } else {
    this.scene = this.Scene.get(
        {id: scene_id},
        angular.bind(this, this.loadScene),
        angular.bind(this, this.errorResponse));
  }

  // TODO should hide this floor if/when a background loads?
  var component = {
    type: 'floor',
    floorURL: '/static/floor-grad-logo.jpg'
  }
  this.director.loadFloor({Initialise: function(object) {
    if (this.director.background) {
      // Don't add the floor if there is already a background.
      return;
    }
    this.floor = object;
    this.director.threeScene.add(object);
    object.quaternion.setFromAxisAngle( new THREE.Vector3( 1, 0, 0 ), -Math.PI / 2 );
    object.scale.multiplyScalar(12.5);
    this.director.requiresRender = true;
  }.bind(this)}, component);

  // For player.html support which is also used by player.js.
  this.video = this.scene;

  $('#canvas').replaceWith(director.player.canvas);

  this.totalLength = this.director.totalLength;
  this.currentTime = this.director.currentTime;

  // Set some default settings for the controls.
  // TODO should load this from each scene.
  this.controls.rotateSpeed = .2;
  this.controls.panBounded = true;
  this.controls.panBoundsMin = new THREE.Vector3(-1.00, 0, -1.00);
  this.controls.panBoundsMax = new THREE.Vector3(1.00, 2.0, 1.00);
  this.controls.maxDistance = 5.00;
  this.controls.minDistance = 2.00;
  // TODO panning should be 3d instead of just x,y.
  // TODO add support of bounds on camera as well?
  // It should prevent panning + rotation which takes it out of the bounds?

  if (window.orientation !== undefined) {
    this.device_controls = new THREE.DeviceOrientationControls(this.camera, this.controls.target, {
      controls: this.controls
    });
    // TODO should this be an optional control?
    this.device_controls.connect();
    this.controls.noTouch = true;
    director.registerUpdatable(this.device_controls);
  } else {
    // show the mouse help hint to encourage interaction.
    this.player_help = true;
    var hidePlayerHelp = angular.bind(this, function() {
      // Hide the player help icon after the first interaction.
      this.player_help = false
    });
    document.addEventListener('mousedown', hidePlayerHelp, true);
    document.addEventListener('touchstart', hidePlayerHelp, true);
  }

  // 10 seconds initially, this will drop if the user interacts, see below.
  this.hideControlsAtTime = Date.now() + 10000;
  var showControls = angular.bind(this, function() {
    this.hiddenControls = false;
    this.hideControlsAtTime = Date.now() + 2000;
  });
  // Show controls again when a user moves the mouse or touches the screen.
  document.addEventListener('mousedown', showControls, true);
  document.addEventListener('mousemove', showControls, true);
  document.addEventListener('touchmove', showControls, true);
  this.controls.movedCB = showControls;
  // Check every second to see if the controls should be hidden.
  $interval(angular.bind(this, function() {
    if (Date.now() > this.hideControlsAtTime) {
      this.hiddenControls = true;
    }
  }), 1000);

  // Can't use angular key listener as this needs to be on the entire window.
  window.addEventListener( 'keydown', angular.bind(this, function(event) {
    if (event.keyCode == 32 /* Spacebar */) {
      event.preventDefault();
      this.director.togglePlay();
      this.$scope.$apply();
    }
  }));
  this.controls.onTapped = angular.bind(this, function() {
    this.director.togglePlay();
    showControls();
    this.$scope.$apply();
  });
  this.setupFullscreen();
  director.registerUpdate(angular.bind(this, this.update));
}

PlayController.prototype.update = function(time) {
  var percent = 0;
  if (this.director.totalLength) {
    percent = 100 * this.director.downloadedLength / this.director.totalLength;
  }
  if (percent != this.progress) {
    this.progress = percent;
    this.$scope.$apply();
  }

  if (this.totalLength != this.director.totalLength) {
    this.totalLength = this.director.totalLength;
    this.$scope.$apply();
  }

  if (this.currentTime != this.director.currentTime) {
    this.currentTime = this.director.currentTime;
    this.$scope.$apply();
  }
}

PlayController.prototype.loadScene = function(scene) {
  if (!scene.scene_data) {
    scene.scene_data = {
      sceneObjects: scene.sceneObjects
    }
  }
  this.director.loadScene(scene.scene_data);

  if (this.director.background) {
    // If the scene has a background remove the default floor.
    this.director.threeScene.remove(this.floor);
  }

  if (scene.id) {
    // Track on GA and through watch count.
    ga('send', 'event', 'Scene', 'View', this.scene.id);
  } else {
    console.warn('No key for loaded scene', scene);
  }
}

PlayController.prototype.onTimelineClicked = function(event) {
  var proportion = event.layerX / event.currentTarget.clientWidth;
  this.director.seek(proportion * this.director.totalLength);
}

PlayController.prototype.mousemoved = function(event) {
  this.jumpTo = parseFloat((event.layerX / event.currentTarget.clientWidth).toFixed(2))
}

PlayController.prototype.exitHandler = function() {
  this.isFullscreen = document.webkitIsFullScreen;
  this.isFullscreen |= document.mozFullScreen;
  // Not tested on IE.
  this.isFullscreen |= document.msFullscreenElement;
  this.$scope.$apply();
};

PlayController.prototype.play = function() {
  this.director.play();
};

PlayController.prototype.pause = function() {
  this.director.pause();
}

PlayController.prototype.seek = function(event) {
  var width = $('.progress')[0].clientWidth;
  this.pause();

  var proportion = event.offsetX / width;
  if (event.offsetX < 5) {
    // Less than 10 pixels from the beginning, we assume they want the start.
    proportion = 0;
  }
  this.director.seek(proportion * this.director.totalLength);
}

PlayController.prototype.loop = function() {
  this.director.toggleLoop();
  this.looping = this.director.looping;
}

PlayController.prototype.toggleMute = function() {
  this.muted = !this.muted;
  this.director.mute(this.muted);
}

PlayController.prototype.toggleTouch = function() {
  this.touchAllowed = !this.touchAllowed;
  if (this.touchAllowed) {
    // Disable orientation, use touch instead.
    this.device_controls.disconnect();
    this.controls.noTouch = false;
  } else {
    // Enable orientation, disable touch.
    this.device_controls.connect();
    this.controls.noTouch = true;
  }
}

PlayController.prototype.setupFullscreen = function() {
  this.fullscreenElement = $('.video_player')[0];
  // add a method for requestFullScreen and exitFullScreen.
  var exitFullScreen = document['cancelFullScreen'] ||
      document['mozCancelFullScreen'] ||
      document['webkitCancelFullScreen'] ||
      document['msExitFullscreen'] ||
      document['exitFullscreen'] ||
      function() {};
  this.fullscreenElement.exitFullScreen = exitFullScreen.bind(document);

  this.fullscreenElement.requestFullScreen = this.fullscreenElement['requestFullScreen'] ||
      this.fullscreenElement['mozRequestFullScreen'] ||
      this.fullscreenElement['msRequestFullscreen'] ||
      (this.fullscreenElement['webkitRequestFullScreen'] ? angular.bind(this, function () {
          this.fullscreenElement['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT'])
      }) : null);

  // Register to listen for full screen changes.
  var exitHandler = angular.bind(this, this.exitHandler);
  document.addEventListener('webkitfullscreenchange', exitHandler);
  document.addEventListener('mozfullscreenchange', exitHandler);
  document.addEventListener('fullscreenchange', exitHandler);
  document.addEventListener('MSFullscreenChange', exitHandler);

  if (!this.fullscreenElement.requestFullScreen) {
    // Shitty apple devices can't handle full screen.
    // We will have to hack it.
    this.fullscreenElement.requestFullScreen = angular.bind(this, function() {
      $(this.fullscreenElement).addClass('fullscreen_hack');
      this.$timeout(angular.bind(this, function() {
        this.director.player.resize();
      }), 0);
    });

    this.fullscreenElement.exitFullScreen = angular.bind(this, function() {
      // Remove the hack class we have to add on apple devices which can't handle fullscreen.
      $(this.fullscreenElement).removeClass('fullscreen_hack');
      this.director.player.disableCardboard();
      this.director.player.resize();
    });
  }
}

PlayController.prototype.onFullscreenClicked = function() {
  console.log(this.isFullscreen);
  if (this.isFullscreen) {
    this.exitFullscreen();
  } else {
    this.fullscreen();
  }
};

// TODO allow this method to get called by an ios user?
// Change controls to be on an auto hide/show system.
PlayController.prototype.exitFullscreen = function() {
  if (this.device_controls) {
    this.controls.noTouch = !this.touchAllowed;
  }
  this.fullscreenElement.exitFullScreen();
  this.cardboard = false;
  this.isFullscreen = false;
}

/* Called when the user exits fullscreen without using the button we offer. */
PlayController.prototype.exitHandler = function() {
  this.isFullscreen = document.webkitIsFullScreen;
  this.isFullscreen |= document.mozFullScreen;
  // Not tested on IE.
  this.isFullscreen |= document.msFullscreenElement;
  if (!this.isFullscreen) {
    this.director.player.disableCardboard();
    this.cardboard = false;
    this.director.player.resize();
    this.$scope.$apply();
  } else {
    // The screen changed into fullscreen, nothing to do.
  }
};

PlayController.prototype.fullscreen = function() {
  this.fullscreenElement.requestFullScreen();
  // Always allow touch in full screen, as scrolling isn't an issue.
  this.controls.noTouch = false;
  this.isFullscreen = true;
}

PlayController.prototype.enableCardboard = function(force) {
  if (this.cardboard) {
    // Already in cardboard mode.
    return;
  }
  if (!force && !this.device_controls) {
    // Cardboard mode won't work without these controls.
    this.showCardboardWarning = true;
    this.url = window.location.hostname + window.location.pathname;
    // Hide warning after 5 seconds.
    this.$timeout(angular.bind(this, function() {
      this.showCardboardWarning = false;
    }), 5000);
    return;
  }
  this.showCardboardWarning = false;

  this.fullscreen();

  this.director.player.enableCardboard();
  this.cardboard = true;
}

PlayController.prototype.errorResponse = function(response) {
  // All man made server errors should have a list of error strings.
  // TODO use a better structure to indicate what field caused the error?
  if (!response.data) {
    // Happens if cross origin policy is not set correctly.
    this.errors = {'unknown': 'Sorry, an unknown error occurred.'};
    this.showErrors = true;
    return;
  }
  if (response.status == 404) {
    this.video = {
      'name': 'Not found',
      'description': 'The video with this id could not be found',
    }
    // TODO show a nicer error?
    // TODO should hide share buttons?
    return;
  }
  if (response.data.errors) {
    this.errors = {}
    var count = 0;
    angular.forEach(response.data.errors, function(error) {
      if (error.path) {
        key = error.path[0] || count++;
        this.errors[key] = error.message;
      } else {
        key = count++;
        this.errors[key] = error;
      }
    }, this);
    console.log(this.errors);
    this.showErrors = true;
    console.warn('save error', response.data.errors);
    return;
  }

  // There was no errors field in the response which is not really expected.
  // It can happen for 404's though and we should handle it as best we can.
  this.errors = {'unknown': response.status + ' - ' + response.statusText}
  this.showErrors = true;
  console.error('error', response.data)
}

var PlaylistController = function(config, playerService, $location, $resource, $rootScope, $routeParams) {
  this.$location = $location;
  this.$rootScope = $rootScope;
  this.config = config;
  this.current = $routeParams.id;

  if ($routeParams.id && $routeParams.id.length> 4) {
    // Looks like a new uuid which we suppport for related.
    this.Related = $resource(config.API_URL + '/api/v2/scene/:scene_id/related', {
      'scene_id': $routeParams.id,
    });
    this.Related.get(function(response) {
      this.scenes = response.scenes;
    }.bind(this));
  } else {
    // No related content becuase it uses a scene_key which is deprecated.
  }
}

PlaylistController.prototype.playNow = function(scene) {
  // Update the page title to the next video before re routing.
  // For better google analytics with accurate titles.
  this.$rootScope.title = scene.title;
  this.$location.path(scene.id);
}

angular.module('sceneControl', [
  'config',
  'ngRoute',
  'ngResource',
  'player2Service',
])
.controller('PlayController', PlayController)
.controller('PlaylistController', PlaylistController)
.config(function($httpProvider) {
  $httpProvider.interceptors.push('AuthInterceptor');
})
.factory('AuthInterceptor', function ($injector, $q) {
  return {
    response: function(response) {
      if (response.data.data) {
        // Handle API's which always return json with a data object.
        return $q.resolve({
          data: response.data.data
        })
      }
      return response;
    },
  }
})
.filter('secondsToHms', function() {
  return function(d) {
    d = Number(d);
    var h = Math.floor(d / 3600) || 0;
    var m = Math.floor(d % 3600 / 60) || 0;
    var s = Math.floor(d % 3600 % 60) || 0;
    var result = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    if (h) {
      // Add hours if they exist.
      h + ":" + result;
    }
    return result;
  };
})
.run(function($location, $rootScope, config) {
  // variables on $rootScope will be available for reading from all $scopes
  // through scope inheritance.
  $rootScope.config = config;
  $rootScope.api_url = config.API_URL;
  $rootScope.$on('$routeChangeSuccess', function (event, current, previous) {
    ga('set', 'location', $location.absUrl());
    ga('send', 'pageview', {
      page: '/scene' + $location.path()
    });
  });

  // Register for sentry exceptions.
  // TODO should only do this in staging/prod.
  if (window.Raven) {
    Raven.config('https://96573b4e47af42738ba114888b017d7f@sentry.io/198578').install()
  }
})
.factory("$exceptionHandler", function( config, $log, $window) {
  return function log( exception, cause ) {
    // Regular angular error log.
    console.error(exception.stack);
    $log.error.apply( $log, arguments );

    // TODO reduce repeated error noise?
    // Could be as easy as only reporting once per js load?
    if (window.Raven) {
      Raven.captureException(exception);
    }
  };
})
;

// The routes for scenePlayer under /scene/
angular.module('scenePlayer', [
  '8iTemplate',
  'sceneControl',
])
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
      .when('/:id', {
        // We can reuse the player UI.
        // Just need to make sure our controller handles the same stuff.
        templateUrl: '/static/8i/scene_player/player.html',
      })
      .otherwise({
        templateUrl: '/static/8i/scene_player/player.html'
      })
})
;

// The routes for embedded scene player under /es/
angular.module('sceneEmbedPlayer', [
  'sceneControl',
])
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
      .when('/:id', {
        // We can reuse the player UI.
        // Just need to make sure our controller handles the same stuff.
        templateUrl: '/static/8i/scene_player/embed.html',
      })
      .otherwise({
        templateUrl: '/static/8i/scene_player/embed.html'
      })
})
;


// The routes for embedded scene player under /es/
angular.module('webviewPlayer', [
  'sceneControl',
])
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
      .when('/:id', {
        // We can reuse the player UI.
        // Just need to make sure our controller handles the same stuff.
        templateUrl: '/static/angular/webview/uiwebview.html',
      })
})
;
