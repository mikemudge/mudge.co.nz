// TODO this should reuse a common PlayerService.
EightI.Env.registerFileURL("eighti.lib.js.mem", "/static/js/eighti/eighti.lib.js.mem");

var Director = function(config, playerService, $q, $rootScope) {
  if (window.EightIAPI) {
    EightIAPI.scenePlayer = this;
  }
  this.config = config;
  this.player = playerService;
  this.$q = $q
  this.$rootScope = $rootScope;
  this.isPlaying = false;
  this.threeScene = new THREE.Scene();
  this.frontScene = new THREE.Scene();
  this.camera = playerService.camera;
  // False until the camera has been located by some input.
  // Good for preventing future auto positioning of the camera.
  this.cameraMoved = false;
  this.webglRenderer = playerService.webglRenderer;
  this.currentTime = 0;
  // Set the total length to 2 (seconds) by default.
  // When the 8i asset loads this will grow to the length of it.
  this.totalLength = 0;
  this.totalFrames = 0;
  // How much of the scene is downloaded. (good for visuals)
  this.downloadedLength = 0;
  // How much of the scene is playable, used for buffering.
  this.playableLength = 0;

  this.onPlaybackComplete = function() {};

  this.isBuffering = false;
  this.looping = false;

  this.controls = new EightIDirectorControls(this.camera, playerService.canvas);
  this.controls.target.set(0, 1.50, 0);

  // TODO this should load a whole bunch of scene settings for things like this.
  this.controls.rotateSpeed = 0.4;
  // TODO Max angles, max pan etc, for orbit controls.
  // Other controls should have other limit settings?
  // Some shared settings for camera bounds etc?
  this.controls.update();

  // apply control limits if there is any.
  this.sky = new SkyBackground();

  this.objects = [];

  this.textureLoader = new THREE.TextureLoader();
  // Allow assets to be loaded from amazon.
  this.textureLoader.setCrossOrigin('');

  // 4 diagonal lights to give a bit of depth to things.
  this.directionalLight = new THREE.DirectionalLight(0x333333, 0.5);
  this.directionalLight.position.set(1,1,-1);
  this.threeScene.add(this.directionalLight);
  this.directionalLight = new THREE.DirectionalLight(0x333333, 0.5);
  this.directionalLight.position.set(-1,1,1);
  this.threeScene.add(this.directionalLight);
  this.directionalLight = new THREE.DirectionalLight(0x333333, 0.5);
  this.directionalLight.position.set(1,1,1);
  this.threeScene.add(this.directionalLight);
  this.directionalLight = new THREE.DirectionalLight(0x333333, 0.5);
  this.directionalLight.position.set(-1,1,-1);
  this.threeScene.add(this.directionalLight);

  this.ambientLight = new THREE.AmbientLight(0xFFFFFF)
  this.threeScene.add(this.ambientLight);

  this.updates = [];

  this.notRendering = false;
  if (playerService.unsupported) {
    this.unsupported = playerService.unsupported;
    return;
  }
  window.requestAnimationFrame(this.animate_.bind(this));
}

Director.prototype.registerUpdatable = function(object) {
  this.updates.push(angular.bind(object, object.update));
}

Director.prototype.registerUpdate = function(callback) {
  this.updates.push(callback);
}

Director.prototype.animate_ = function(time) {
  if ($('#canvas').length == 0) {
    // canvas was removed from the page so stop updating.
    this.notRendering = true;
    return;
  }

  window.requestAnimationFrame(this.animate_.bind(this));
  this.update(time);
};

Director.prototype.update = function(time) {
  // Update the currentTime only after we have checked for buffering.
  if (this.isPlaying && this.lastUpdateTime != undefined) {
    if (!this.isBuffering) {
      this.currentTime += (time - this.lastUpdateTime) / 1000;
    }
  }
  this.lastUpdateTime = time;
  this.currentFrame = Math.round(this.currentTime * 10);

  if (this.player.cardboard) {
    // Must come before update call as it updates the stereo cameras.
    this.player.cardboard.render(this.threeScene, this.camera)
  }

  this.requiresRender |= this.controls.update(time);
  angular.forEach(this.updates, function(update) {
    this.requiresRender |= update(time);
  }.bind(this));
  this.requiresRender |= this.player.update(time);

  angular.forEach(this.objects, angular.bind(this, function(object) {
    // First update the objects.
    this.requiresRender |= object.update(this.currentTime);
  }));

  // Do this after updating the player and all the objects.
  this.downloadedLength = Infinity;
  this.playableLength = Infinity;

  // TODO totalLength should be loaded from the scene and not change dynamically here.
  this.totalLength = 0;
  this.totalFrames = 0;

  angular.forEach(this.objects, angular.bind(this, function(object) {
    // total length is the max of all objects totalLength
    this.totalLength = Math.max(this.totalLength, object.getTotalLength());
    this.totalFrames = Math.max(this.totalFrames, object.getTotalFrames());
    // The playable length of the whole is the min of the objects.
    this.downloadedLength = Math.min(this.downloadedLength, object.downloadedLength);
    this.playableLength = Math.min(this.playableLength, object.playableLength);
  }));

  this.downloadedLength = Math.min(this.totalLength, this.downloadedLength);
  this.playableLength = Math.min(this.totalLength, this.playableLength);

  this.progress = (100.0 * this.downloadedLength / this.totalLength).toFixed();
  this.$rootScope.$apply();

  // buffer the scene if its not ready to play yet and it is not already fully loaded.
  if (this.isPlaying && this.playableLength <= this.currentTime && this.playableLength < this.totalLength) {
    // pause if the buffer runs out.
    this.pause();
    this.isBuffering = true;
  } else if (this.isBuffering && this.playableLength >= Math.min(this.totalLength, this.currentTime + 2)) {
    // play when the next 2 seconds of content is buffered.
    // TODO could seek to currentTime here just to make sure audio is in sync?
    this.play();
  }

  // TODO this uses a different time space to the above update methods.
  angular.forEach(this.objects, angular.bind(this, function(object) {
    this.requiresRender |= object.UpdateAnimation(this.currentTime);
  }));

  if (this.isPlaying && this.totalLength > 0.0 && this.currentTime >= this.totalLength) {
    // Stay at the end of the scene, next call to play will restart it.
    this.requiresRender = true;
    if (this.looping) {
      // Replay for loop.
      this.play();
    } else {
      this.pause();
      this.onPlaybackComplete.apply(this);
    }
  }

  if (this.isPlaying || this.requiresRender) {
    this.requiresRender = false;
    this.render();
  }
}

Director.prototype.render = function(time) {
  this.webglRenderer.clear(true, true, true);

  if (this.player.cardboard) {
    var cameras = this.player.cardboard.cameras;

    this.player.render();
    this.webglRenderer.resetGLState();

    _width = this.player.width / 2;
    _height = this.player.height;

    this.webglRenderer.setViewport( 0, 0, _width, _height );
    this.webglRenderer.render(this.threeScene, cameras.left);

    this.webglRenderer.setViewport(_width, 0, _width, _height);
    this.webglRenderer.render(this.threeScene, cameras.right);
  } else {
    this.player.render();
    this.webglRenderer.resetGLState();

    this.webglRenderer.render(this.threeScene, this.camera);

    // Will always render helpers on top of objects.
    this.webglRenderer.clearDepth();
    this.webglRenderer.render(this.frontScene, this.camera);
  }
}

// Does a single one off call like render but saves the result as a data URL.
Director.prototype.getScreenshot = function(width, height) {
  this.player.width = width;
  this.player.height = height;
  this.camera.aspect = width / height;
  this.camera.updateProjectionMatrix();
  this.webglRenderer.setPixelRatio(window.devicePixelRatio);
  // Need to update the size of the canvas itself so the output image is that size.
  this.webglRenderer.setSize(width, height, false);

  if (this.player.frameBuffer) {
    this.player.frameBuffer.setSize(new THREE.Vector2(width, height));
  }
  if (this.player.viewport) {
    this.player.viewport.setProjMatrix(this.camera.projectionMatrix);
    this.player.viewport.setDimensions(0, 0, width * window.devicePixelRatio, height * window.devicePixelRatio);
  }

  this.webglRenderer.clear(true, true, true);
  this.player.render();
  this.webglRenderer.resetGLState();
  this.webglRenderer.render(this.threeScene, this.camera);
  // Purposefully skip frontScene as we don't want helpers in the screenshot.

  var imageData = this.webglRenderer.domElement.toDataURL();

  // Return everything to normal size and force a rerender.
  this.player.resize();
  this.requiresRender = true;

  return imageData;
};

Director.prototype.play = function() {
  this.isPlaying = true;
  this.isBuffering = false;

  if (this.currentTime >= this.totalLength) {
    // When play is clicked and the video is complete start from the beginning.
    this.seek(0);
  }
  this.objects.forEach(function(object) {
    object.play(this.currentTime);
  }.bind(this));
}

Director.prototype.pause = function() {
  this.isPlaying = false;
  this.requiresRender = true;
  // Round the currentTime to the nearest frame.
  this.currentTime = this.currentFrame / 10;
  this.objects.forEach(function(object) {
    object.pause();
  });
}

Director.prototype.togglePlay = function() {
  if (this.isPlaying) {
    this.pause();
  } else {
    this.play();
  }
}

Director.prototype.mute = function(mute) {
  this.objects.forEach(function(object) {
    object.mute(mute);
  });
}

Director.prototype.seek = function(time) {
  this.currentTime = time;
  this.currentFrame = Math.round(this.currentTime * 10);
  this.requiresRender = true;
  // update each of the scene objects.
  this.objects.forEach(function(object) {
    object.seek(time);
  });
  angular.forEach(this.objects, angular.bind(this, function(object) {
    object.UpdateAnimation(this.currentTime);
  }));
  // TODO make sure it renders the scene again?
}

Director.prototype.toggleLoop = function() {
  this.looping = !this.looping;
}

Director.prototype.remove = function(object) {
  // TODO If this is an asset then we should do extra clean up?
  object.Deselect();
  object.Remove();
  var idx = this.objects.indexOf(object);
  if (idx !== -1) {
    this.objects.splice(idx, 1);
  }
}

Director.prototype.loadText = function(obj, component) {
  var fontLoader = new THREE.FontLoader();

  fontLoader.load('/static/js/threejs/helvetiker_bold.typeface.js?v=1', angular.bind(this, function(font) {
    var textSettings = {
      size : .3,
      height : .05,
      curveSegments : 12,
      font : font,
      weight : "bold",
      style : "normal",
      bevelEnabled : false,
      bevelThickness : 1,
      bevelSize : 0.5
    };
    // Defaults to white.
    var color = component.textureColor || '#FFFFFF';
    var material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      transparent: true
    });
    var textGeo = new THREE.TextGeometry(component.text, textSettings);
    textGeo.center();
    var textMesh = new THREE.Mesh(textGeo, material);

    // Traverse?
    textMesh.parentObj = obj;

    obj.useBoundingBox = true;
    obj.Initialise(textMesh);
    this.requiresRender = true;
  }));
}

/** Adds an object and updates both the renderer and the rootscope. */
Director.prototype.addObject = function(object) {
  this.objects.push(object);
  // Update anything else which is using the objects list.
  // TODO it would be nice to not require this.
  if (!this.$rootScope.$$phase) {
    this.$rootScope.$apply();
  }
  this.requiresRender = true;
}

// Sphere is just a specific obj mesh with a texture.
Director.prototype.loadBackgroundSphere = function(obj, component) {
  // This is not saved, but just used to show the kind of thing in the editor.
  obj.type = "background";
  this.textureLoader.load(
      component.textureURL,
      angular.bind(this, function(texture) {
        texture.minFilter = THREE.NearestFilter;
        var material = new THREE.MeshBasicMaterial({
          map: texture,
          opacity: 1
        });
        var objLoader = new THREE.OBJLoader();
        objLoader.load(
            component.objUrl || this.config.S3_BASE_URL + 'Director/obj/hemisphereCurvedFlatBottom.obj',
            angular.bind(this, function(objMesh) {
              // TODO we can only do this because we know the structure of the hemisphere.
              objMesh.children[0].material = material;
              obj.Initialise(objMesh);

              // Black ground plane to hide view from underground.
              var plane = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({color: 0x333333}));
              // Make it a ground, instead of a wall.
              plane.rotation.x = Math.PI / 2;
              objMesh.add(plane);

              this.requiresRender = true;
            }));
      }),
      function() {}, // Progress
      function(error) { console.log(error); } // Error?
  );
}

Director.prototype.loadObj = function(obj, component) {
  if (!component.meshURL) {
    console.log("Component missing meshURL", component);
    throw new Error("component of type obj must have meshURL");
  }
  var manager = new THREE.LoadingManager();
  manager.onProgress = angular.bind(this, function ( item, loaded, total ) {
    // TODO use this to show load progress of an obj object?
    // console.log( item, loaded, total );
    this.requiresRender = true;
  });
  var objLoader = new THREE.OBJLoader(manager);

  if (component.basePath && component.materialURL) {
    // TODO custom loading manager?
    var mtlLoader = new THREE.MTLLoader(manager);
    mtlLoader.setCrossOrigin('');
    mtlLoader.setPath(component.basePath);

    if (mtlLoader.setTexturePath) {
      mtlLoader.setTexturePath(component.basePath);
      mtlLoader.setPath(component.basePath);
    } else {
      // setBaseUrl is deprecated in the latest version of three.js
      mtlLoader.setBaseUrl(component.basePath);
    }
    mtlLoader.setMaterialOptions({
      side: THREE.DoubleSide,
      // 0, 0, 0 is black and if they aren't ignored then some materials don't use images.
      ignoreZeroRGBs: true
    });
    mtlLoader.load(component.materialURL, angular.bind(this, function( materials ) {
      try {
      materials.preload();
      angular.forEach(materials.materials, function(a, b) {
        if (a.map) {
          // Prevent warnings like "image is not power of two (246x246). Resized to 256x256"
          a.map.minFilter = THREE.NearestFilter;
          a.map.wrapS = THREE.ClampToEdgeWrapping;
          a.map.wrapT = THREE.ClampToEdgeWrapping;
        }
        a.transparent = true;
      })
      objLoader.setMaterials(materials);
      objLoader.setPath(component.basePath);
      /* TODO progress and error handlers? should be in manager? */
      objLoader.load(
          component.meshURL,
          angular.bind(this, this.loadObjCallback, obj, null));
      } catch (e) {
        console.error(e.message || e);
        console.error(e.stack || "No stack for error");
        // May as well, although it doesn't seem like anyone's listening.
        throw e;
      }
    }));
  } else if (component.textureURL) {
    this.textureLoader.load(
        component.textureURL,
        angular.bind(this, function(texture) {
          texture.minFilter = THREE.NearestFilter;
          material = new THREE.MeshBasicMaterial({
            map: texture,
            opacity: 1
          });
          objLoader.load(
              component.meshURL,
              angular.bind(this, this.loadObjCallback, obj, material));
        }),
        function() {}, // Progress
        function(error) { console.log(error); } // Error?
    );
  } else {
    var color = component.textureColor || '#FFFFFF';
    var material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color)
    });
    objLoader.load(
        component.meshURL,
        angular.bind(this, this.loadObjCallback, obj, material));
  }
};

Director.prototype.loadObjCallback = function(obj, material, objMesh) {

  var vertCount = 0;
  var meshCount = 0;
  objMesh.traverse( function ( child) {
    if (child instanceof THREE.Mesh) {
      if (material) {
        child.material = material;
      }
      if ( !child.geometry.getAttribute("normal") ) {
        child.geometry.computeFaceNormals();
        child.geometry.computeVertexNormals();
      }
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();

      vertCount += child.geometry.getAttribute("position").count;
      meshCount++;

      // set parentObj for detecting which object a mesh is part of while raycasting.
      child.parentObj = obj;
    }
  }.bind(this));

  if (vertCount > 100000)
    obj.useBoundingBox = true; // save raycasting time on hi-res meshes by checking bounding box

  this.requiresRender = true;
  obj.Initialise(objMesh);
};

Director.prototype.loadSkyBackground = function(obj, component) {
  this.sky.setComponent(component);
  // This is not saved, but just used to show the kind of thing in the editor.
  obj.type = "background";
  var object = new THREE.Object3D();
  object.add(this.sky.sky);
  object.add(this.sky.floor);

  obj.Initialise(object);
}

Director.prototype.loadFloor = function(obj, component) {
  this.textureLoader.load(
      component.floorURL,
      angular.bind(this, function(texture) {
        texture.minFilter = THREE.NearestFilter;
        var material2d = new THREE.MeshBasicMaterial({
          map: texture,
          opacity: 1,
          // TODO support side for some version of floor/cutout?
          transparent: true
        });

        // TODO need tests for this floor component.
        // TODO should this be transformable?
        var plane = new THREE.PlaneBufferGeometry( 1, 1 );

        var floor = new THREE.Mesh(plane, material2d);

        obj.Initialise(floor);
      }),
      function() {}, // Progress
      function(error) { console.log(error); } // Error?
  );
}

Director.prototype.loadPlane = function(obj, component) {
  this.textureLoader.load(
      component.textureFile.url,
      function(texture) {
        console.log('Texture loaded', texture.image.width, texture.image.height)
        // 200 pixels per meter?
        var plane = new THREE.PlaneBufferGeometry(texture.image.width / 200, texture.image.height / 200, 10, 10);
        texture.minFilter = THREE.NearestFilter;
        var material2d = new THREE.MeshBasicMaterial({
          map: texture,
          opacity: 1,
          transparent: true,
          // This seems to use the reverse texture which is ideal for a plane.
          side: THREE.DoubleSide
        });
        obj.Initialise(new THREE.Mesh(plane, material2d));
        obj.meshObject.renderOrder = 1;
      }.bind(this),
      function() {}, // Progress
      function(error) { console.log(error); } // Error?
  );
}

Director.prototype.loadHvr = function(obj, component) {
  // Need player and animator injected?
  var asset = new AssetUpdater(obj, component, this.player);
  this.player.addAsset(asset);

  var assetMesh = asset.getTrackMesh();

  assetMesh.traverse( function ( child ) {
    if (child instanceof THREE.Mesh) {
      child.parentObj = obj;
    }
  });

  // We don't support opacity fade with hvr's yet.
  obj.fadeLength = 0;

  obj.Initialise(assetMesh);
  obj.addComponent(asset);
}

Director.prototype.loadAudio = function(obj, component) {
  if (component.audioFile) {
    url = component.audioFile.url;
  } else {
    console.warn('Using deprecated audioURL field');
    url = component.audioURL;
  }

  var audio = new EightI.Audio(url);

  // Because we don't call obj.Initialize(), we need to call componentLoaded.
  // TODO should update downloaded/playback times as audio downloads.
  audio.load(obj.componentLoaded.bind(obj, audio));

  obj.addComponent(audio);

  // Make the audio a bit quieter by setting gain to 0 instead of 1.
  audio.gain.gain.value = 0;
  this.player.addAudio(audio);
  return audio
}

Director.prototype.updateSky = function() {
  this.sky.update();
  this.requiresRender = true;
}

Director.prototype.clearBackground = function() {
  // Just clear background.
  if (this.background) {
    this.remove(this.background);
  }
  this.background = null;
  this.requiresRender = true;
}

Director.prototype.loadObject = function(sceneObject) {
  var obj = new OBJObject(sceneObject, this.threeScene);

  // Load components first, as they determine the type/ background state of obj.
  angular.forEach(sceneObject.components, angular.bind(this, this.loadComponent, obj));

  if (obj.type == 'background' || obj.type == 'sphere') {
    this.clearBackground();
    this.background = obj;
  }

  this.objects.push(obj);
  this.requiresRender = true;
  return obj;
}

Director.prototype.loadComponent = function(obj, component) {
  // This is a bit hacky, but each object's type is used to show an icon?
  // TODO How to calculate the type of an obj with more than one component?
  if (!obj.type) {
    obj.type = component.type;
    if (component.type == 'text3d') {
      // TODO should text have its own icon?
      obj.type = 'obj';
    }
  }

  switch(component.type) {
    case 'text3d':
      this.loadText(obj, component);
      break;
    case 'sky':
      this.loadSkyBackground(obj, component);
      break;
    case 'floor':
      this.loadFloor(obj, component);
      break;
    case 'plane':
      this.loadPlane(obj, component);
      break;
    case 'sphere':
      this.loadBackgroundSphere(obj, component);
      break;
    case 'obj':
      this.loadObj(obj, component);
      break;
    case 'hvr':
      this.loadHvr(obj, component);
      break;
    case 'audio':
      this.loadAudio(obj, component);
      break;
    default:
      // The javascript should always be up to date?
      console.warn('Unknown component.type' + component.type);
  }
}

Director.prototype.reset = function() {
  this.currentTime = 0;
  this.totalLength = 0;

  // Force a render to clear the canvas.
  this.requiresRender = true;
  // Remove all objects from threeScene.
  angular.forEach(this.objects, function(object) {
    object.Remove();
  });
  this.objects = [];
  this.player.reset();
}

Director.prototype.loadScene = function(scene) {
  this.reset();
  // Load JSON objects.
  if (!scene || !scene.sceneObjects || !scene.sceneObjects.length) {
    console.warn('Scene is empty, no sceneObjects', scene);
  }
  angular.forEach(scene.sceneObjects, angular.bind(this, this.loadObject));

  // Start the render updating
  this.requiresRender = true;
  if (this.notRendering) {
    this.notRendering = false;
    window.requestAnimationFrame(this.animate_.bind(this));
  }

  // TODO test loadScene with and without camera param.
  this.resetCamera(scene.camera);
}

// Put camera in its place based on the the scene.camera field.
Director.prototype.resetCamera = function(cameraParams) {
  if (cameraParams) {
    // The camera has been placed.
    this.cameraMoved = true;
  }
  cameraParams = cameraParams || {}
  // Use camera position or the default.
  var position = cameraParams.position || {x: 0, y: 1.50, z: 5.00};

  this.camera.position.copy(position);

  if (cameraParams && cameraParams.target) {
    // Use target first if it exists.
    this.controls.target.copy(cameraParams.target);
  } else if (cameraParams && cameraParams.quaternion) {
    // Also support quaternion (might be better for different controls)
    this.camera.quaternion.copy(cameraParams.quaternion);
  } else {
    // The default target
    this.controls.target.set(0, 1.50, 0);
  }
  var offset = this.camera.position.clone().sub(this.controls.target);
  var targetDistance = offset.length();

  // Set the pan bounds based on the initial camera target.
  // TODO We probably need different controls here anyway?
  this.controls.panBoundsMin = new THREE.Vector3(-1.00, -1.5, -1.00).add(this.controls.target);
  this.controls.panBoundsMax = new THREE.Vector3(1.00, 0.5, 1.00).add(this.controls.target);

  this.controls.update();
  this.requiresRender = true;
}

Director.prototype.saveJson = function() {
  var sceneObjects = [];

  angular.forEach(this.objects, angular.bind(this, function(object) {
    sceneObjects.push(object.saveJson());
  }));

  return sceneObjects
}

var AssetUpdater = function(obj, hvrComponent, player) {
  var url = hvrComponent.hvrURL;
  if (hvrComponent.hvrFile && hvrComponent.hvrFile.url) {
    url = hvrComponent.hvrFile.url;
  }

  if (!url) {
    console.error(hvrComponent);
    throw new Error('You need a url on your hvrComponent.');
  }
  this.obj = obj;
  this.actorVisible = true;
  this.looping = false;
  this.isPlaying = false;
  this.audioMuted = false;
  // TODO this can be improved?
  this.currentAsset = {
    url: url
  }
  this.updates = [];

  if (hvrComponent.audioFile) {
    this.audio = new EightI.Audio(hvrComponent.audioFile.url);
  } else if (hvrComponent.audioURL) {
    console.warn('Using deprecated audioURL field');
    this.audio = new EightI.Audio(hvrComponent.audioURL);
  } else {
    this.audio = null;
  }

  // No callback required?
  if (this.audio) {
    this.audio.load();
    this.audio.gain.gain.value = 0;
  }
}

AssetUpdater.prototype.addBoundsUpdate = function(updateCallback) {
  // TODO add a list of bounds updates instead of this hacky way?
  var wrapper = function() {
    var bounds = this.actor.getBounds();
    // TODO should be in sync with this.firstBoundsUpdate.
    // Might also be good for this.firstFrameRendered.
    // Also would be good to only start calling updates after bounds have loaded?
    if (bounds.size[0] | bounds.size[1] | bounds.size[2] != 0) {
      updateCallback.apply();
      // Remove this updater after it fired once.
      // console.log('Removed bounds updater');
      index = this.updates.indexOf(wrapper);
      this.updates.splice(index, 1);
    }
  }.bind(this);
  this.updates.push(wrapper);
}

/*
 * Track mesh contains scaler 1/100 and assetBounds.
 * AssetBounds is the size of the asset in the current frame.
 */
AssetUpdater.prototype.getTrackMesh = function() {
  if (!this.trackMesh) {
    // TODO needs a bounding box from the server to do this properly.
    var boundingBoxGeo = new THREE.BoxGeometry(1, 1, 1);

    var boundingBoxMaterial = new THREE.MeshLambertMaterial({wireframe:true});
    this.assetBounds = new THREE.Mesh( boundingBoxGeo , boundingBoxMaterial );
    // Entirely guesses but its nice to have something to start off with.
    // And it is based from the 8i capture area
    this.assetBounds.scale.set(.5, 2, .4);
    this.assetBounds.position.y = 1;
    // assetBounds is the space which the asset is currently occupying.
    // It will change as the asset plays.

    // Default the scale to be 1/100 as the asset uses cm instead of meters.
    // TODO Ideally this should be changed in the player code?
    this.scaler = new THREE.Object3D();
    this.scaler.scale.set(0.01, 0.01, 0.01);

    this.trackMesh = new THREE.Object3D();
    this.trackMesh.add(this.scaler);
    this.trackMesh.add(this.assetBounds);
    // Don't actually show the assets bounding mesh.
    this.trackMesh.visible=false;

    this.trackMesh.matrixAutoUpdate = false;
    this.trackMesh.updateMatrix();
  }
  return this.trackMesh;
}

/* Called once the EightI library has loaded. */
AssetUpdater.prototype.complete = function() {
  try {
    this.asset = new EightI.Asset(this.currentAsset.url, this.currentAsset.framerate || 15, 4.0);
  } catch (e) {
    if (!this.currentAsset.url) {
      console.log('url must be set', this.currentAsset);
    } else if (this.currentAsset.url.indexOf('http://') !== 0 && this.currentAsset.url.indexOf('https://') !== 0) {
      console.warn('Your hvr url isn\'t a full url. Should start with http:// or https://');
    }
    console.error(e, e.stack);
    console.log('asset', this.currentAsset)
    throw new Error('The asset did not load successfully', e);
  }
  this.actor = new EightI.Actor();
  this.actor.setVisible(this.actorVisible);
  this.actor.setAsset(this.asset);

  this.actor.setTransform(new THREE.Matrix4());

  this.firstFrameRendered = false;
}

AssetUpdater.prototype.play = function() {
  if (!this.asset) {
    console.warn('play called before asset loaded');
    return;
  }
  this.isPlaying = true;
  if (this.asset.getDuration() > 0 && this.asset.getCurrentTime() >= this.asset.getDuration()) {
    // If completed, restart from the beginning?
    this.seek(0);
  }
  this.asset.play();
  if (this.audio && !this.audioMuted) {
    this.audio.play(this.asset.getCurrentTime());
  }
}

AssetUpdater.prototype.seek = function(time) {
  this.asset.seek(time);

  if (this.audio && this.isPlaying && !this.audioMuted) {
    this.audio.play(time);
  }
  // Seeking seems to not always render immediately so lets force a couple of render calls.
  // TODO it would be nice to handle this better.
  this.firstFrameRendered = false;
}

AssetUpdater.prototype.pause = function() {
  if (!this.asset) {
    return;
  }
  this.isPlaying = false;
  this.asset.pause();
  if (this.audio) {
    // TODO calling pause on one audio seems to pause all audio sources?
    this.audio.pause();
  }
}

AssetUpdater.prototype.mute = function(mute) {
  this.audioMuted = mute;
  this.asset.mute(mute);
  if (this.audio && !mute && this.isPlaying) {
    this.audio.play(this.asset.getCurrentTime());
  }
}

AssetUpdater.prototype.setLoop = function(loop) {
  this.looping = loop;
}

AssetUpdater.prototype.setVisible = function(visible) {
  this.actorVisible = visible;
  if (this.actor) {
    this.actor.setVisible(visible);
  }
}

AssetUpdater.prototype.update = function(time) {
  if (!this.asset) {
    // console.warn('asset hasn\'t loaded yet');
    return false;
  }
  if (!this.actor.isVisible()) {
    // Skip some of the update for invisible things?
    this.updates.forEach(function(update) {
      requiresRender |= update.apply(null, [time]);
    });

    if (this.asset) {
      this.updateComponentValues(time);
    }
    return requiresRender;
  }
  var bufferDuration = this.asset.getBufferEndPoint();
  if (bufferDuration > 0.0 && !this.firstFrameRendered) {
    // Render first frame hack.
    this.firstFrameRendered = true;
    // TODO Just rendering once doesn't seem to work, so instead we call it twice?
    this.renderIn = 2;
  }

  if (this.asset.getDuration() > 0 && this.asset.getCurrentTime() >= this.asset.getDuration()) {
    // Playback is complete.
    // This doesn't always happen, sometimes something else will detect its finished and call seek(0) on this.
    // E.g scene's restart once they reach the end.
    // TODO callback?
    this.firstFrameRendered = false;
    this.renderIn = 2;
    this.seek(0);
    this.pause();
    if (this.looping) {
      this.play();
    } else {
      if (this.onStop) {
        this.onStop.apply(this);
      }
    }
  }

  if (this.assetBounds) {
    // TODO bounds only changes when time changes, so maybe don't always set this?
    var bounds = this.actor.getBounds();
    // bounds is only relative to the asset, external world movements are tracked above this.
    if (bounds.size[0] > 0) {
      // Bounds takes a while to get a real value.
      this.assetBounds.position.set(bounds.center[0] / 100, bounds.center[1] / 100, bounds.center[2] / 100);
      this.assetBounds.scale.set(bounds.size[0] * 2 / 100, bounds.size[1] * 2 / 100, bounds.size[2] * 2 / 100);

      if (!this.firstBoundsUpdate) {
        this.firstBoundsUpdate = true;
        // This will render once the bounds has been updated the first time.
        return true;
      }
    }

    this.trackMesh.updateMatrix();
    this.scaler.updateMatrixWorld();
    this.actor.setTransform(this.scaler.matrixWorld);
  }

  var requiresRender = false;
  this.updates.forEach(function(update) {
    requiresRender |= update.apply(null, [time]);
  });
  if (this.asset) {
    this.updateComponentValues(time);
  }

  if (this.renderIn > 0) {
    this.renderIn--;
    return true;
  }
  return this.isPlaying || requiresRender;
}

AssetUpdater.prototype.updateComponentValues = function(time) {
  var requiresRender = false;
  // Update obj information.
  var frame =  Math.round(time * 10);
  if (this.obj.isAliveAtFrame(frame)) {
    this.actor.setVisible(true);
  } else {
    this.actor.setVisible(false);
  }
  // While not completely loaded update the scope.
  if (this.asset.getBufferEndPoint() > 0) {
    if (this.downloadedLength < this.asset.getBufferEndPoint() + this.asset.getPartialBufferDuration()) {
      // TODO double check if we need to render while the asset loads?
      // requiresRender = true;
    }
    this.downloadedLength = this.asset.getBufferEndPoint() + this.asset.getPartialBufferDuration();
    this.playableLength = this.asset.getBufferEndPoint();
    if (this.playableLength >= this.asset.getDuration()) {
      // Once loading is compete then the asset can technically be play for an Infinite length.
      this.downloadedLength = Infinity;
      this.playableLength = Infinity;
    }
  }
  if (this.audio && !this.audio.initialised) {
    // If audio exists and has not loaded yet, then this component is not ready.
    this.downloadedLength = 0;
    this.playableLength = 0;
  }
  // This assumes that this is the only component in the object.
  // TODO refactor this, and all the other bits which assume this.
  this.obj.downloadedLength = this.downloadedLength;
  this.obj.playableLength = this.playableLength;

  // Update the obj's frames based on the length of this.
  if (this.asset.getDuration() > 0) {
    this.obj.totalFrames = Math.ceil(this.asset.getDuration() * 10);
    // Update the endFrame as well.
    this.obj.endFrame = this.obj.startFrame + this.obj.totalFrames;
  }

  // Update the outline with the un rotated mesh.
  // We need to duplicate the mesh of the assetBounds so we don't get the rotated/scaled version of it.
  // If we use a transformed mesh then the outline is affected by those transforms.
  // E.g a rotated box's bounding box contains the box, but is not rotated.
  // Also a translated box's bounding box is centered at the translated location.
  var boundingBoxGeo = new THREE.BoxGeometry(
    this.assetBounds.scale.x,
    this.assetBounds.scale.y,
    this.assetBounds.scale.z
  );
  var boundingBoxMesh = new THREE.Mesh(boundingBoxGeo, null);
  boundingBoxMesh.position.copy(this.assetBounds.position);
  this.obj.outline.update(boundingBoxMesh);

  return requiresRender;
}

var PlayerService = function() {
  this.canvas = document.getElementById('canvas');
  if (!this.canvas) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'canvas';
  }
  this.width = this.canvas.clientWidth;
  this.height = this.canvas.clientHeight;
  // Set the max distance to be a bit further away for now, as the scales of some things might be large.
  this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, .01, 50);
  this.camera.position.set(0, 1.50, 5.00);

  this.viewportChanged = true;
  this.isPlaying = false;

  // Getting a default WebGlRenderer should be easier?
  try {
    this.webglRenderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas: this.canvas,
      alpha: true
    });
    this.webglRenderer.setPixelRatio(window.devicePixelRatio);
    this.webglRenderer.setSize(this.width, this.height, false);
    this.webglRenderer.shadowMap.enabled = false;
    this.webglRenderer.shadowMap.cullFace = THREE.CullFaceBack;
    this.webglRenderer.autoClear = false;

    // Default to black background.
    this.webglRenderer.setClearColor(0x000000);

    this.player = new EightI.Player(this.canvas, this.webglRenderer.context);
  } catch (e) {
    this.unsupported = 'WebGLRenderer not supported';
    return;
  }

  window.addEventListener('resize', this.resize.bind(this));
  this.resize();

  // A list of 8i assets for special treatment.
  this.assets = [];
  // A list of audio's for play/pause/seek.
  // TODO not sure that these should be in here?
  this.audios = [];

  this.assetUpdaters = [];
  // Call animate once everything is loaded.
  this.player.onReady = function() {
    this.complete_();
  }.bind(this);
  if (EightI.Env.is_initialised) {
    this.complete_();
  }
}

PlayerService.prototype.setOrthographicCamera = function() {
  // Initial values don't matter as resize will update them.
  this.cameraScale = 100;
  var x = this.width / this.cameraScale;
  var y = this.height / this.cameraScale;
  this.camera = new THREE.OrthographicCamera(-x, x, y, -y, -5, 50);
}

PlayerService.prototype.complete_ = function() {
  this.viewport = new EightI.Viewport();
  this.frameBuffer = new EightI.FrameBuffer({'object': 0});

  this.frameBuffer.setSize(new THREE.Vector2(this.width, this.height));

  this.viewport.setFrameBuffer(this.frameBuffer);
  this.player.addViewport(this.viewport);

  this.viewport.setProjMatrix(this.camera.projectionMatrix);
  this.viewport.setNearFarPlane(this.camera.near, this.camera.far);
  this.viewport.setDimensions(0, 0, this.width * window.devicePixelRatio, this.height * window.devicePixelRatio);

  // Other eye view port for cardboard mode.
  this.viewportR = new EightI.Viewport();
  this.viewportR.setFrameBuffer(this.frameBuffer);
  this.viewportR.setProjMatrix(this.camera.projectionMatrix);
  this.viewportR.setNearFarPlane(this.camera.near, this.camera.far);
  this.viewportR.setDimensions(this.width / 2 * window.devicePixelRatio, 0, this.width / 2 * window.devicePixelRatio, this.height * window.devicePixelRatio);

  this.scene = new EightI.Scene();
  this.player.setScene(this.scene);

  for (i = 0; i < this.assetUpdaters.length; i++) {
    this.assetUpdaters[i]();
  }
  // If anything trys to add to this it will error instead of silently doing nothing.
  this.assetUpdaters = null;
}

PlayerService.prototype.addAsset = function(asset) {
  // Need to have this so we can call play on each when they need to play/pause?
  // Also need to find the durations of these things?
  this.assets.push(asset);

  if (!this.scene) {
    // player hasn't loaded yet.

    // Register for the assets complete method to get called when the player loads.
    this.onCompleted(function() {
      asset.complete()
      this.scene.attachActor(asset.actor);
    }.bind(this));
    return;
  }

  // Call complete immediately if the player is already loaded.
  asset.complete();

  this.scene.attachActor(asset.actor);
};

PlayerService.prototype.addAudio = function(audio) {
  this.audios.push(audio);
}

// Remove an AssetUpdater from the PlayerService.
PlayerService.prototype.remove = function(asset) {
  this.scene.detachActor(asset.actor);
  // To clean up some memory we destroy the actor as well.
  // TODO this seems to sometime cause an error in an onload callback.
  // The sometimes seems more common if you change assets quickly when they aren't cached?
  // As if the destroyed asset still has a request in progress but the context for the onload is removed.
  // The exception is not fatal and can be ignored AFAIK.
  asset.actor.destroy();
}

PlayerService.prototype.onCompleted = function(callback) {
  if (this.scene) {
    callback();
  } else {
    this.assetUpdaters.push(callback);
  }
}

PlayerService.prototype.resize = function() {
  if (this.canvas.clientWidth == 0) {
    console.log('canvas was sized at', this.width, this.height);
    console.log('canvas resizing to', this.canvas.clientWidth, this.canvas.clientHeight);
    console.error('PlayerService should not be resized to 0 width');
  }
  this.width = this.canvas.clientWidth;
  this.height = this.canvas.clientHeight;
  if (this.camera.type == "OrthographicCamera") {
    // OrthographicCamera
    // camScale is esentially the scale of everything due to Orthographic.
    // Inverse scale, smaller makes items appear larger.
    this.camera.left = -this.width / this.cameraScale;
    this.camera.right = this.width / this.cameraScale;
    this.camera.top = this.height / this.cameraScale;
    this.camera.bottom = -this.height / this.cameraScale;
  } else {
    this.camera.aspect = this.width / this.height;
  }
  this.camera.updateProjectionMatrix();
  if (this.webglRenderer.getPixelRatio() != window.devicePixelRatio) {
    // Only set pixel ratio if its not already set.
    // iPhones sometimes do crazy things if you set this more than once per screen orientation?
    // I'm not really sure what their deal is entirely, but this seems to fix it.
    this.webglRenderer.setPixelRatio(window.devicePixelRatio);
  }

  this.webglRenderer.setSize(this.width, this.height, false);

  if (this.frameBuffer) {
    this.frameBuffer.setSize(new THREE.Vector2(this.width, this.height));
  }
  if (this.viewport) {
    this.viewport.setProjMatrix(this.camera.projectionMatrix);
    this.viewport.setDimensions(0, 0, this.width * window.devicePixelRatio, this.height * window.devicePixelRatio);
  }
  if (this.cardboard) {
    this.cardboard.setSize(this.width, this.height);

    this.viewportR.setProjMatrix(this.camera.projectionMatrix);
    this.viewportR.setDimensions(this.width / 2 * window.devicePixelRatio, 0, this.width / 2 * window.devicePixelRatio, this.height * window.devicePixelRatio);

    this.viewport.setDimensions(0, 0, this.width * window.devicePixelRatio / 2, this.height * window.devicePixelRatio);
  }

  this.viewportChanged = true;
};

PlayerService.prototype.reset = function() {
  if (this.scene) {
    this.scene.destroy();
    this.scene = null;
  }
  this.assetUpdaters = [];
  this.assets = [];
  if (EightI.Env.is_initialised) {
    this.scene = new EightI.Scene();
    this.player.setScene(this.scene);
  }
}

PlayerService.prototype.enableCardboard = function() {
  if (!this.cardboard) {
    this.cardboard = new THREE.StereoEffect(this.webglRenderer);
    // Because scenes deal with meters rather than cm.
    this.cardboard.separation = .3;
    this.player.addViewport(this.viewportR);
    // resize should always be called after this.
    // Usually due to a requestFullScreen call.

    // this.cardboard.setSize(this.width, this.height);
    // this.viewport.setDimensions(0, 0, this.width * window.devicePixelRatio / 2, this.height * window.devicePixelRatio);
  }
}

PlayerService.prototype.disableCardboard = function() {
  this.player.removeViewport(this.viewportR);
  this.cardboard = null;
}

PlayerService.prototype.update = function(time) {
  if (this.isPlaying && this.lastUpdateTime != undefined) {
    this.currentTime += (time - this.lastUpdateTime) / 1000;
  }
  this.lastUpdateTime = time;

  var requiresRender = false;

  if (!this.viewport) {
    return false;
  }

  this.player.update(time / 1000);

  if (this.cardboard) {
    var cameras = this.cardboard.cameras;

    cameras.left.updateMatrixWorld();
    cameras.left.matrixWorldInverse.getInverse(cameras.left.matrixWorld);
    cameras.right.updateMatrixWorld();
    cameras.right.matrixWorldInverse.getInverse(cameras.right.matrixWorld);

    if (this.viewportR.isValid()) {
      this.viewportChanged |= this.viewportR.setViewMatrix(cameras.right.matrixWorldInverse);
      // Maybe don't need these?
      this.viewportChanged |= this.viewportR.setProjMatrix(cameras.right.projectionMatrix);
      this.viewportChanged |= this.viewportR.setDimensions(this.width / 2 * window.devicePixelRatio, 0, this.width / 2 * window.devicePixelRatio, this.height * window.devicePixelRatio);
    } else {
      console.warn('cardboard right viewport not valid');
      this.viewportChanged = true;
    }

    if (this.viewport.isValid()) {
      this.viewportChanged |= this.viewport.setViewMatrix(cameras.left.matrixWorldInverse);
      this.viewportChanged |= this.viewport.setProjMatrix(cameras.left.projectionMatrix);
      this.viewportChanged |= this.viewport.setDimensions(0, 0, this.width / 2 * window.devicePixelRatio, this.height * window.devicePixelRatio);
    } else {
      console.warn('cardboard left viewport not valid');
      this.viewportChanged = true;
    }
  } else {
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.getInverse(this.camera.matrixWorld);

    if (this.viewport.isValid()) {
      this.viewportChanged |= this.viewport.setViewMatrix(this.camera.matrixWorldInverse);
    } else {
      console.warn('viewport not valid');
      this.viewportChanged = true;
    }
  }

  this.player.prepareRender();
  return this.isPlaying || requiresRender || this.viewportChanged;
}

PlayerService.prototype.render = function() {
  this.player.render();
  this.viewportChanged = false;
}

PlayerService.prototype.takeScreenshot = function() {
  this.webglRenderer.clear(true, true, true);
  this.render();
  this.webglRenderer.resetGLState();

  return this.webglRenderer.domElement.toDataURL();
}

if (typeof(angular) !== 'undefined') {
  angular.module('player2Service', [])
  .service('playerService', PlayerService)
  .service('director', Director)
}
