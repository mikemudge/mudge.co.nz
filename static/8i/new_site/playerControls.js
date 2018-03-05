
EightI.Env.registerFileURL("eighti.lib.js.mem", "/static/js/eighti/eighti.lib.js.mem");

/**
 * A service which represents a volumetric video player (3d rendered canvas)
 * Can contain multiple controllers for a single instance so all state should be
 * kept on this.
 * @deprecated - Used by the create page (Chuuwee).
 */
var PlayerService = function($rootScope) {
  this.rootScope = $rootScope;

  window.addEventListener('resize', angular.bind(this, this.resize));

  this.canvas = document.getElementById('canvas');
  if (!this.canvas) {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('id', 'canvas');
    document.body.appendChild(this.canvas);
  }
  this.canvas.style.visibility = 'hidden';

  this.viewportChanged = true;
}

PlayerService.BUFFER_TIME = 4.0;

PlayerService.prototype.setAsset = function(assetInfo) {
  this.assetInfo = assetInfo;
  return this;
}

PlayerService.prototype.load = function(loadCallback) {
  if (this.loadCallback && this.initialised) {
    console.log("second load call.");
    this.cleanup();
    // TODO Clean up some memory?
    // Or don't recreate threejs stuff, just update?
    // TODO just change assets if load is called again?
  }

  this.startLoadTime = Date.now();
  if (ga) {
    // Value of 0 because we don't have another time to compare with yet.
    ga('send', 'event', 'Timing', 'Chuuwee(Create)', 'start_load', 0);
  }

  var znear = 1;
  var zfar = 4000;
  var fov = 60;
  this.camera = new THREE.PerspectiveCamera(fov, this.width / this.height, znear, zfar);

  this.threeScene = new THREE.Scene();

  this.webglRenderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: this.canvas,
    alpha: true,
  });
  this.webglRenderer.setPixelRatio(window.devicePixelRatio);
  this.webglRenderer.setSize(this.width, this.height, true);
  this.webglRenderer.shadowMap.enabled = false;
  this.webglRenderer.shadowMap.cullFace = THREE.CullFaceBack;
  this.webglRenderer.autoClear = false;

  this.webglRenderer.setClearColor(0xFFFFFF, 0);

  var controlElem = $('.player')[0];
  controlElem.appendChild(this.canvas);

  this.controls = new window.EightIControls(this.camera, controlElem);
  this.controls.movedCB = angular.bind(this, function() {
    // If the controls move then the view needs an update.
    this.viewportChanged = true;
    // Disable autoRotate after any movement.
    this.controls.autoRotate = false;
  });

  this.looping = true;
  // Sets up width, height, camera aspect ratio etc.
  this.resize();

  this.player = new EightI.Player(this.canvas, this.webglRenderer.context);

  this.loadCallback = loadCallback || function() {};

  if (EightI.Env.is_initialised) {
    // start right away because everything is available.
    this.complete_();
  } else {
    // Otherwise use the ready callback which will happen once everything is available.
    this.player.onReady = angular.bind(this, this.complete_);
  }
}

PlayerService.prototype.complete_ = function() {
  this.viewport = new EightI.Viewport();
  this.frameBuffer = new EightI.FrameBuffer({'object': 0});
  this.viewport.setFrameBuffer(this.frameBuffer);

  this.player.addViewport(this.viewport);

  this.initialised = true;

  this.canvas.style.visibility = 'visible';

  if (this.assetInfo) {
    if (this.assetInfo.dah) {
      this.getRepresentations(this.assetInfo);
      // Use the first representation in the list by default.
      this.changeRepresentation(this.representations[0]);
    } else {
      // This is not ideal, assetInfo can be an asset(from db/server) or a
      // representation(hvr url + framerate etc)
      this.changeRepresentation(this.assetInfo);
    }
  } else {
    console.warn('No asset set for loading');
  }

  // By calling this here we can guarantee that all the above values are always set.
  this.animate = function() {
    if ($('#canvas').length > 0) {
      window.requestAnimationFrame(this.animate);
      this.update();
    } else {
      // canvas was removed from the page so stop updating.
    }
  }.bind(this);

  this.animate();
  this.loadCallback({'success': true});
}

PlayerService.prototype.getRepresentations = function(asset) {
  var dah = new EightI.DAHParser();
  dah.dah = asset.dah;
  var numRepresentations = dah.numRepresentations(0, 'hvr_stream');
  this.representations = [];
  for (r = 0; r < numRepresentations; r++) {
    this.representations.push(dah.getRepresentation(0, 'hvr_stream', r));
  }
  return this.representations;
}

PlayerService.prototype.update = function () {
  this.controls.update();

  if (this.threeScene.effects) {
    this.threeScene.effects.update();
  }

  if (!this.asset) {
    throw "Don't call update or run before this.asset is set."
  }

  var bufferDuration = this.asset.getBufferEndPoint();
  // Hack to display the first loaded frame, should be removed when event systems goes in.
  if(!this.firstFrameDisplayed && bufferDuration > 0.0) {
      this.viewportChanged = true;
      this.firstFrameTime = Date.now();
      if (ga) {
        // Value of 0 because we don't have another time to compare with yet.
        ga('send', 'event', 'Timing', 'Chuuwee(Create)', 'frame_rendered', this.firstFrameTime - this.startLoadTime);
      }
      this.firstFrameDisplayed = true;
  }

  // When playing a video we need to watch the buffer
  var currentTime = this.asset.getCurrentTime();
  if (this.isPlaying) {
      if (bufferDuration <= currentTime && !this.isBuffering) {
          // pause if the buffer runs out.
          this.asset.pause();
          this.isBuffering = true;
      } else if (bufferDuration > currentTime && this.isBuffering) {
          // play if the buffer becomes available.
          this.asset.play();
          this.isBuffering = false;
      }
  }
  // Inform the player how much time has passed.
  var now = Date.now() * 0.001;
    if (window.performance) {
        // Use performance when available.
        now = window.performance.now() * 0.001
    }
  this.player.update(now);

  // Don't know what this code does or why its here so commenting it out.
  // if (this.camera.parent === undefined ) {
  //   this.camera.updateMatrixWorld();
  // }
  this.camera.matrixWorldInverse.getInverse(this.camera.matrixWorld);

  var duration = this.asset.getDuration();
  // Initially duration is set to 0 for a few cycles.
  // TODO maybe ignore updates if duration <= 0?
  if (duration > 0.0) {
    if (duration != this.totalLength) {
      // Only want to set this once
      if (this.totalLength != duration) {
        this.totalLength = duration;
        // Update all the controllers views using the length state.
        this.rootScope.$apply();
      }
    }
  }

  // Go back to the start once the end of the video is reached.
  if (duration > 0.0 && currentTime >= duration) {
    this.asset.seek(0);
    this.viewportChanged = true;
    if (this.isLooping()) {
      // The asset appears to auto stopped at the end so play it again for loop.
      this.asset.play();
    } else {
      this.playbackStopped();
      this.isPlaying = false;
      this.player.garbageCollect();
    }
  }

  // Update the viewport/frameBuffer.
  if (this.viewport.isValid()) {
      this.viewportChanged |= this.viewport.setViewMatrix(this.camera.matrixWorldInverse);
      this.viewportChanged |= this.viewport.setProjMatrix(this.camera.projectionMatrix);
      this.viewportChanged |= this.viewport.setNearFarPlane(this.camera.near, this.camera.far);
      this.viewportChanged |= this.viewport.setDimensions(0, 0, this.width * window.devicePixelRatio, this.height * window.devicePixelRatio);
      this.frameBuffer.setSize(new THREE.Vector2(this.width, this.height));
  } else {
      this.viewportChanged = true;
  }

  this.player.prepareRender();

  // Render the asset when applicable.
  if ((this.isPlaying && !this.isBuffering) || this.viewportChanged) {
    this.webglRenderer.clear(true, true, true);
    this.player.render();
    this.webglRenderer.resetGLState();
    this.webglRenderer.render(this.threeScene, this.camera);
    // Viewport was just updated, so there is no changes.
    this.viewportChanged = false;
  }

  // Update play percent.
  // TODO should update play time separately?
  var playPercent = (currentTime / duration) * 100;
  playPercent = Math.min(100, Math.max(0, playPercent));
  var percent_int = playPercent.toFixed(2);
  if (this.playback != playPercent) {
    this.playback = playPercent;
    // Update all the controllers views using the playback state.
    this.attemptApply();
  }

  // Update buffer percent?
  if(duration > 0.0) {
    var partialDuration = this.asset.getPartialBufferDuration();
    var bufferPercent = ((bufferDuration + partialDuration) * 100 / duration);
    bufferPercent = Math.min(100, Math.max(0, bufferPercent));
    if (bufferPercent > 0) {
      bufferPercent = bufferPercent.toFixed(2);
      if (this.progress != bufferPercent) {
        this.progress = bufferPercent;
        // Update all the controllers views using the progress state.
        if (this.progress == 100) {
          this.completeLoadTime = Date.now();
          if (ga) {
            ga('send', 'event', 'Timing', 'Chuuwee(Create)', 'video_load', this.completeLoadTime - this.startLoadTime);
          }
          this.play();
        }
        this.rootScope.$apply();
      }
    } else {
      // Nothing loaded? seems to occur immediately after seek.
    }
  }
};

PlayerService.prototype.resize = function() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.webglRenderer.setSize(this.width, this.height, true);

    this.viewportChanged = true;

    if (this.threeScene.effects) {
      this.threeScene.effects.resize(this.width, this.height);
    }
};

PlayerService.prototype.changeRepresentation = function(representation) {
  console.log('loading asset', representation);
  var asset = new EightI.Asset(
      representation.url,
      representation.framerate || 15,
      PlayerService.BUFFER_TIME);

  var actor = new EightI.Actor();
  actor.setVisible(true);
  actor.setAsset(asset);

  var matrix = new THREE.Matrix4();
  // TODO do we need to support dah transformations?
  actor.setTransform(matrix);
  this.scene = new EightI.Scene();
  this.scene.attachActor(actor);
  this.player.setScene(this.scene);

  this.viewportChanged = true;
  this.firstFrameDisplayed = false;
  this.asset = asset;
}

PlayerService.prototype.cleanup = function() {
  this.player.garbageCollect();
  if (this.scene) {
    this.scene.destroy();
    this.scene = null;
  }
}

PlayerService.prototype.loop = function() {
  this.looping = !this.looping;
}

PlayerService.prototype.isLooping = function() {
  return this.looping;
}

PlayerService.prototype.seek = function(proportion) {
  var time = this.asset.getDuration() * proportion;
  this.viewportChanged = true;
  this.asset.seek(time);
}

PlayerService.prototype.play = function() {
  if (this.asset) {
      this.asset.play();
  }
  this.isPlaying = true;
}

PlayerService.prototype.pause = function() {
  if (this.asset) {
    this.asset.pause();
  }
  this.isPlaying = false;
}

/**
 * Called when the video is completed and will not play again.
 */
PlayerService.prototype.playbackStopped = function() {
  this.player.isPlaying = false;
  // Update all the controllers views using the isPlaying state.
  this.rootScope.$apply();
}

PlayerService.prototype.exitHandler = function() {
  this.fullScreen = document.webkitIsFullScreen;
  this.fullScreen |= document.mozFullScreen;
  // Not tested on IE.
  this.fullScreen |= document.msFullscreenElement;
  this.attemptApply();
};

PlayerService.prototype.attemptApply = function() {
  if (!this.rootScope.$$phase) {
    this.rootScope.$apply();
  }
}

angular.module('playerService', [])
    .service('playerService', PlayerService)
