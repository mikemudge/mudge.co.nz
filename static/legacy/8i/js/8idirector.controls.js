var OrbitControl = function(object) {
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

// Rotate amount in radians, 6.28 is a full rotation.
OrbitControl.prototype.rotateX = function(amount) {
  this.thetaDelta = amount;
  this.update();
}

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

var PanControl = function(object) {
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

var ZoomControl = function(object, controls) {
  this.panStart = new THREE.Vector2();
  this.panEnd = new THREE.Vector2();
  this.panDelta = new THREE.Vector2();
  this.offset = new THREE.Vector3();
  this.object = object;
  this.controls = controls
}

ZoomControl.prototype.init = function(x, y, target) {
  this.target = target;
  this.panStart.set(x, y);
  this.panEnd.set(x, y);
}

ZoomControl.prototype.move = function(x, y, element) {
  this.panEnd.set(x, y);
  this.panDelta.subVectors(this.panEnd, this.panStart);

  // Ignore speed of scale and just scale in/out by 5%.
  var scale = Math.pow( 0.95, Math.sign(-this.panDelta.y));
  this.offset.copy( this.object.position ).sub( this.target );

  var radius = this.offset.length() * scale;
  // Only scale if we can do so within the max and min radius.
  if (scale > 1) {
    if (radius < this.controls.maxDistance) {
      this.offset.multiplyScalar(scale);
    }
  } else {
    if (radius > this.controls.minDistance) {
      this.offset.multiplyScalar(scale);
    }
  }

  this.object.position.copy( this.target ).add( this.offset );

  this.panStart.copy( this.panEnd );
}

/**
 * THREE js controls used by 8i in the web director.
 * Not as capable as 8i.controls.js but panning is relative to the camera angle.
 * This contains no google analytics.
 * No touch listeners as web director is desktop focused.
 */
EightIDirectorControls = function( object, domElement ) {
  this.domElement = domElement;
  this.enabled = true;
  this.object = object;
  this.target = new THREE.Vector3();
  this.mouseMoveListener = this.onMouseMove.bind(this);
  this.mouseUpListener = this.onMouseUp.bind(this);
  this.touchMoveListener = this.onTouchMove.bind(this);
  this.touchEndListener = this.onTouchEnd.bind(this);
  this.minDistance = 0;
  this.maxDistance = Infinity;

  this.mouseButtons = {
    ORBIT: THREE.MOUSE.LEFT,
    ZOOM: THREE.MOUSE.MIDDLE,
    PAN: THREE.MOUSE.RIGHT
  };

  // The four arrow keys
  this.keys = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40 };

  // Tools for different kinds of controls.
  this.tools = [
    this.rotateTool = new OrbitControl(object),
    this.zoomTool = new ZoomControl(object, this),
    this.panTool = new PanControl(object)
  ];
  this.rotateTool.target = this.target;
  this.zoomTool.target = this.target;
  // Default to the first?
  // onMouseDown may change the tool in use.
  this.tool = this.tools[0];

  this.domElement.addEventListener( 'mousedown', this.onMouseDown.bind(this), false );
  // Prevent right click menu from showing, allowing right click to be an action button.
  this.domElement.addEventListener( 'contextmenu', function ( event ) { event.preventDefault(); }, false );

  if ("onwheel" in this.domElement) {
    this.domElement.addEventListener('wheel', this.onMouseWheel.bind(this), false );
  } else {
    this.domElement.addEventListener( 'mousewheel', this.onMouseWheel.bind(this), false );
    this.domElement.addEventListener( 'DOMMouseScroll', this.onMouseWheel.bind(this), false ); // firefox
  }
}

// Set the default controls to this.
EightIControls = EightIDirectorControls;

EightIDirectorControls.prototype.update = function(time) {
  this.object.lookAt(this.target);

  if (this.renderRequired) {
    this.renderRequired = false;
    return true;
  }
  return false;
}

EightIDirectorControls.prototype.setEnabled = function(enabled) {
  this.enabled = enabled;

  // Ignore any ongoing mouse actions.
  this.mousedown = false;
  document.removeEventListener( 'mousemove', this.mouseMoveListener, false );
  document.removeEventListener( 'mouseup', this.mouseUpListener, false );
  this.tool = null;
  this.mouse_moved = false;
}

EightIDirectorControls.prototype.onMouseWheel = function( event ) {
  // Stop scrolling when you are zooming.
  event.preventDefault();

  this.domElement.focus();

  // three different properties for different browsers.
  var delta = event.deltaY || event.wheelDelta || -event.detail || 0;

  this.renderRequired = true;
  this.zoomTool.init(0, 0, this.target);
  this.zoomTool.move(0, delta);

  return true;
}

EightIDirectorControls.prototype.onMouseDown = function( event ) {
  if (!this.enabled) return;
  event.preventDefault();

  this.domElement.focus();

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

  if (this.tool) {
    this.tool.init(event.clientX, event.clientY, this.target);
    document.addEventListener( 'mousemove', this.mouseMoveListener, false );
    document.addEventListener( 'mouseup', this.mouseUpListener, false );
  }
}

EightIDirectorControls.prototype.onMouseMove = function( event ) {
  if (!this.enabled) return;
  event.preventDefault();
  this.mouse_moved = true;
  this.renderRequired = true;

  if (this.tool) {
    this.tool.move(event.clientX, event.clientY, this.domElement);
  }
}

EightIDirectorControls.prototype.onMouseUp = function( event ) {
  if (!this.enabled) return;
  event.preventDefault();

  if (!this.mouse_moved && this.onTapped) {
    // TODO better tap callback support.
    this.onTapped.apply();
  }
  this.mousedown = false;
  document.removeEventListener( 'mousemove', this.mouseMoveListener, false );
  document.removeEventListener( 'mouseup', this.mouseUpListener, false );
}

EightIDirectorControls.prototype.enableTouch = function() {
  this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this), false);
}

EightIDirectorControls.prototype.onTouchStart = function(event) {
  if (!this.enabled) return;
  event.preventDefault();

  this.domElement.focus();

  // Check if the touch is on an object?

  if (event.touches.length == 1) {
    this.tool = this.panTool;
  } else if (event.touches.length == 2) {
    this.tool = this.zoomTool;
  } else {
    // 3 Fingers+ are not supported.
    // They can actually be consumed by mobile operating systems.
    return;
  }
  // Otherwise it should orbit the camera as a mouse would?
  this.tool.init(event.touches[0].clientX, event.touches[0].clientY, this.target);
  this.touch_moved = false;
  this.touchdown = true;

  this.domElement.addEventListener('touchmove', this.touchMoveListener, false );
  this.domElement.addEventListener('touchend', this.touchEndListener, false );
}

EightIDirectorControls.prototype.onTouchMove = function(event) {
  event.preventDefault();
  this.touch_moved = true;
  this.renderRequired = true;

  if (this.tool) {
    // Not sure how this could be null, maybe sometimes a touch move happens after a touch end?
    this.tool.move(event.touches[0].clientX, event.touches[0].clientY, this.domElement);
  }
}

EightIDirectorControls.prototype.onTouchEnd = function(event) {
  event.preventDefault();
  this.touchdown = false;
  this.renderRequired = true;

  if (!this.touch_moved) {
    // Perform a tap action.
    this.onTapped();
  } else if (event.touches.length == 1) {
    // A touchEnd event doesn't always have a touch.
    this.tool.move(event.touches[0].clientX, event.touches[0].clientY, this.domElement);
  }
  this.tool = null;

  document.removeEventListener('touchmove', this.touchMoveListener, false);
  document.removeEventListener('touchend', this.touchEndListener, false);
}
