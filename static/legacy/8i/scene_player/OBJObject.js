
// Wrapper class for OBJ functionality
// requires OBJTool.js to be loaded first
var OBJObject = function ( object, scene ) {

	this.wrapper = new THREE.Object3D();
	this.meshObject = null;
	this.outline = null;

	this.scene = scene;
	this.director = object.director;
	if (object.director) {
	  // special director handling?
	  // TODO remove this.
    if (object.director.background) {
	    this.type = 'background'
    }
	}
	this.components = object.components;
	this.componentObjects = [];
	this.initialTransform = object.transform;
	// This is the frame when the object will appear.
	var startTime = object.startTime || 0;
	this.startFrame = Math.round(startTime * 10);
	if (object.startFrame) {
		this.startFrame = object.startFrame;
	}
	// This is the frame when the object will disappear.
	var endTime = object.endTime || Infinity;
	this.endFrame = Math.round(endTime * 10);
	if (object.endFrame) {
		this.endFrame = object.endFrame;
	}
	this.fadeLength = 8; // Number of frames this object takes to fade in/out of the scene.

  this.wrapper.scale.set(object.transform.scale.x, object.transform.scale.y, object.transform.scale.z);
  this.wrapper.quaternion.set(object.transform.quaternion.x, object.transform.quaternion.y, object.transform.quaternion.z, object.transform.quaternion.w);
  this.wrapper.position.set(object.transform.position.x, object.transform.position.y, object.transform.position.z);

	this.finePosition = new THREE.Vector3(0, 0, 0);
	this.finePosition.copy(this.wrapper.position);

	this.currentTime = 0;

	// These should be calculated again when components are added.
	this.downloadedLength = 0;
	this.playableLength = 0;

	this.keyFrames = [];
  if (object.timeline) {
		this.keyFrames = object.timeline.keyFrames;
		angular.forEach(this.keyFrames, function(keyFrame) {
			if (!keyFrame.frameIndex) {
				// Generate frameIndex if it doesn't exist.
				keyFrame.frameIndex = Math.round(keyFrame.time * 10);
				delete keyFrame.time;
			}
		});
  }
  this.totalFrames = this.getTotalFrames();

	this.selected = false;
	this.useBoundingBox = false;

	this.name = object.name;

	this.initialised = false;
}

/**
 * Called when a component is ready.
 * Currently only tested properly with a single component per object.
 */
OBJObject.prototype.Initialise = function(object) {
	this.meshObject = object;

	this.wrapper.add(object);

	// Once the object is initialized we assume its fully loaded.
	// Individual components can manually update these as required.
	this.downloadedLength = Infinity;
	this.playableLength = Infinity;

	// These types can be hidden/removed from the scene so their start and end time can be changed.
	this.hideable = this.type == 'obj' || this.type == 'text3d';
	this.hideable |= this.type == 'plane';

	// Background's aren't editable so we don't create a bounding mesh or outline.
	if (this.type !== 'background') {
		// Outline is a wireframe around the object which is shown when its selected.
		this.outline = new THREE.BoxHelper(object);
		this.outline.material.color = new THREE.Color(0x00BCD4);
		this.outline.material.linewidth = 2;
		this.wrapper.add(this.outline);

		// this.outline = this.CreateOutline(object);

		// Always create this as it calculates this.longestSide.
		// It also scales down large objects to be < 5m on their longest side.
		// That should make them visible in the scene when added.
		bounds = this.CreateBoundingMesh(object);
		if (this.useBoundingBox) {
			this.raycastObject = bounds;

			// hack to fix raycasting which only works on visible objects in the scene.
			// So we put the visible bounding box inside an invisible object.
			var boundsWrap = new THREE.Object3D();
			boundsWrap.add(this.raycastObject);
			boundsWrap.visible=false;
			this.wrapper.add(boundsWrap);
		} else {
			this.meshObject.parentObj = this;
			// The actual meshObject should be visible for OBJ's
			// Asset track meshes will not be though?
			if (!this.meshObject.visible) {
				// Assets tracking meshes are invisible but we still want to use them to raycast.
				// Instead we use the child mesh which is visible.
				// TODO is there a nicer way to do this, allow raycast object to be set externally?
				this.raycastObject = this.meshObject.children[1];
			} else {
				this.raycastObject = this.meshObject;
			}
		}
	}

	this.scene.add(this.wrapper);

	this.Deselect();

	this.initialised = true;
};

/* Clean up all the three js models which this object uses. */
OBJObject.prototype.Remove = function() {
	this.scene.remove(this.wrapper);
}

OBJObject.prototype.resetKeyFrames = function() {
	this.keyFrames = [];
}

/* Remove a keyFrame at a time. */
OBJObject.prototype.deleteKeyFrame = function(keyFrame) {
	for (i = 0; i < this.keyFrames.length; i++) {
		if (keyFrame.frameIndex === this.keyFrames[i].frameIndex) {
			this.keyFrames.splice(i, 1);
			break;
		}
	}
}

/**
 * Gets the keyframe which is closest before the time passed in.
 * Or the first keyframe when time is before the first one.
 * @private
 */
OBJObject.prototype.GetKeyFrame = function(frame) {
	var keyFrame = this.initialTransform;

  for (var i = 0; i < this.keyFrames.length; i++) {
    if (frame < this.keyFrames[i].frameIndex) {
    	break;
    }
    keyFrame = this.keyFrames[i];
  }

	for (var i = 0; i < this.keyFrames.length; i++) {
		// when we find the first keyFrame after time we break. This happens before
		// we set keyFrame so that the return value is the keyFrame before time.
		if (frame < this.keyFrames[i].frameIndex) break;
		keyFrame = this.keyFrames[i];
	}
	return keyFrame
};

OBJObject.prototype.SortKeyFrames = function() {
	this.keyFrames.sort(function(a, b) {
		return a.frameIndex - b.frameIndex;
	});
}

OBJObject.prototype.getTotalLength = function() {
	return this.totalFrames / 10;
}

OBJObject.prototype.getTotalFrames = function() {
	var lastFrame = this.startFrame;

	if (this.keyFrames.length > 0) {
		var lastKeyFrame = this.keyFrames[this.keyFrames.length - 1];
		if (lastKeyFrame.frameIndex > lastFrame) {
			lastFrame = lastKeyFrame.frameIndex;
		}
	}
	if (this.endFrame < Infinity && this.endFrame > lastFrame) {
		lastFrame = this.endFrame;
	}
	return lastFrame;
};

OBJObject.prototype.setOpacity = function(opacity) {
	this.wrapper.traverse(function( node ) {
    if (node.material) {
    	if (node.material.materials) {
    		// Iterate all of the multi materials?
	      node.material.materials.forEach(function(material) {
	      	material.opacity = opacity;
	      });
    	}
      node.material.opacity = opacity;
    }
	});
}

OBJObject.prototype.addComponent = function(component) {
	this.componentObjects.push(component);
}

// Called when a components load state has changed.
OBJObject.prototype.componentLoaded = function(component) {
  // TODO this should update obj based on all components?
  // This is currently only used by audio loading.
  // It also assumes that there is only a single component.
  this.totalLength = component.totalLength;
  this.endFrame = parseInt(component.totalLength * 10, 10);
  this.downloadedLength = Infinity;
  this.playableLength = Infinity;
}

OBJObject.prototype.play = function(time) {
	if (!this.isAliveAtFrame(time * 10)) {
		// Only play if the object is alive?
		// TODO will need to play at startTime if we allow this to move?
		// That is not currently an issue.
		return;
	}
	this.isPlaying = true;
	this.componentObjects.forEach(function(component) {
		component.play(time);
	});
}

OBJObject.prototype.pause = function() {
  this.isPlaying = false;
	this.componentObjects.forEach(function(component) {
		component.pause();
	});
}

OBJObject.prototype.mute = function(mute) {
	this.componentObjects.forEach(function(component) {
		component.mute(mute);
	});
}

OBJObject.prototype.seek = function(time) {
	this.componentObjects.forEach(function(component) {
		component.seek(time);
	});
}

OBJObject.prototype.update = function(time) {
	// Call update on each component this object has.
	var requiresRender = false;
	this.componentObjects.forEach(function(component) {
		requiresRender |= component.update(time);
	});
	return requiresRender;
};

OBJObject.prototype.UpdateAnimation = function(time) {
	// this.currentTime = Math.round(time * 100) / 100;
	var frame =  Math.round(time * 10);
	this.currentFrame = frame;

	if (this.isAliveAtFrame(frame)) {
		if (frame < this.startFrame) {
			// Fading in.
			// startFrame should be 1, startFrame - fadeLength should be 0
			this.setOpacity(1 - (this.startFrame - time * 10) / this.fadeLength);
			this.fullOpacity = false;
		} else if (frame > this.endFrame) {
			// Fading out.
			// endFrame should be 1, endFrame + fadeLength should be 0
			this.setOpacity(1 - (time * 10 - this.endFrame) / this.fadeLength);
			this.fullOpacity = false;
		} else if (!this.fullOpacity) {
			// Solid for most of its life span.
			this.setOpacity(1);
			this.fullOpacity = true;
		}
		this.wrapper.visible = true;
	} else {
		// Hide things before and after their showtime.
		this.wrapper.visible = false;
		// No need to use keyFrames for an invisible thing.
		return;
	}

	// Make sure the outline can change if the object does.
	// This is difficult, we want the outline to rotate so it should be updated from
	// assetBounds directly and not box a rotated item.
	// However everything which is under wrapper will be rotated.
	// this.outline.update(this.raycastObject);

	var currentKeyFrame = this.initialTransform;
  var nextKeyFrame = currentKeyFrame;

  for (var i = 0; i < this.keyFrames.length; i++) {
    // when we find the first keyFrame after time we break. This happens before
    // we set keyFrame so that the return value is the keyFrame before time.
    nextKeyFrame = this.keyFrames[i];
    if (frame < this.keyFrames[i].frameIndex) break;
    currentKeyFrame = this.keyFrames[i];
  }

	var currentFrameIndex = currentKeyFrame.frameIndex || 0;
	var nextFrameIndex = nextKeyFrame.frameIndex || 0;

	if (currentFrameIndex == time * 10 || currentFrameIndex == nextFrameIndex) {
		// There is no animation required, just set to the key frame.
		this.wrapper.position.copy(currentKeyFrame.position);
		this.finePosition.copy(currentKeyFrame.position);
		var scale = currentKeyFrame.scale || {x: 1, y: 1, z: 1};
		this.wrapper.scale.copy(scale);
		this.wrapper.quaternion.copy(currentKeyFrame.quaternion);
		return;
	}

	// Use time here to get more precise lerping between keyframes.
	var lerpFactor = ((time * 10) - currentFrameIndex) / (nextFrameIndex - currentFrameIndex);
	lerpFactor = Math.max(Math.min(lerpFactor, 1.0), 0);

	var vl = new THREE.Vector3();
	vl.copy(currentKeyFrame.position);
	vl.lerp(nextKeyFrame.position, lerpFactor);
	this.wrapper.position.copy(vl);
  this.finePosition.copy(vl);


	// We don't use a linear scale because that doesn't look good.
	// E.g 1 -> 10 linearly would scale 5.5x in the first half then ~2x in the second.
	// Instead use exponential scale which scales evenly in first and second half.
	// E.g (10/1) ^ 0.5 = 3.16x in each half.
	var currentScale = currentKeyFrame.scale ? currentKeyFrame.scale.x : 1
	var nextScale = 1;
	if (nextKeyFrame.scale) {
		nextScale = nextKeyFrame.scale.x;
	}
	var s = currentScale * Math.pow(nextScale / currentScale, lerpFactor);
	// round the scale to 2dp.
	s = parseFloat(s.toFixed(2));
	this.wrapper.scale.set(s, s, s);

	var qs = new THREE.Quaternion();
	qs.copy(currentKeyFrame.quaternion);
	var q2 = new THREE.Quaternion();
  q2.copy(nextKeyFrame.quaternion);
	qs.slerp(q2, lerpFactor);
	this.wrapper.quaternion.copy(qs);
};

OBJObject.prototype.CreateOutline = function ( object ) {

	var boundingBox = new THREE.Box3().setFromObject(object);
	var boundingCenter = boundingBox.center();

	var boundingBoxGeo = new THREE.BoxGeometry(
		boundingBox.max.x - boundingBox.min.x,
		boundingBox.max.y - boundingBox.min.y,
		boundingBox.max.z - boundingBox.min.z
	);

	var boundingBoxMesh = new THREE.Mesh(boundingBoxGeo, null);

	var boxHelper = new THREE.BoxHelper(boundingBoxMesh);

	boxHelper.material.color = new THREE.Color(0xEE0033);

	var boxHelperObject = new THREE.Object3D();
	boxHelperObject.add(boxHelper);
	boxHelperObject.position.copy(boundingCenter);

	var outline = new THREE.Object3D();

	outline.add(boxHelperObject);

	return outline;
};

OBJObject.prototype.CreateBoundingMesh = function( object ) {

	var boundingBox = new THREE.Box3().setFromObject(object);
	var boundingCenter = boundingBox.center();

	var boundingBoxGeo = new THREE.BoxGeometry(
		boundingBox.max.x - boundingBox.min.x,
		boundingBox.max.y - boundingBox.min.y,
		boundingBox.max.z - boundingBox.min.z
	);
	// This is handy for scaling limits.
	// Big objects can scale less than small.
	this.longestSide = Math.max(
		boundingBoxGeo.parameters.width,
		Math.max(boundingBoxGeo.parameters.height, boundingBoxGeo.parameters.depth)
	);

	var shortestSide = Math.min(
		boundingBoxGeo.parameters.width,
		Math.min(boundingBoxGeo.parameters.height, boundingBoxGeo.parameters.depth)
	);
	// This only needs to occur when adding a new non background to the scene.
	// TODO do we still need this now? Assets scales were way off before as they were in cm.
	if (this.longestSide !== 0 && this.longestSide * this.wrapper.scale.x > 5) {
		// Scale down so that everything is max of 5m across its longest dimension.
		s = 5 / (this.longestSide * this.wrapper.scale.x);
		this.Scale(s);
	}

	var boundingBoxMaterial = new THREE.MeshLambertMaterial({wireframe:true});

	var boundingBoxMesh = new THREE.Mesh( boundingBoxGeo , boundingBoxMaterial );

	boundingBoxMesh.position.copy(boundingCenter);

	boundingBoxMesh.parentObj = this;
	return boundingBoxMesh;
};

OBJObject.prototype.isAliveAtFrame = function(frame) {
	return frame >= this.startFrame - this.fadeLength && frame <= this.endFrame + this.fadeLength;
}

OBJObject.prototype.GetRaycastObject = function() {
	return this.raycastObject;
};

OBJObject.prototype.Select = function() {
	if (this.outline) {
		this.outline.visible = this.selected = true;
	}
};
OBJObject.prototype.Deselect = function() {
	if (this.outline) {
		this.outline.visible = this.selected = false;
	}
	this.selectedKeyFrame = null;
};

OBJObject.prototype.Translate = function(x, y, z) {
	this.finePosition.x += x;
	this.finePosition.y += y;
	this.finePosition.z += z;

	this.updatePosition_();
}

OBJObject.prototype.SetTranslation = function(x, y, z) {
	this.finePosition.x = x;
	this.finePosition.y = y;
	this.finePosition.z = z;
	this.updatePosition_();
};

OBJObject.prototype.SetTranslationX = function(x) {
	this.finePosition.x = x;
	this.updatePosition_();
};

OBJObject.prototype.SetTranslationY = function(y) {
	this.finePosition.y = y;
	this.updatePosition_();
};

OBJObject.prototype.SetTranslationZ = function(z) {
	this.finePosition.z = z;
	this.updatePosition_();
};

/* @private This should be called whenever finePosition is updated */
OBJObject.prototype.updatePosition_ = function() {
	// Bound to -3 < x < 3
	this.finePosition.x = Math.min(3.00, Math.max(-3.00, this.finePosition.x));
	this.finePosition.y = Math.min(3.00, Math.max(-3.00, this.finePosition.y));
	this.finePosition.z = Math.min(3.00, Math.max(-3.00, this.finePosition.z));

	this.wrapper.position.x = Math.round(this.finePosition.x * 100) / 100;
	this.wrapper.position.y = Math.round(this.finePosition.y * 100) / 100;
	this.wrapper.position.z = Math.round(this.finePosition.z * 100) / 100;

	this.UpdateCurrentKeyFrame();
};

OBJObject.prototype.RotateQuaternion = function(q) {

	if (this.initialised) {

		this.wrapper.quaternion.multiplyQuaternions( q , this.wrapper.quaternion );

		this.UpdateCurrentKeyFrame();
	}

};

OBJObject.prototype.Scale = function(s) {
	// Assumes all scales are the same size, only supports single aspect ratio.
	if (s > 1 && this.longestSide * this.wrapper.scale.x * s > 5.00) {
		// too big, don't scale any larger
		return;
	}
	if (s < 1 && this.longestSide * this.wrapper.scale.x * s < 0.1) {
		// too small, don't scale any smaller
		return;
	}

	this.wrapper.scale.multiplyScalar(s);

	this.UpdateCurrentKeyFrame();
};

OBJObject.prototype.UpdateCurrentKeyFrame = function() {

	// Snap currentTime to nearest?
  if (this.currentFrame < this.startFrame || this.currentFrame > this.endFrame) {
  	throw new "Can't create key frame when object is not present in the timeline."
  }

	var keyFrame = this.GetKeyFrame(this.currentFrame);

	if (this.currentFrame > this.startFrame && keyFrame.frameIndex != this.currentFrame) {
		keyFrame = {
			frameIndex: this.currentFrame
		}
		if (this.keyFrames.length == 0) {
			this.keyFrames.push(keyFrame);
		} else {
			var i = 0;
			for (i = 0; i < this.keyFrames.length; i++) {
				if (keyFrame.frameIndex < this.keyFrames[i].frameIndex)
					break;
			}
			this.keyFrames.splice(i, 0, keyFrame);
		}
		// Update the total frames for this object.
		this.totalFrames = this.getTotalFrames();
	}
	// update the keyFrame parts.
	// TODO should just maintain a currentKeyFrame instead of currentTime?
	keyFrame.scale = {
		x: this.wrapper.scale.x,
		y: this.wrapper.scale.y,
		z: this.wrapper.scale.z
	};
	keyFrame.position = {
		x: this.wrapper.position.x,
		y: this.wrapper.position.y,
		z: this.wrapper.position.z
	};
	keyFrame.quaternion = {
		x: this.wrapper.quaternion.x,
		y: this.wrapper.quaternion.y,
		z: this.wrapper.quaternion.z,
		w: this.wrapper.quaternion.w
	};
	currentKeyFrame = keyFrame;
};

OBJObject.prototype.saveJson = function() {
	var sceneObject = {
    name: this.name,
    transform: this.initialTransform,
    components: this.components,
  };
  if (this.director) {
    sceneObject.director = this.director;
  }
  if (this.startFrame) {
    sceneObject.startFrame = this.startFrame;
  }
  if (this.endFrame < Infinity) {
    sceneObject.endFrame = this.endFrame;
  }
  if (this.director) {
    sceneObject.director = this.director;
  }
  if (this.keyFrames.length > 0) {
    sceneObject.timeline = {
      keyFrames: this.keyFrames
    }
  }
  return sceneObject;
}
