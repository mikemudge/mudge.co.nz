var sortAlpha = function(a, b) {
  var nameA = a.name.toUpperCase(); // ignore upper and lowercase
  var nameB = b.name.toUpperCase(); // ignore upper and lowercase
  return compare(nameA, nameB);
};

var compare = function(nameA, nameB) {
  if (nameA < nameB) {
    return -1;
  }
  if (nameA > nameB) {
    return 1;
  }

  // names must be equal
  return 0;
};
var Timeline = function(director, $scope) {
  this.director = director;

  // For the timelines we define a set of times.
  // timeScale is the px per second for the timeline.
  // TODO there could easily be a better way to represent this.
  this.timeScales = [400, 250, 200, 125, 100, 50, 20];
  this.scaleLevel = this.timeScales.indexOf(200);
  this.update();

  this.timesStart = 0;
  $('.scroll_outer').scroll(angular.bind(this, function(event) {
    // Keep the time numbers in sync by updating them when a scroll happens.
    this.timesStart = event.target.scrollLeft;
    this.timesTop = event.target.scrollTop;
    $scope.$apply();
  }));
  // TODO do we need to remove the scroll listener?
}

// Called if scaleLevel changes or director length changes.
// Recalculates all the pieces.
Timeline.prototype.update = function() {
  this.timeScale = this.timeScales[this.scaleLevel];
  this.length = (this.director.totalLength + 2) * this.timeScale;
  this.times = this.calculateTimes();
  // The length is 2 seconds longer than the director, to allow for growth.

  // If needed the frameScale.
  this.frameScale = this.timeScale / 10;
}

// Figures out how many times we need to render to cover the total length.
// Uses timeScale as the number of px/s.
Timeline.prototype.calculateTimes = function() {
  // TODO template uses frameScale a bit.
  var timeScale = this.timeScale;
  var numberRequired = Math.floor(this.length / 100);
  return Array.apply(null, Array(numberRequired + 1)).map(function (_, i) {
    if (i == 0) {
      // Skip time 0.
      return;
    }
    // These numbers are displayed 100px apart currently.
    // This should be changed so that a nice number of millis is always used?
    // millis/100px = (1 / 20f/s) * 10f * 1000ms/s
    return i * 100 / timeScale;
  });
}

Timeline.prototype.getFrameForPixel = function(pixels) {
  var frame = Math.round((pixels + this.timesStart) * 10 / this.timeScale);
  // Restrict the frame to max at 20 more than the total?
  // TODO do we still need this?
  frame = Math.min(frame, this.director.totalFrames + 20);
  return frame;
}

var SceneService = function($resource) {
  this.Scene = $resource(config.API_URL + '/api/v2/scene/:id', {'id': '@id'}, {
    'copy': {
      'method': 'POST',
      'url': config.API_URL + '/api/v2/scene/d/:key/copy'
    },
    'getMine': {
      'method': 'GET',
      'isArray': true,
      'url': config.API_URL + '/api/v2/scene/d/getMine'
    }
  });
}
var DirectorController = function(
    config, director, $interval, $location, $resource,
    $routeParams, $scope, $timeout, $window, sceneService) {
  this.$scope = $scope;
  this.config = config;
  this.$location = $location;
  this.$timeout = $timeout
  window.ctrl = this;
  this.currentPage = $location.absUrl();
  this.director = director;

  this.threeScene = director.threeScene;
  this.controls = director.controls;
  this.camera = director.camera;
  this.autoSaving = false;
  this.frame = 0;
  this.lastSaveTime = Date.now();
  this.textureColor = '#FFFFFF';

  // Show a grid floor.
  this.grid = new THREE.GridHelper( 15, 1 );
  // Scale it down so we can use an int size, otherwise summing get weird.
  this.grid.scale.set(0.2, 0.2, 0.2);
  // 15 * .2 = 3 which is the maximum size, see updatePosition in OBJObject.
  this.grid.setColors (0x888888, 0x444444)
  this.grid.material.linewidth = 2;
  this.grid.position.y = 0.0001;
  // this.grid.material.opacity = .4;
  this.grid.material.transparent = true;
  this.threeScene.add(this.grid);

  this.axes = buildAxes(10);
  // Initially start hidden.
  this.axes.visible = false;
  this.threeScene.add(this.axes);
  this.sharing = {};

  $scope.$on('$destroy', angular.bind(this, function() {
    // Clean up behind yourself.
    // Otherwise when the page changes route we will create duplicates of these.
    // TODO can we put some of director into a singleton service?
    this.threeScene.remove(this.grid);
    this.threeScene.remove(this.axes);
    this.directorControl.destroy();
    $window.onbeforeunload = function() {}
  }));
  $window.onbeforeunload = angular.bind(this, function(e) {
    console.log('leaving this page?');
    if (!this.autoSaveChanged) {
      // It doesn't look like anything has changed.
      // We don't need to warn the user that their changes will be lost.
      return;
    }
    e.preventDefault();
    return true;
  });

  // This allows users to move the OBJObject's around.
  this.directorControl = new Director3dControl(this.camera, this.controls, director);

  this.keyMap = {
    LEFT: 37,
    RIGHT: 39,
    SPACE: 32
  };
  var stop = $interval(function() {
    $('#focus').focus();
    // Repeat until the element is focused.
    if ($('#focus')[0] == document.activeElement) {
      $interval.cancel(stop);
    }
  }, 50); // Needs to wait a little bit inorder for auto focus to work.

  this.directorControl.moveFinishedCB = angular.bind(this, function() {
    this.autoSave();
  });
  this.directorControl.selectObjectCB = angular.bind(this, function(object) {
    if (this.director.isPlaying) {
      this.onPauseClicked();
    }
    if (object.components[0].textureColor) {
      this.textureColor = object.components[0].textureColor;
    }
    // When an object is selected we need to render the helper.
    this.requireRender(false)
  });
  // Called when playback of a scene completes (reaches total length without looping)
  this.director.onPlaybackComplete = angular.bind(this, function() {
    this.directorControl.enabled = true;
  });

  this.Scene = sceneService.Scene;
  if (!$routeParams.scene_id) {
    this.scene = new this.Scene();
    // To make sure the template is displayed.
    this.scene.$resolved = true;
    // Clear any objects.
    this.director.reset();
    this.sky = this.director.sky;
  } else {
    this.scene = this.Scene.get(
        {id: $routeParams.scene_id},
        angular.bind(this, this.loadScene),
        angular.bind(this, this.errorResponse));
    this.prepareToShare($routeParams.scene_id);
  }

  // Disable keys in controls as we want to use them on the inputs only.
  this.controls.noKeys = true;
  this.controls.rotateSpeed = .2;
  // Max zoom distances.
  this.controls.minDistance = 1;
  this.controls.maxDistance = 40;

  $('#canvas').replaceWith(director.player.canvas);

  this.currentUser = {
    'email': 'fakingit'
  }
  // this.currentUser = loginService.user8i;
  // if (!loginService.requireLogin()) {
  //   // Don't load any thing.
  //   return;
  // }

  // TODO need to load some fakes here?
  this.Components = $resource(config.API_URL + '/api/v2/director/components/:scene_id', {
    scene_key: $routeParams.eid
  })
  this.components = this.Components.get().$promise.then(function(components) {
    this.audios = components.audios;
    this.backgrounds = components.backgrounds;
    this.experiences = components.experiences;
    this.objs = components.objs;

    // Sort everything so its easier to find?
    this.backgrounds.sort(function(a, b) {
      return compare(a.textureFile.name.toUpperCase(), b.textureFile.name.toUpperCase());
    });
    this.experiences.sort(function(a, b) {
      return compare(a.title.toUpperCase(), b.title.toUpperCase());
    });
    this.objs.sort(sortAlpha);
  }.bind(this));

  this.totalLength = this.director.totalLength;
  this.totalFrames = this.director.totalFrames;
  this.playbackTime = this.director.currentTime;

  this.timeline = new Timeline(this.director, $scope);

  director.registerUpdate(angular.bind(this, this.update));

  // Incase this is a second or third controller.
  this.director.requiresRender = true;

  // CognitoToken = $resource(config.API_URL + '/admin/api/v1/cognito-token');
  // this.cognitoInfo = CognitoToken.get(function(response) {
  //   response.path = this.scene.s3_base_path;
  // }.bind(this));
}

DirectorController.prototype.keyDown = function($event) {
  var tag = '';
  if ($event.target) {
    tag = $event.target.tagName;
  }
  if (tag) {
    tag.toLowerCase();
  }
  if (tag == 'input' || tag == 'textarea') {
    // Ignore key controls when typing into an input or textarea.
    return;
  }

  if ($event.keyCode == this.keyMap.LEFT) {
    // scrub left
    this.seekFrame(Math.max(this.director.currentFrame - 1, 0));
  }
  if ($event.keyCode == this.keyMap.RIGHT) {
    // scrub right
    this.seekFrame(Math.min(this.director.currentFrame + 1, this.director.totalFrames));
  }
  if ($event.keyCode == this.keyMap.SPACE) {
    this.director.togglePlay();
  }
}

DirectorController.prototype.changeToTab = function(name) {
  this.$scope.tab = name;
  // Show the target point when on the camera tab.
  this.axes.visible = name == 'Camera';
  this.director.requiresRender = true;
}

DirectorController.prototype.toggleGrid = function() {
  this.grid.visible = !this.grid.visible;
  this.director.requiresRender = true;
}

DirectorController.prototype.toggleAxes = function() {
  this.axes.visible = !this.axes.visible;
  this.director.requiresRender = true;
}

DirectorController.prototype.onPreviousClicked = function() {
  this.seekFrame(Math.max(0, this.frame - 1));
};

DirectorController.prototype.onNextClicked = function() {
  this.seekFrame(Math.min(this.director.totalFrames + 20, this.frame + 1));
};

DirectorController.prototype.onPlayClicked = function() {
  // Clear any control helpers before playing.
  this.directorControl.reset();
  // Prevent any director controls while playing.
  this.directorControl.enabled = false;
  // Close the current sidebar tab
  this.changeToTab('');
  this.director.play();
};

DirectorController.prototype.onPauseClicked = function() {
  this.director.pause();
  // Prevent any director controls while playing.
  this.directorControl.enabled = true;
}

DirectorController.prototype.onLoopClicked = function() {
  this.director.toggleLoop();
}

DirectorController.prototype.prepareToShare = function(id) {
  this.sharing.url = window.location.origin + '/scene/' + id;
  window.twttr.ready(angular.bind(this, function() {
    // replace dynamically added buttons.
    twttr.widgets.load();
    window.twttr.widgets.createShareButton(
        this.sharing.url,
        document.getElementById("tweet-container"),
        {
          // TODO should we update these?
          size: "large",
          related: "twitterapi,twitter",
          text: "This Scene is awesome",
          hashtags: ""
        });
  }));

  // If we use the existing facebook button on the page we will need reload it to be 100% it's there.
  window.FB2.ready(function() {
    FB.XFBML.parse();
  });
};
DirectorController.prototype.shareFacebook = function() {
  if (!this.scene.id) {
    alert("You need to save your scene before you can share it");
    return;
  }
  var share_url = window.location.origin + '/scene/' + this.scene.id;
  FB.ui({
    method: 'share',
    mobile_iframe: true,
    href: share_url,
  }, function(response) {
    if (response) {
      console.warn('FB share response', response);
    }
  });
}

DirectorController.prototype.showMyScenes = function() {
  if (!this.myScenes) {
    // Load once.
    this.myScenes = this.Scene.getMine(this.loginService.user);
  }
  this.showScenes = true;
}

DirectorController.prototype.requireRender = function(autoSave) {
  if (autoSave === undefined) {
    // Default to auto save, but allow overriding when its not required.
    autoSave = true;
  }
  this.director.requiresRender = true;
  if (autoSave) {
    // This seems like a good a time as any to indicate that something has changed?
    this.autoSave();
  }
}

DirectorController.prototype.update = function(time) {
  if (this.totalLength != this.director.totalLength) {
    this.timeline.update();
    this.totalLength = this.director.totalLength;
    this.totalFrames = this.director.totalFrames;

    this.$scope.$apply();
  }
  if (this.playbackTime != this.director.currentTime) {
    this.playbackTime = this.director.currentTime;
    this.$scope.$apply();
  }
  if (this.director.currentFrame != this.frame) {
    this.frame = this.director.currentFrame;
    this.$scope.$apply();
  }

  this.axes.position.set(
      this.controls.target.x,
      this.controls.target.y,
      this.controls.target.z);

  // directorControl can be hotswapped out so we call update each time instead of registering it
  // as its own updatable.
  return this.directorControl.update(this.director.currentTime);
}

DirectorController.prototype.startSeekNumbers = function($event) {
  var pixels = Math.max($event.offsetX, 0);
  pixels += this.timeline.timesStart;
  this.commonSeekStart(pixels);
}

DirectorController.prototype.startSeek = function($event) {
  var pixels = Math.max($event.offsetX, 0);
  this.commonSeekStart(pixels);
}

DirectorController.prototype.commonSeekStart = function(pixels) {
  this.mouseDown = true;
  var frame = Math.round(10 * pixels / this.timeline.timeScale);
  frame = Math.min(frame, this.director.totalFrames + 20);
  this.what = "seeking"
  this.seekFrame(frame);
}

DirectorController.prototype.startTimeMove = function(object, $event) {
  $event.stopPropagation();
  this.mouseDown = true;
  this.directorControl.selectObject(object);
  this.what = "startTime";
  this.seekFrame(object.startFrame);
}

DirectorController.prototype.endTimeMove = function(object, $event) {
  $event.stopPropagation();
  this.mouseDown = true;
  this.directorControl.selectObject(object);
  this.what = "endTime";
  var frame = Math.min(this.director.totalFrames + 20, object.endFrame || Infinity);
  this.seekFrame(frame);
}

DirectorController.prototype.endMouse = function() {
  this.hoveringFrame = null;

  if (this.mouseDown) {
    this.mouseDown = false;
    // Only do stuff if endMouse comes after a drag?
    if (this.what == "keyFrame") {
      // We can expect this.currentKeyFrame to be set when what=="keyFrame".
      this.seekFrame(this.currentKeyFrame.frameIndex);
    }
    if (this.what == "startTime") {
      this.seekFrame(this.directorControl.selectedObj.startFrame);
    }
    if (this.what == "endTime") {
      // Restrict the time to max at the asset's total length.
      var frame = Math.min(this.directorControl.selectedObj.endFrame, this.director.totalFrames + 20);
      this.seekFrame(frame);
    }
    if (this.what != "seeking") {
      // Moved a keyFrame, startFrame or endFrame so autoSave
      this.autoSave();
    }
    // Just re-render without auto saving.
    this.requireRender(false);
    this.what = null;
  }
}

DirectorController.prototype.mouseMove = function($event) {
  // TODO get controls a better way?
  var leftOffset = $('.controls').width();
  if (!leftOffset) {
    leftOffset = 0;
  }
  // This works for the top, but not for the timelines.
  // leftOffset = $event.currentTarget.offsetLeft;
  var pixels = Math.max($event.clientX + $event.currentTarget.scrollLeft - leftOffset, 0);
  var frame = this.timeline.getFrameForPixel(pixels);
  if (!this.mouseDown) {
    // show hover effect.
    this.hoveringFrame = frame;
    return;
  } else {
    this.hoveringFrame = null;
  }
  // Now we do something different based on where the mousedown started.
  if (this.what == "seeking") {
    // When seeking, nothing is changing.
    this.seekFrame(frame);
    return;
  }

  // Otherwise we are manipulating the selectedObj somehow.
  if (this.what == "endTime") {
    // end frame must be after the start frame.
    frame = Math.max(frame, this.directorControl.selectedObj.startFrame + 1);

    // Don't allow this to be before the last keyFrame's time.
    if (this.directorControl.selectedObj.keyFrames.length > 0) {
      keyFrames = this.directorControl.selectedObj.keyFrames;
      frame = Math.max(frame, keyFrames[keyFrames.length-1].frameIndex + 1);
    }

    this.directorControl.selectedObj.endFrame = frame;
    if (frame >= this.director.totalFrames + 20) {
      // If you reach the end the endTime snaps to Infinity which means it will
      // always be > total length I.E always be present.
      this.directorControl.selectedObj.endFrame = Infinity;
    }
    this.seekFrame(frame);
  } else if (this.what == "startTime") {
    frame = Math.min(frame, this.directorControl.selectedObj.endFrame - 1);

    // Don't allow this to overtake the first keyFrame's time.
    if (this.directorControl.selectedObj.keyFrames.length > 0) {
      frame = Math.min(frame, this.directorControl.selectedObj.keyFrames[0].frameIndex - 1);
    }

    this.directorControl.selectedObj.startFrame = frame;
    this.seekFrame(frame);
  } else if (this.what == "keyFrame") {
    frame = Math.min(frame, this.directorControl.selectedObj.endFrame - 1);
    frame = Math.max(frame, this.directorControl.selectedObj.startFrame + 1);

    this.currentKeyFrame.frameIndex = frame;

    // TODO only need to do this if a keyFrame overtakes another one.
    this.directorControl.selectedObj.SortKeyFrames();
    ;
  } else {
    throw new Error("Unexpected what on mouse move", what);
  }
  // Update the totalFrames of the object if needed.
  this.directorControl.selectedObj.totalFrames = this.directorControl.selectedObj.getTotalFrames();
}

DirectorController.prototype.seekFrame = function(frame) {
  this.frame = frame;
  this.onPauseClicked();
  this.director.seek(frame / 10.0);
  this.playbackTime = this.director.currentTime;
  if (this.directorControl.selectedObj) {
    var keyFrame = this.directorControl.selectedObj.GetKeyFrame(frame);
    if (keyFrame && frame == keyFrame.frameIndex) {
      this.currentKeyFrame = keyFrame;
      this.directorControl.selectedObj.selectedKeyFrame = keyFrame;
    } else {
      this.currentKeyFrame = null;
      this.directorControl.selectedObj.selectedKeyFrame = null;
    }
    if (frame < this.directorControl.selectedObj.startFrame ||
        frame > this.directorControl.selectedObj.endFrame) {
      // frame outside of object lifespan, deselect.
      this.directorControl.selectObject(null);
    }
  }
}

DirectorController.prototype.deleteKeyFrame = function(object, keyFrame) {
  object.deleteKeyFrame(keyFrame);
  // Deselect the keyframe.
  object.selectedKeyFrame = null;
  this.selectObject(object);
}

DirectorController.prototype.selectKeyFrameForMove = function(object, keyFrame) {
  this.what = "keyFrame"
  this.mouseDown = true;
  this.directorControl.selectObject(object);
  this.currentKeyFrame = keyFrame;
  object.selectedKeyFrame = keyFrame;
  this.seekFrame(keyFrame.frameIndex);
}

// Called when ever an objects transform has been changed.
DirectorController.prototype.objectChange = function() {
  var s = this.directorControl.selectedObj.selectedKeyFrame.scale.x;
  s = parseFloat(s.toFixed(2));
  this.directorControl.selectedObj.selectedKeyFrame.scale.x = s;
  this.directorControl.selectedObj.selectedKeyFrame.scale.y = s;
  this.directorControl.selectedObj.selectedKeyFrame.scale.z = s;
  this.requireRender();
}

DirectorController.prototype.loadScene = function(scene) {
  this.director.loadScene(scene.scene_data);

  this.experienceObj = this.director.objects.find(function(obj) {
    return obj.type == 'hvr';
  });

  this.sky = this.director.sky;
  if (scene.thumbnailStatic) {
    this.lastScreenshot = scene.thumbnailStatic;
  }
}

/* User selected new asset. */
DirectorController.prototype.selectAsset = function(experience) {
  if (!experience.component) {
    throw new Error('experience.component is required for use in a scene.')
  }

  component = experience.component;
  // TODO reset will remove all the assets from the player.
  // This works because we only support a single asset at a time.
  if (!this.config.experimental.multipleHVRs) {
    this.director.player.reset();

    // TODO would be better to remove the asset from the player instead of reset.
    // if (this.experienceAsset && object == this.experienceAsset.obj) {
    //   this.player.remove(this.experienceAsset);
    // }

    // Track experience object as we only allow a single one of these currently.
    if (this.experienceObj) {
      this.director.remove(this.experienceObj);
      this.experienceObj = null;
    }
  }

  this.experienceObj = this.loadObject(this.createObject(component, experience.title));
}

DirectorController.prototype.startNewScene = function() {
  this.$location.path('/');
}

// Save a screenshot of the current scene. Can be used as a thumbnail.
// click handler.
DirectorController.prototype.saveScreenshot = function() {
  this.takeScreenshot();
  if (this.errors) {
    // Clear thumbnail error.
    this.errors.thumbnail = null;
  }
  this.$scope.tab = 'Camera';
  if (!this.scene.id) {
    // The scene hasn't been saved yet so we can't upload this yet.
    // TODO should queue it to happen after save.
    console.warn('Screenshot not uploaded, will occur after scene is saved.');
  } else {
    this.uploadScreenshot(angular.bind(this, function() {
      this.autoSave();
    }));
  }
}

DirectorController.prototype.takeScreenshot = function() {
  // Hide the grid so its not in the screenshot.
  var gridV = this.grid.visible;
  this.grid.visible = false;
  var axesV = this.axes.visible;
  this.axes.visible = false;
  this.directorControl.selectObject(null);

  // Set the clear color to transparent.
  this.director.webglRenderer.setClearColor(0x000000, 0);
  // TODO double check the size?
  var imageData = this.director.getScreenshot(300, 200);
  // This is the size for tango, can we get one of those?
  // How do we know if the scene is for tango or not?
  // var imageData = this.director.getScreenshot(380, 480)
  this.lastScreenshot = imageData;

  this.director.webglRenderer.setClearColor(0x000000, 1);
  this.grid.visible = gridV;
  this.axes.visible = axesV;
}

// TODO reuse/share this will all other image/canvas screenshot code.
DirectorController.prototype.createImageFile = function(data, name) {
    var binary = atob(data.split(',')[1]);
  var array = [];
  for(var i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i));
  }
  var blob = new Blob([new Uint8Array(array)], {type: 'image/png'});

  return new File([blob], name);
}

DirectorController.prototype.uploadScreenshot = function(finishCb) {
  var fileUpload = this.fileUpload;
  var file = this.createImageFile(this.lastScreenshot, 'sceneThumb.png');

  fileUpload.uploadWithCognitoToken(file, this.cognitoInfo, {
    path: this.scene.s3_thumbnail_key,
    success: function(args) {
      // TODO need a url here?
      // TODO should we be saving the whole file here?
      var path = args.url + "?time=" + new Date().getTime();
      this.lastScreenshot = path;
      this.scene.thumbnailStatic = path;
      finishCb();
    }.bind(this)
  })
}

DirectorController.prototype.setCamera = function() {
  this.scene.camera = {
    position: {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z
    },
    target: {
      x: this.controls.target.x,
      y: this.controls.target.y,
      z: this.controls.target.z
    }
  };
  this.cameraSet = true;
  this.$timeout(angular.bind(this, function() {
    this.cameraSet = false;
  }), 2000)
  this.autoSave();
}

DirectorController.prototype.editSceneName = function() {
  this.$timeout(function() {
    $('#sceneName').focus();
  }, 0);
}

DirectorController.prototype.showUploadHelper = function() {
  var target = $('.sidebar .help');
  var pos = target.offset();
  // +10 to account for the triangle
  pos.left = pos.left + target.width() + 10;
  // Because we want to start above the help icon.
  pos.top -= 25;
  this.helper = {
    'show': true,
    'text': 'Choose a folder which contains an .obj file, an .mtl file and any texture files which are required.',
    'where': pos
  }
  // Add a one time click handler to hide the helper.
  var handler = angular.bind(this, function() {
    $(document).off('click', handler);
    this.helper.show = false;
  });
  $(document).on('click', handler);
}

DirectorController.prototype.clickCreateScene = function() {
  // New scene
  this.scene.scene_data = {
    sceneObjects: this.director.saveJson()
  }
  var errors = {};
  this.errors = null;
  if (!this.scene.name) {
    errors.name = 'You need to give your scene a name';
    this.errors = errors;
  }

  if (this.scene.scene_data.sceneObjects.length == 0) {
    errors.sceneObjects = "You don't have any objects in your scene";
    this.errors = errors;
  }
  if (!this.lastScreenshot) {
    // Just take a screenshot if there isn't one.
    this.takeScreenshot();
  }
  if (this.errors) {
    this.showErrors = true;
    // Don't save until there are no errors.
    return;
  }

  // This will be replaced when the save is completed.
  // It also shouldn't be sent to the server, wasting bandwidth.
  delete this.scene.readonly;

  this.scene.$save().then(function(response) {
    if (response.id) {
      // TODO upload the screenshot before redirecting?
      this.uploadScreenshot(angular.bind(this, function() {
        // And save it again with the screenshot.
        this.scene.$save().then(function(response) {
          // Redirect to the new path.
          this.$location.path('/' + response.id);
        }.bind(this), this.errorResponse.bind(this));
      }));
    }
  }.bind(this), this.errorResponse.bind(this));
}

DirectorController.prototype.clickSave = function() {
  // if (this.currentUser.id == this.scene.created_by.id) {
  this.save();
  // Start auto saving now.
  this.autoSaving = true;
  this.scheduleSave();
  // } else {
  //   // Save a copy and redirect to the new scene key.
  //   this.Scene.copy({key: this.scene.key}, angular.bind(this, function(response) {
  //     this.$location.path('/' + response.key);
  //   }));
  // }
}

/**
 * Schedule a save to happen if a save is required.
 */
DirectorController.prototype.scheduleSave = function() {
  // Timed based saving results in some changes being undone?
  // E.g a save while typing in a description can lose a couple of characters as when the
  // response gets back it updates the model with what was saved.
  this.$timeout(angular.bind(this, function() {
    if (!this.autoSaving) {
      // Don't reschedule the timeout.
    } else {
      if (this.autoSaveChanged) {
        this.save();
        this.autoSaveChanged = false;
      }
      this.scheduleSave();
    }
  }), 1000);
};

/**
 * Indicate that something has changed and a save is required if auto save is enabled.
 */
DirectorController.prototype.autoSave = function() {
  this.autoSaveChanged = true;
  if (this.autoSaving) {
    // TODO do a save now if there hasn't been one for a while?
    // It will happen within a second anyway.
  }
}

DirectorController.prototype.save = function() {
  if (this.saveInProgress) {
    // Don't save anything, as there is already a save in flight.
    return;
  }
  this.saveInProgress = true;

  // TODO can we avoid this needing to call a method?
  // I.E sceneObjects should alway be in the ready state?
  this.scene.scene_data.sceneObjects = this.director.saveJson();

  // Don't send this to the server.
  delete this.scene.readonly;

  this.scene.$save(angular.bind(this, function(response) {
    this.lastSaveTime = Date.now();
    this.saveInProgress = false;
  }), angular.bind(this, this.errorResponse));
}

DirectorController.prototype.errorResponse = function(response) {
  // This may be manipulated by the AuthInterceptor below.
  if (!response.errors) {
    // Happens if cross origin policy is not set correctly.
    this.errors = {'responseError': 'Sorry, an unknown error occurred.'};
    this.showErrors = true;
    return;
  }
  this.errors = response.errors;
  this.showErrors = true;
}

DirectorController.prototype.updateTexture = function() {
  if (!this.directorControl.selectedObj ||
      ['text3d'].indexOf(this.directorControl.selectedObj.type) === -1) {
    // There is no selected object compatible with changing color.
    throw new Error('type: ' + this.directorControl.selectedObj.type + ' can\'t have its color set');
  }
  // Save the texture color to the component.
  this.directorControl.selectedObj.components[0].textureColor = this.textureColor;

  var material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(this.textureColor),
    opacity: 1
  });
  this.directorControl.selectedObj.meshObject.traverse( function ( child ) {
    if (child instanceof THREE.Mesh) {
      child.material = material;
    }
  });
  this.requireRender();
}

DirectorController.prototype.clearRotation = function(keyFrame) {
  keyFrame.quaternion.x = 0;
  keyFrame.quaternion.y = 0;
  keyFrame.quaternion.z = 0;
  keyFrame.quaternion.w = 1;
  this.requireRender();
}

DirectorController.prototype.clickPositionReset = function() {
  var keyFrame = this.directorControl.selectedObj.selectedKeyFrame;
  keyFrame.position.x = 0;
  keyFrame.position.y = 0;
  keyFrame.position.z = 0;
  this.requireRender();
  // Update helper?
}

DirectorController.prototype.clickScaleReset = function() {
  var keyFrame = this.directorControl.selectedObj.selectedKeyFrame;
  keyFrame.scale.x = 1;
  keyFrame.scale.y = 1;
  keyFrame.scale.z = 1;
  this.requireRender();
}

DirectorController.prototype.setBackground = function(background) {
  if (!background) {
    this.director.clearBackground();
    return;
  }
  var pieces = background.textureFile.name.split('/');
  this.loadObject({
    'name': 'Background ' + pieces[pieces.length-1],
    'transform': {
      'scale': {x: 5, y: 5, z: 5},
      'position': {x: 0, y: 0, z: 0},
      'quaternion': {x: 0, y: 0, z: 0, w: 1}
    },
    'components': [background],
  });
}

DirectorController.prototype.updateSky = function(param) {
  this.director.updateSky();
}

/**
 * Add a new sky background
 */
DirectorController.prototype.addSkyBackground = function() {
  var component = {
    type: 'sky'
    // Will get default colors.
  }
  var object = this.createObject(component, 'Sky Background');
  object.director = {
    background: true
  }
  this.loadObject(object);
  this.sky = this.director.sky;
}

DirectorController.prototype.deleteObject = function(object) {
  if (this.experienceObj == object) {
    // TODO needs access to the asset to remove?
    this.director.player.reset();
  }
  this.director.remove(object);
  this.directorControl.reset();
  this.requireRender();
}

DirectorController.prototype.selectObject = function(object) {
  this.directorControl.selectObject(object);
  if (this.director.currentFrame < object.startFrame ||
      this.director.currentFrame > object.endFrame) {
    // Select the first frame of this object when it gets selected.
    this.seekFrame(object.startFrame);
  }
}

DirectorController.prototype.addOBJ = function(obj) {
  if (!obj.materialFile || !obj.meshFile) {
    throw new Error('Missing important stuff');
  }
  var component = obj;
  this.loadObject(this.createObject(component, obj.name));
}

DirectorController.prototype.addText = function(text) {
  var component = {
    'type': 'text3d',
    'text': text,
    'textureColor': this.textureColor
  }
  this.loadObject(this.createObject(component, text));
}

DirectorController.prototype.addFloor = function() {
  var component = {
    type: 'floor',
    floorURL: '/static/floor-grad-logo.jpg'
  }
  var object = this.createObject(component, '8i Floor');
  var quaternion = new THREE.Quaternion();
  quaternion.setFromAxisAngle( new THREE.Vector3( 1, 0, 0 ), -Math.PI / 2 );
  object.transform.quaternion.w = quaternion.w;
  object.transform.quaternion.x = quaternion.x;
  object.transform.quaternion.y = quaternion.y;
  object.transform.quaternion.z = quaternion.z;
  object.transform.scale = {
    x: 12.5,
    y: 12.5,
    z: 12.5
  }
  object.director = {
    background: true
  }
  this.floor = this.loadObject(object);

  // Turn off grid when a floor is added?
  // Can still be turned on by the UI.
  this.grid.visible = false;
}

DirectorController.prototype.loadObject = function(object) {
  // Pause if a new object is added to the scene.
  // Also return to 0 so the initial keyFrame will be updated.
  this.onPauseClicked();
  this.seekFrame(0);
  var obj = this.director.loadObject(object);
  if (this.errors) {
    this.errors.sceneObjects = null;
  }
  this.autoSave();
  return obj;
}

DirectorController.prototype.createObject = function(component, name) {
  return {
    'name': name,
    'transform': {
      'scale': {x: 1, y: 1, z: 1},
      'position': {x: 0, y: 0, z: 0},
      'quaternion': {x: 0, y: 0, z: 0, w: 1}
    },
    'components': [component]
  };
}

DirectorController.prototype.uploadBackground = function(args) {
  var pieces = args.url.split('/');
  console.log('upload background', args);
  // this.scene.s3Path = Director/staging, not useful yet.
  // console.log(this.scene.s3Path);
  var component = {
    type: 'sphere',
    // TODO make this a relative path?
    textureURL: args.url,
  }
  // TODO tell server to update asset cache?
  // TODO should only add if it doesn't replace an asset?
  this.backgrounds.push(component);
  this.backgrounds.sort(function(a, b) {
    return compare(a.textureURL.toUpperCase(), b.textureURL.toUpperCase());
  });
}

DirectorController.prototype.uploadAudio = function(args) {
  console.log('uploadAudio', args);
  var component = {
    type: 'audio',
    audioFile: {
      name: args.file.name,
      size: args.file.size,
      url: args.url
    }
  }
  // TODO most uploads just add to the set of available things.
  // Here we just add it to the scene, and don't make a set of things.
  // Decide which is better, or do both?
  var name = args.file.name.split('/').pop();

  this.loadObject(this.createObject(component, name));
}

DirectorController.prototype.uploadPlane = function(args) {
  console.log(args);
  var component = {
    type: 'plane',
    textureFile: {
      name: args.file.name,
      size: args.file.size,
      url: args.url
    }
  }
  // TODO add the file to the scene assets/server?
  var name = args.file.name.split('/').pop();
  this.loadObject(this.createObject(component, name));
}

DirectorController.prototype.objReady = function(changeEvent) {
  files = changeEvent.target.files;
  objValidate(files, function() {
    var objFile = files[0];
    var parts = objFile.webkitRelativePath.split("/");
    var folder = objFile.name;
    if (parts.length >= 2) {
      // The second to last part is the sub folder which the objFile is in.
      folder = parts[parts.length-2];
    }

    if (!this.scene.readonly || !this.scene.readonly.s3_policy) {
      // refreshing the page should fix this.
      throw Error('No s3_policy available for upload');
    } else {
      this.startOBJUpload(this.scene.readonly.s3_policy, files, folder);
    }
  }.bind(this), function(error, files) {
    changeEvent.target.value = '';
    console.warn(error, files);
    window.alert(error + '\n' + files.join('\n'));
    throw new Error('MTL file was invalid, not uploading.');
  });
}

DirectorController.prototype.startOBJUpload = function(s3_policy, files, folder) {
  this.multiFileUpload.uploadMultiple(files, folder, {
    path: 'obj',
    s3_policy: s3_policy,
    progress: angular.bind(this, function() {
      this.objUploadProgress = this.multiFileUpload.progress;
      this.$scope.$apply();
    }),
    failure: function() {
      console.log('There was a problem uploading the OBJ folder');
      alert('There was a problem uploading the OBJ folder');
      this.objUploadProgress = null;
      this.$scope.$apply();
    }.bind(this),
    success: angular.bind(this, function(bucketUrl, fileName) {
      this.uploadedOBJ(bucketUrl + fileName, files);
    })
  });
}

DirectorController.prototype.uploadedOBJ = function(url, files) {
  this.objUploadProgress = null;
  this.$scope.$apply();
  var pieces = url.split('/');
  if (files.length > 1) {
    // Multiple file obj, url is just the url to the folder.
    // TODO make sure this obj doesn't already exist?
    var mtlFile = null;
    var objFile = null;
    angular.forEach(files, function(file) {
      if (file.name.toLowerCase().indexOf(".mtl", file.name.length - 4) !== -1) {
        mtlFile = file;
      } else if (file.name.toLowerCase().indexOf(".obj", file.name.length - 4) !== -1) {
        objFile = file;
      }
    });

    if (!mtlFile || !objFile) {
      throw new Error('Invalid uploadedOBJ call, files should of been validated before upload.');
    }
    var newObj = {
      type: 'obj',
      name: pieces[pieces.length - 1],
      meshURL: objFile.name,
      materialURL: mtlFile.name,
      // TODO use time of upload for caching.
      // time: new Date().getTime(),
      basePath: url + '/'
    }
    var existing = this.objs.find(function(obj) {
      return obj.name == newObj.name;
    });
    if (!existing) {
      this.objs.push(newObj);
      this.objs.sort(sortAlpha);
    } else {
      console.log('Not adding new object because its already in the list.', existing);
    }
    // Add one to the scene?
    this.addOBJ(newObj);

    return;
  } else {
    throw new Error('Single file uploaded for OBJ is not supported, expected mtl + obj.')
  }
}

var FileWrapper = function(file, params) {
  this.file = file;
  this.progress = 0;
  var params = params || {};
  this.successCallback = params.success || function() {};
  this.progressCallback = params.progress || function() {};
  this.failureCallback = params.failure || function() {};

  this.fileName = file.name;
  if (params.path) {
    this.fileName = params.path + '/' + this.fileName;
  }
}

FileWrapper.prototype.createFormData = function() {
  var formData = new FormData();
  formData.append("key", this.s3_policy.key_prefix + this.fileName);
  formData.append("AWSAccessKeyId", this.s3_policy.awsAccessKey);
  formData.append("acl", this.s3_policy.acl);
  formData.append("policy", this.s3_policy.policy);
  formData.append("signature", this.s3_policy.signature);
  return formData;
}

FileWrapper.prototype.startUpload = function(s3_policy) {
  this.s3_policy = s3_policy;
  var formData = this.createFormData(this.s3_policy);
  formData.append("file", this.file);

  $.ajax({
    type: "POST",
    url: this.s3_policy.bucketUrl,
    contentType: false,
    crossDomain: true,
    processData: false,
    data: formData,
    xhr: angular.bind(this, function() {  // Custom XMLHttpRequest so we can track upload progress
      var myXhr = $.ajaxSettings.xhr();
      if(myXhr.upload){ // Check if upload property exists
        myXhr.upload.addEventListener('progress', angular.bind(this, function(evt) {
          if (evt.lengthComputable) {
            this.progress = Math.round(evt.loaded / evt.total * 10000) / 100;
            this.progressCallback.apply(null, [this.progress]);
          }
        }), false);
      }
      return myXhr;
    }),
    success: angular.bind(this, this.success),
    error: angular.bind(this, this.error)
  });
}

FileWrapper.prototype.success = function(data) {
  if (data) {
    // data should be undefined as a successful POST upload doesn't return any content.
    console.warn("Possible error?", data);
    this.error(data);
  } else {
    this.progress = 100;
    this.progressCallback.apply(null, [100]);
    this.successCallback.apply(null, [this.s3_policy.accessUrl + this.s3_policy.key_prefix, this.fileName]);
  }
};

FileWrapper.prototype.error = function(data) {
  // TODO retry before calling failure?
  var message = data.responseText;
  try {
    message = data.responseXML.getElementsByTagName("Message")[0].childNodes[0].nodeValue;
  } catch (e) {}
  // Amazon sometimes gives a random 500, we can just try again when that happens.
  console.warn('There was an error uploading a file ' + this.fileName + '.', data);
  alert('there was an error from amazon. See console for more. ' + message);
  this.failureCallback.apply(null, [{
    file: this,
    error: message
  }]);
};

// @deprecated, only used for OBJ folder upload and thumbnail upload.
// See fileUpload.js for better options.
var FileUpload = function() {
}

FileUpload.prototype.uploadMultiple = function(files, folder, params) {
  params = params || {};
  this.successCb = params.success || function() {};
  // Progress can't always be called?
  this.progressCb = params.progress || function() {};
  this.failureCb = params.failure || function() {};
  this.folder = params.path + "/" + folder;
  var s3_policy = params.s3_policy;
  this.s3_policy = s3_policy;
  if (!s3_policy) {
    throw new Error('No s3_policy available');
  }
  if (!files || files.length == 0) {
    throw new Error('No files available');
  }
  angular.forEach(files, angular.bind(this, function(file) {
    // Max 10Mb, should be in sync with scene_api s3_policy
    maxsize = JSON.parse(atob(s3_policy.policy)).conditions[3][2];
    if (file.size > maxsize) {
      alert('File ' + file.name + ' is too big for uploading')
      throw new Error('File ' + file.name + ' is too big for uploading');
    }
  }));
  this.totalCompleted = 0;
  this.failed = [];
  this.fileWrappers = [];
  angular.forEach(files, angular.bind(this, function(file) {
    var fileWrap = new FileWrapper(file, {
      path: this.folder,
      progress: angular.bind(this, this.progressCallback),
      success: angular.bind(this, this.successCallback),
      failure: angular.bind(this, this.failureCallback)
    });
    this.fileWrappers.push(fileWrap);
  }));

  // TODO max out how many files are uploaded simultaneously?
  angular.forEach(this.fileWrappers, function(fileWrap) {
    fileWrap.startUpload(s3_policy);
  });
}

FileUpload.prototype.progressCallback = function(progress) {
  var totalUpload = 0;
  var totalUploaded = 0;
  angular.forEach(this.fileWrappers, function(fileWrap) {
    // TODO make these relative to the filesize?
    totalUpload += 100;
    totalUploaded += fileWrap.progress;
  });
  this.progress = totalUploaded * 100 / totalUpload;
  // Calculate total progress of all things?
  this.progressCb.apply(null, [this.progress]);
}

FileUpload.prototype.successCallback = function(path, fileName) {
  this.totalCompleted ++;
  this.checkComplete();
}

/* data should have FileWrapper file and string error */
FileUpload.prototype.failureCallback = function(data) {
  this.failed.push(data.file);
  this.checkComplete();
}

FileUpload.prototype.checkComplete = function() {
  if (this.totalCompleted + this.failed.length == this.fileWrappers.length) {
    // All finished one way or another.
    if (this.failed.length > 0) {
      this.failureCb();
    } else {
      this.successCb(this.s3_policy.accessUrl + this.s3_policy.key_prefix, this.folder);
    }
  }
};

// TODO use uploadMultiple for all cases?
FileUpload.prototype.upload = function(file, params) {
  params = params || {};
  success = params.success || function() {};
  // Progress can't always be called?
  progress = params.progress || function() {};
  failure = params.failure || function() {};
  s3_policy = params.s3_policy;
  this.s3_policy = s3_policy;
  if (!s3_policy) {
    throw new Error('No s3_policy available');
  }
  if (!file || !file.name) {
    throw new Error('No file available');
  }
  var fileName = file.name;
  if (params.path) {
    fileName = params.path + '/' + fileName;
  }
  var formData = new FormData();
  formData.append("key", s3_policy.key_prefix + fileName);
  formData.append("AWSAccessKeyId", s3_policy.awsAccessKey);
  formData.append("acl", s3_policy.acl);
  formData.append("policy", s3_policy.policy);
  formData.append("signature", s3_policy.signature);
  formData.append("file", file);

  $.ajax({
    type: "POST",
    url: s3_policy.bucketUrl,
    contentType: false,
    crossDomain: true,
    processData: false,
    data: formData,
    xhr: $.proxy(function() {  // Custom XMLHttpRequest so we can track upload progress
      var myXhr = $.ajaxSettings.xhr();
      if(myXhr.upload){ // Check if upload property exists
        myXhr.upload.addEventListener('progress', progress, false);
      }else {
        // Fake some progress to show its working.
        progress({
          lengthComputable: true,
          loaded: 50,
          total: 100
        });
        $scope.$apply();
      }
      return myXhr;
    }, this),
    success: $.proxy(function(data, textStatus) {
      if (data) {
        // data should be undefined as a successful POST upload doesn't return any content.
        console.warn("Possible error?", data);
      } else {
        success(s3_policy.accessUrl + s3_policy.key_prefix, fileName);
      }
    }, this),
    error: $.proxy(function(data) {
      // TODO retry before calling failure?
      console.warn(data);
      var message = data.responseText;
      try {
        message = data.responseXML.getElementsByTagName("Message")[0].childNodes[0].nodeValue;
      } catch (e) {}
      // Amazon sometimes gives a random 500, we can just try again when that happens.
      console.warn('There was an error uploading a file ' + fileName + '.');
      console.warn(data);
      alert('there was an error from amazon. ' + (message || ''));
      failure();
    }, this)
  });
}

function buildAxis( src, dst, colorHex, dashed ) {
  var geom = new THREE.Geometry(),
      mat;

  if (dashed) {
    mat = new THREE.LineDashedMaterial({ linewidth: 2, color: colorHex, dashSize: .3, gapSize: .3 });
  } else {
    mat = new THREE.LineBasicMaterial({ linewidth: 2, color: colorHex });
  }

  geom.vertices.push( src.clone() );
  geom.vertices.push( dst.clone() );
  geom.computeLineDistances(); // This one is SUPER important, otherwise dashed lines will appear as simple plain lines

  var axis = new THREE.Line( geom, mat, THREE.LineSegments );

  return axis;
}

function buildAxes( length ) {
  var axes = new THREE.Object3D();

  axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( length, 0, 0 ), 0xF92672, false ) ); // +X
  axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( -length, 0, 0 ), 0xF92672, true) ); // -X
  axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, length, 0 ), 0xA6E22E, false ) ); // +Y
  axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, -length, 0 ), 0xA6E22E, true ) ); // -Y
  axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, length ), 0x5CD9EF, false ) ); // +Z
  axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, -length ), 0x5CD9EF, true ) ); // -Z

  return axes;
}

function objValidate(files, success, failure) {
  // Should have one obj and one mtl.
  // Need a unique name for the upload folder.
  var mtlFile, objFile;
  var otherFiles = [];
  angular.forEach(files, function(file) {
    if (file.name.toLowerCase().indexOf(".mtl", file.name.length - 4) !== -1) {
      mtlFile = file;
    } else if (file.name.toLowerCase().indexOf(".obj", file.name.length - 4) !== -1) {
      objFile = file;
    } else {
      otherFiles.push(file);
    }
  });
  if (!mtlFile) {
    throw new Error("Multiple files doesn't contain an mtl file.")
  }
  if (!objFile) {
    throw new Error("Multiple files doesn't contain an obj file.")
  }
  var fr = new FileReader();
  fr.onload = angular.bind(this, function() {
    // check files for any urls in result?
    var regex = /^map_Kd (-[so] ([-+]?[0-9]*\.?[0-9]+ ){3})*(.*)\n?/gm;
    var matches, res = [];
    while (matches = regex.exec(fr.result)) {
        res.push(matches[3].trim());
    }
    // Each file name in res should exist in files.
    var missingFiles = [];
    var invalidFiles = [];
    angular.forEach(res, function (name) {
      if (!name) {
        // Empty string is ok for files?
        return;
      }
      var supportedTypes = ['.png', '.jpg', '.jpeg'];
      var supported = false;
      for (i in supportedTypes) {
        var fileType = supportedTypes[i];
        if (fileType === name.toLowerCase().substr(-fileType.length)) {
          supported = true;
        }
      }
      if (!supported) {
        invalidFiles.push(name)
        return;
      }
      var found = false;
      angular.forEach(otherFiles, function(file) {
        if (file.name == name) {
          found = true;
        }
      });
      if (!found) {
        missingFiles.push(name);
      }
    });
    if (missingFiles.length > 0) {
      failure("MTL file contained file references which are missing.", missingFiles);
    } else if (invalidFiles.length > 0) {
      failure("MTL file contained invalid texture files, expected jpg or png.", invalidFiles);
    } else {
      success();
    }
  });
  fr.readAsText(mtlFile);
};

angular.module('director', [
  'config',
  // 'eiFileUpload',
  // 'loginService2',
  'ngRoute',
  'ngResource',
  'player2Service',
])
.controller('DirectorController', DirectorController)
.service('sceneService', SceneService)
.service('multiFileUpload', FileUpload)
.directive('eiFile', function() {
  return {
    scope: {
      eiChange: '&',
      eiFile: '@'
    },
    template: function(element, attrs) {
      var extras = ''
      if (attrs.hasOwnProperty('multiple')) {
          extras = "multiple webkitdirectory directory";
      }
      return [
        '<div style="width: 0px; height: 0px; overflow: hidden;">',
          '<input type="file" class="file" name="file" ' + extras + ' />',
        '</div>',
      ].join('');
    },
    link: function (scope, element, attributes, controller) {
      var fileElement = $(element[0].querySelector('.file'));
      fileElement.bind("change", function (changeEvent) {
        if (changeEvent.target.files.length == 0) {
          // User cancelled, no change.
          return;
        }
        scope.eiChange({
          $event: changeEvent
        });
        // It would be nice to clear here, but this changes the event for everyone whos still using it.
        // fileElement.val('')
        scope.$apply();
      });
    }
  };
})
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
      .when('/:scene_id', {
        templateUrl: '/static/8i/director/director.html',
      })
      .otherwise({
        templateUrl: '/static/8i/director/director.html'
      })
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
.run(function($rootScope, config) {
  // variables on $rootScope will be available for reading from all $scopes
  // through scope inheritance.
  if (!config.experimental) {
    config.experimental = {};
  }
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
    response: function(response) {
      if (response.data.data) {
        // Handle API's which always return json with a data object.
        response.data = response.data.data
      }
      return $q.resolve(response);
    },
    responseError: function (response) {
      // if (response.status == 403 || response.status == 401) {
      //   // Need to lazy inject this to avoid a dependency cycle.
      //   var loginService = $injector.get('loginService');
      //   loginService.badResponse();
      // }

      // We expect that these errors will be set for all known error responses.
      if (response.data.error) {
        console.warn('Error response:', JSON.stringify(response.data.error));
        response.errors = response.data.error;
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
