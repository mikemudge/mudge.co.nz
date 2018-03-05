var OrbitControl = function(object) {
  if (!object) {
    throw new Error('object was null');
  }
  this.rotateStart = new THREE.Vector2();
  this.rotateEnd = new THREE.Vector2();
  this.rotateDelta = new THREE.Vector2();
  this.rotateSpeed = 1;
  this.thetaDelta = 0;
  this.phiDelta = 0;
  this.object = object;

  this.offset = new THREE.Vector3();
}

OrbitControl.prototype.init = function(x, y, target) {
  this.target = target;
  this.rotateStart.set(x, y);
  this.rotateEnd.set(x, y);
}

OrbitControl.prototype.move = function(x, y, element) {
  this.rotateEnd.set(x, y);
  this.rotateDelta.subVectors( this.rotateEnd, this.rotateStart );

  // rotating across whole screen goes 360 degrees around
  this.thetaDelta -= 2 * Math.PI * this.rotateDelta.x / element.clientWidth * this.rotateSpeed;

  // rotating up and down along whole screen attempts to go 360, but limited to 180
  this.phiDelta -= 2 * Math.PI * this.rotateDelta.y / element.clientHeight * this.rotateSpeed;

  this.rotateStart.copy( this.rotateEnd );

  this.update();
}
var EPS = 0.000001;

OrbitControl.prototype.update = function() {
  var position = this.object.position;
  this.offset.copy( position ).sub( this.target );
  // rotate offset to "y-axis-is-up" space
  // this.offset.applyQuaternion( quat );

  // angle from z-axis around y-axis
  var radius = this.offset.length();
  var theta = Math.atan2( this.offset.x, this.offset.z );
  // angle from y-axis
  var phi = Math.atan2( Math.sqrt( this.offset.x * this.offset.x + this.offset.z * this.offset.z ), this.offset.y );

  theta += this.thetaDelta;
  phi += this.phiDelta;
  phi = Math.max( EPS, Math.min( Math.PI - EPS, phi ) );

  this.thetaDelta = 0;
  this.phiDelta = 0;

  this.offset.x = radius * Math.sin( phi ) * Math.sin( theta );
  this.offset.y = radius * Math.cos( phi );
  this.offset.z = radius * Math.sin( phi ) * Math.cos( theta );

  // rotate offset back to "camera-up-vector-is-up" space
  // this.offset.applyQuaternion( quatInverse );

  position.copy( this.target ).add( this.offset );

  this.object.lookAt( this.target );
}

var RotateTool = function(object) {
  if (!object) {
    throw new Error('object was null');
  }
  this.rotateStart = new THREE.Vector2();
  this.rotateEnd = new THREE.Vector2();
  this.rotateDelta = new THREE.Vector2();
  this.rotateSpeed = 5;
  this.rotateVerticalSpeed = 0;
  this.object = object;
}

RotateTool.prototype.init = function(x, y, target) {
  this.target = target;
  this.rotateStart.set(x, y);
  this.rotateEnd.set(x, y);
}

RotateTool.prototype.move = function(x, y, element) {
  this.rotateEnd.set(x, y);
  this.rotateDelta.subVectors( this.rotateEnd, this.rotateStart );

  // Mouse x movement rotates around the y axis.
  this.object.rotation.y += this.rotateDelta.x / element.clientWidth * this.rotateSpeed;

  this.object.rotation.x += this.rotateDelta.y / element.clientHeight * this.rotateVerticalSpeed;
  this.object.position.y -= this.rotateDelta.y / element.clientHeight;

  this.rotateStart.copy(this.rotateEnd);
}

var PanControl = function(object) {
  if (!object) {
    throw new Error('object was null');
  }
  this.panStart = new THREE.Vector2();
  this.panEnd = new THREE.Vector2();
  this.panDelta = new THREE.Vector2();
  this.pan = new THREE.Vector3();
  this.object = object;
}

PanControl.prototype.init = function(x, y, target) {
  this.target = target;
  this.panStart.set(x, y);
  this.panEnd.set(x, y);
}

PanControl.prototype.move = function(x, y, element) {
  this.panEnd.set(x, y);
  this.panDelta.subVectors( this.panEnd, this.panStart );

  var offset = this.object.position.clone().sub( this.target );
  var targetDistance = offset.length();

  var deltaX = -this.panDelta.x * targetDistance / element.clientHeight;
  var deltaY = this.panDelta.y * targetDistance / element.clientHeight;

  this.pan.set(deltaX, deltaY, 0);
  // Apply the objects quaternion to this so panning is relative to the object.
  // Makes the object always do a straffing action.
  this.pan.applyQuaternion(this.object.quaternion);

  this.target.add(this.pan);
  this.object.position.add(this.pan);

  this.panStart.copy( this.panEnd );
}

var PanZControl = function(object) {
  if (!object) {
    throw new Error('object was null');
  }
  this.panStart = new THREE.Vector2();
  this.panEnd = new THREE.Vector2();
  this.panDelta = new THREE.Vector2();
  this.pan = new THREE.Vector3();
  this.object = object;
}

PanZControl.prototype.init = function(x, z, target) {
  this.target = target;
  this.panStart.set(x, z);
  this.panEnd.set(x, z);
}

PanZControl.prototype.move = function(x, z, element) {
  this.panEnd.set(x, z);
  this.panDelta.subVectors( this.panEnd, this.panStart );

  // TODO should use distance from camera as a move speed.
  var deltaX = -this.panDelta.x / 100;
  var deltaZ = this.panDelta.y /* z */ / 100;

  this.pan.set(deltaX, 0, deltaZ);
  // Apply the objects quaternion to this so panning is relative to the object.
  // Makes the object move forward/back for the direction its facing.
  this.pan.applyQuaternion(this.object.quaternion);

  this.target.add(this.pan);
  this.object.position.add(this.pan);

  this.panStart.copy(this.panEnd);
}

var OrientationControls = function(object) {
  this.object = object;
  this.alpha = 0;
  this.beta = 0;
  this.gamma = 0;
  this.quaternion = new THREE.Quaternion();
  this.initialRotation = 0;
  this.deviceEuler = new THREE.Euler();

  this.transform = new THREE.Quaternion();
  this.onScreenOrientationChangeEvent();

  // The number of update calls and device orientation change events seem to be ~the same.
}

OrientationControls.prototype.onScreenOrientationChangeEvent = function() {
  var screenOrientation = THREE.Math.degToRad(this.getScreenOrientation());
  var halfAngle = -screenOrientation / 2
  // Screen transform, so that screen up is up.
  this.transform.set( 0, Math.sin(halfAngle), 0, Math.cos(halfAngle));
  // World transform, so we use the back camera as foward.
  this.transform.multiply(new THREE.Quaternion( - Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))); // - PI/2 around the x-axis
}

OrientationControls.prototype.getScreenOrientation = function() {
  switch (window.screen.orientation || window.screen.mozOrientation) {
    case 'landscape-primary':
      return 90;
    case 'landscape-secondary':
      return -90;
    case 'portrait-secondary':
      return 180;
    case 'portrait-primary':
      return 0;
  }
  return 0;
}

OrientationControls.prototype.onDeviceOrientationChangeEvent = function(event) {
  this.alpha = event.alpha || 0;
  this.beta = event.beta || 0;
  this.gamma = event.gamma || 0;
}

OrientationControls.prototype.getQuaternion = function() {
  var alpha = THREE.Math.degToRad(this.alpha); // Z
  var beta = THREE.Math.degToRad(this.beta); // X'
  var gamma = THREE.Math.degToRad(this.gamma); // Y''

  if (!this.initialRotation) {
    // This will reset the initial angle of the device to be equal to 0.
    // This way we can alway place the content in front of the user.
    this.initialRotation = alpha || 0;
  }

  if (this.initialRotation) {
    // If there is a complement controls we can combine its rotational offset with ours.
    alpha = alpha - this.initialRotation
  }

  this.deviceEuler.set(beta, alpha, - gamma, 'YXZ');
  this.quaternion.setFromEuler(this.deviceEuler);
  this.quaternion.multiply(this.transform);

  return this.quaternion;
}

OrientationControls.prototype.update = function() {
  var quaternion = this.getQuaternion();
  // TODO we may be able to improve this?
  // Rotate like the camera is a phone in someones hand. (0.5 meters away from the pivot?)

  this.object.quaternion.copy(this.quaternion);
  return true;
}

var KeyControls = function(object, keyMap, target) {
  if (!object) {
    throw new Error('object was null');
  }
  this.object = object;
  this.move = new THREE.Vector3();
  this.keyMap = keyMap;
  this.speed = .1; // 1cm per update.
  this.target = target;
}
KeyControls.keysDown = {};

KeyControls.onKeyDown = function(event) {
  KeyControls.keysDown[event.keyCode] = true;
}

KeyControls.onKeyUp = function(event) {
  KeyControls.keysDown[event.keyCode] = false;
}

KeyControls.prototype.update = function() {
  var updateRequired = false;

  // Update a vector using a keyMap for up, down, left and right.
  updateRequired |= this.applyKeys(this.keyMap, this.move);
  if (updateRequired) {
    // Apply movement to the object using its quaternion and speed.
    this.move.applyQuaternion(this.object.quaternion);
    this.move.multiplyScalar(this.speed)
    this.object.position.add(this.move);
    this.target.add(this.move);
  }

  return updateRequired;
}

KeyControls.prototype.applyKeys = function(keyMap, move) {
  var updateRequired = false;

  move.set(0, 0, 0);
  if (KeyControls.keysDown[keyMap.UP]) {
    move.z += 1;
    updateRequired = true;
  }
  if (KeyControls.keysDown[keyMap.DOWN]) {
    move.z -= 1;
    updateRequired = true;
  }
  if (KeyControls.keysDown[keyMap.LEFT]) {
    move.x += 1;
    updateRequired = true;
  }
  if (KeyControls.keysDown[keyMap.RIGHT]) {
    move.x -= 1;
    updateRequired = true;
  }
  return updateRequired;
}

var TouchControls = function(object, domElement, target, tools) {
  if (!object) {
    throw new Error('object was null');
  }
  this.object = object;
  this.tools = tools;
  this.target = target;
  this.domElement = domElement;
  this.enabled = true;

  this.zoomTool = this.tools[1];
}

TouchControls.prototype.onTouchStart = function( event ) {
  if (!this.enabled) return;
  event.preventDefault();

  this.moved = false;
  this.renderRequired = true;

  this.tool = this.tools[event.touches.length - 1];
  if (event.touches.length ==  2) {
    // Zoom just needs a second value?
    var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
    var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
    var distance = Math.sqrt( dx * dx + dy * dy );
    this.tool.init(0, distance, this.target);
  } else {
    this.tool.init(event.touches[0].pageX, event.touches[0].pageY, this.target);
  }
}

TouchControls.prototype.onTouchMove = function( event ) {
  if (!this.enabled) return;
  event.preventDefault();
  this.moved = true;
  this.renderRequired = true;

  if (this.tool != this.tools[event.touches.length - 1]) {
    // Different number of touches, ignore.
  }
  if (event.touches.length ==  2) {
    // Zoom just needs a second value?
    var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
    var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
    var distance = Math.sqrt( dx * dx + dy * dy );
    this.tool.move(0, distance, this.target);
  } else {
    console.log('touches', event.touches.length);
    this.tool.move(event.touches[0].pageX, event.touches[0].pageY, this.domElement);
  }
}

TouchControls.prototype.onTouchEnd = function( event ) {
  if (!this.enabled) return;
  event.preventDefault();

  if (!this.moved && this.onTapped) {
    // TODO better tap callback support.
    this.onTapped.apply();
  }
  this.tool = null;
  this.renderRequired = true;
}

var MouseControls = function(object, domElement, target, tools) {
  if (!object) {
    throw new Error('object was null');
  }
  this.enabled = true;
  this.object = object;
  this.domElement = domElement;
  this.target = target;
  this.tools = tools;

  this.mouseMoveListener = this.onMouseMove.bind(this);
  this.mouseUpListener = this.onMouseUp.bind(this);

  // Zoom settings?
  this.minDistance = 0;
  this.maxDistance = Infinity;

  this.mouseButtons = {
    ORBIT: THREE.MOUSE.LEFT,
    ZOOM: THREE.MOUSE.MIDDLE,
    PAN: THREE.MOUSE.RIGHT
  };
}

MouseControls.prototype.onMouseDown = function( event ) {
  if (!this.enabled) return;
  event.preventDefault();

  if (event.button === this.mouseButtons.ORBIT) {
    if (this.noRotate) return;
    this.tool = this.tools[0];
  } else if (event.button === this.mouseButtons.ZOOM) {
    if (this.noZoom) return;
    this.tool = this.tools[1];
  } else if (event.button === this.mouseButtons.PAN) {
    if (this.noPan) return;
    this.tool = this.tools[2];
  }

  this.mousedown = true;
  this.mouse_moved = false;
  this.renderRequired = true;

  if (this.tool) {
    this.tool.init(event.clientX, event.clientY, this.target);
    document.addEventListener( 'mousemove', this.mouseMoveListener, false );
    document.addEventListener( 'mouseup', this.mouseUpListener, false );
  }
}

MouseControls.prototype.onMouseMove = function( event ) {
  if (!this.enabled) return;
  event.preventDefault();
  this.mouse_moved = true;
  this.renderRequired = true;

  if (this.tool) {
    this.tool.move(event.clientX, event.clientY, this.domElement);
  }
}

MouseControls.prototype.onMouseUp = function( event ) {
  if (!this.enabled) return;
  event.preventDefault();

  if (!this.mouse_moved && this.onTapped) {
    // TODO better tap callback support.
    this.onTapped.apply();
  }
  this.renderRequired = true;
  this.mousedown = false;
  document.removeEventListener( 'mousemove', this.mouseMoveListener, false );
  document.removeEventListener( 'mouseup', this.mouseUpListener, false );
}

MouseControls.prototype.setEnabled = function(enabled) {
  this.enabled = enabled;

  // Ignore any ongoing mouse actions.
  this.mousedown = false;
  document.removeEventListener( 'mousemove', this.mouseMoveListener, false );
  document.removeEventListener( 'mouseup', this.mouseUpListener, false );
  this.tool = null;
  this.mouse_moved = false;
}

/**
 * THREE js controls used by 8i in the web director.
 * Not as capable as 8i.controls.js but panning is relative to the camera angle.
 * This contains no google analytics.
 * No touch listeners as web director is desktop focused.
 */
EightIControls = function( object, domElement ) {
  if (!domElement) {
    this.domElement = document.body;
  } else {
    this.domElement = domElement;
  }
  this.enabled = true;
  this.target = new THREE.Vector3(0, 0, 0);

  // TODO zoom control requires a target to zoom to?
  // this.zoomTool = new ZoomControl(object, this),

  // Fake zoomTool just moves the object and its target along the objects z axis.
  // It's not really zooming, but more like fowards/backwards.
  this.zoomTool = new PanZControl(object);
}

EightIControls.prototype.addDefaultMouse = function(object) {
  this.mouseControls = new MouseControls(object, this.domElement, this.target, [
    // TODO rotate the asset?
    new RotateTool(object),
    this.zoomTool,
    new PanControl(object)
  ]);

  this.mouseControls.onTapped = function() {
    if (this.onTapped) {
      this.onTapped.apply();
    }
  }.bind(this);

  this.domElement.addEventListener( 'mousedown', function(event) {
    this.mouseControls.onMouseDown(event);
  }.bind(this), false );
  // Prevent right click menu from showing, allowing right click to be an action button.
  this.domElement.addEventListener( 'contextmenu', function ( event ) { event.preventDefault(); }, false );
}

EightIControls.prototype.addDefaultTouch = function(object) {
  // 3 part tool for Pan, Zoom and Orbit?
  this.touchControls = new TouchControls(object, this.domElement, this.target, [
    new RotateTool(object),
    this.zoomTool,
    new PanControl(object)
  ]);

  this.touchControls.onTapped = function() {
    if (this.onTapped) {
      this.onTapped.apply();
    }
  }.bind(this);

  this.domElement.addEventListener( 'touchstart', this.touchControls.onTouchStart.bind(this.touchControls), false );
  this.domElement.addEventListener( 'touchend', this.touchControls.onTouchEnd.bind(this.touchControls), false );
  this.domElement.addEventListener( 'touchmove', this.touchControls.onTouchMove.bind(this.touchControls), false );
}

EightIControls.prototype.addDefaultMouseWheel = function(object) {
  var onMouseWheel = function(event) {
    // three different properties for different browsers.
    var delta = event.deltaY || event.wheelDelta || -event.detail || 0;

    this.zoomTool.init(0, 0, this.target);
    this.zoomTool.move(0, Math.sign(delta) * 10, this.domElement);
  }.bind(this);

  if ("onwheel" in this.domElement) {
    this.domElement.addEventListener('wheel', onMouseWheel, false);
  } else {
    this.domElement.addEventListener( 'mousewheel', onMouseWheel, false);
    this.domElement.addEventListener( 'DOMMouseScroll', onMouseWheel, false);
  }
};

EightIControls.prototype.addDefaultGyro = function(object) {
  if (window.orientation !== undefined) {
    this.orientationControls = new OrientationControls(object);
    window.addEventListener('deviceorientation', function(event) {
      this.orientationControls.onDeviceOrientationChangeEvent(event);
    }.bind(this), false);
    window.addEventListener('orientationchange', function() {
      this.orientationControls.onScreenOrientationChangeEvent();
    }.bind(this), false);
  }
}

EightIControls.prototype.addDefaultKeys = function(object) {
  this.keyControls = new KeyControls(object, {
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40
  }, this.target);

  window.addEventListener('keydown', KeyControls.onKeyDown, false);
  window.addEventListener('keyup', KeyControls.onKeyUp, false);
}

EightIControls.prototype.update = function(time) {
  if (this.keyControls) {
    this.renderRequired |= this.keyControls.update();
  }
  if (this.touchControls) {
    this.renderRequired |= this.touchControls.renderRequired;
    this.touchControls.renderRequired = false;
  }
  if (this.mouseControls) {
    this.renderRequired |= this.mouseControls.renderRequired;
    this.mouseControls.renderRequired = false;
  }
  if (this.orientationControls) {
    this.renderRequired |= this.orientationControls.update();
  }

  if (this.renderRequired) {
    this.renderRequired = false;
    return true
  }
  return false;
}

EightIControls.prototype.setEnabled = function(enabled) {
  this.enabled = enabled;

  // Ignore any ongoing mouse actions.
  this.mouseControls.setEnabled(enabled);
}

// TODO this is the wrong place for this.

Recorder = function(object) {
  this.object = object;
  this.recording = false;
  this.rot1 = new THREE.Euler();
  this.quat1 = new THREE.Quaternion();
  this.quat2 = new THREE.Quaternion();
  // If the video was rotated 90 degress left.
  // this.quat2.setFromAxisAngle( new THREE.Vector3( 0, 0, 1 ), -Math.PI / 2 );
  this.pos1 = new THREE.Vector3();
}

Recorder.prototype.update = function(time) {
  if (this.playback) {
    var dat = this.data[this.playbackPosition];
    var nextdat = this.data[this.playbackPosition + 1];
    if (!this.playbackStartTime) {
      // TODO should have a recordStartTime which is is relative too.
      this.playbackStartTime = time
    }
    var playbackTime = time - this.playbackStartTime;
    while(nextdat[0] < playbackTime) {
      dat = nextdat;
      this.playbackPosition++;
      nextdat = this.data[this.playbackPosition + 1];
      if (!nextdat) {
        // Playback complete
        this.playback = false;
        this.playbackStartTime = 0;
        this.data = [];
        return true;
      }
    }
    this.recordTime = dat[0];
    if (this.recordingType == "posrot") {

      var lerpFactor = (playbackTime - this.recordTime) / (nextdat[0] - this.recordTime);

      this.object.position.fromArray(dat[1]);
      this.pos1.fromArray(nextdat[1]);
      this.object.position.lerp(this.pos1, lerpFactor);

      this.object.rotation.fromArray(dat[2]);
      // TODO make sure the quaternion is updated?
      this.rot1.fromArray(nextdat[2]);
      this.quat1.setFromEuler(this.rot1);
      this.object.quaternion.slerp(this.quat1, lerpFactor);
      this.object.quaternion.multiply(this.quat2)
    } else if (this.recordingType == 'matrix') {
      // TODO time lerp/slerp?
      this.object.matrix.fromArray(dat[1]);
    }
  } else if(this.recording) {
    if (!this.recordStartTime) {
      this.recordStartTime = time;
    }
    var dat = [
      time - this.recordStartTime
    ];
    if (this.recordingType == "posrot") {
      dat.push(this.object.position.toArray());
      dat.push(this.object.rotation.toArray());
    } else if (this.recordingType == 'matrix') {
      dat.push(this.object.matrix.toArray());
    }
    this.data.push(dat);
  }
}

Recorder.prototype.start = function() {
  this.data = [];
  this.recordingType = "posrot";
  this.recording = true;
}

Recorder.prototype.playbackFrom = function(data) {
  this.data = data.data;
  this.recordingType = data.type;
  this.playback = true;
  this.playbackPosition = 0;
}

Recorder.prototype.stop = function() {
  var ret = {
    data: this.data,
    type: this.recordingType
  }
  this.recordStartTime = 0;
  this.recording = false;
  this.recordingType = null;
  return ret;
}

Recorder.prototype.isRecording = function() {
  return this.recording;
}

Recorder.prototype.isPlaying = function() {
  return this.playback;
}
