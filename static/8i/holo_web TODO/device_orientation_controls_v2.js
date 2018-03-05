/* globals THREE */
/**
 * DeviceOrientationControls - applies device orientation on object rotation
 *
 * @param {Object} object - instance of THREE.Object3D
 * @constructor
 *
 * @author richt / http://richt.me
 * @author WestLangley / http://github.com/WestLangley
 * @author jonobr1 / http://jonobr1.com
 * @author arodic / http://aleksandarrodic.com
 * @author doug / http://github.com/doug
 *
 * W3C Device Orientation control
 * (http://w3c.github.io/deviceorientation/spec-source-orientation.html)
 */

(function() {
  var deviceOrientation = {};
  var screenTransform = new THREE.Quaternion();
  var worldTransform = new THREE.Quaternion( - Math.sqrt(0.5), 0, 0, Math.sqrt(0.5) ); // - PI/2 around the x-axis

  function onDeviceOrientationChangeEvent(evt) {
    deviceOrientation = evt;
  }
  if (window.orientation !== undefined) {
    window.addEventListener('deviceorientation', onDeviceOrientationChangeEvent, false);
  }

  function getOrientation() {
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
    // this returns 90 if width is greater then height
    // and window orientation is undefined OR 0
    // This hack doesn't work on android as innerWidth and innerHeight may still be the wrong way around when this is called.
    // if (!window.orientation && window.innerWidth > window.innerHeight)
    //   return 90;
    return window.orientation || 0;
  }

  function onScreenOrientationChangeEvent() {
    screenOrientation = getOrientation();
    screenOrientation = THREE.Math.degToRad(screenOrientation);
    minusHalfAngle = - screenOrientation / 2;
    screenTransform.set( 0, Math.sin( minusHalfAngle ), 0, Math.cos( minusHalfAngle ) );
    screenTransform.multiply(worldTransform);
  }
  window.addEventListener('orientationchange', onScreenOrientationChangeEvent, false);

  onScreenOrientationChangeEvent();

DeviceOrientationControls = function(object, target, options) {
  // this.alphaOnly = settings.alphaOnly;
  // this.controls = settings.controls;
  this.object = object;
  this.initialRotation = 0;

  this.object.rotation.reorder('YXZ');

  this.freeze = true;

  this.movementSpeed = 1.0;
  this.rollSpeed = 0.005;
  this.autoAlign = false;//true;
  this.autoForward = false;

  this.target = target;
  if (!options) {
    options = {}
  }
  this.controls = options['controls'];

  this.alignQuaternion = new THREE.Quaternion();
  this.tempQ = new THREE.Quaternion();
  this.orientationQuaternion = new THREE.Quaternion();

  // Device helpers.
  this.quaternion = new THREE.Quaternion();
  this.deviceEuler = new THREE.Euler();
  this.minusHalfAngle = 0;
}

DeviceOrientationControls.prototype.update = function(delta) {
  if (this.freeze) return false;

  alpha = deviceOrientation.alpha ?
    THREE.Math.degToRad(deviceOrientation.alpha) : 0; // Z
  beta = deviceOrientation.beta ?
    THREE.Math.degToRad(deviceOrientation.beta) : 0; // X'
  gamma = deviceOrientation.gamma ?
    THREE.Math.degToRad(deviceOrientation.gamma) : 0; // Y''

  if (this.initialRotation == 0) {
    this.initialRotation = alpha;

    // The alpha changes based on if the phone is tilted past vertical.
    // Use gamma to determine which way we need to rotate alpha to get the
    // scene aiming at the viewer.
    if (gamma > 0) {
      this.initialRotation += Math.PI / 2
    } else {
      this.initialRotation -= Math.PI / 2
    }
  }

  // If there is a complement controls we can combine its rotational offset with ours.
  // TODO this should probably apply to the quaternion as a post effect.
  alpha = alpha - this.initialRotation;

  this.deviceEuler.set(beta, alpha, - gamma, 'YXZ');
  this.quaternion.setFromEuler(this.deviceEuler);

  this.quaternion.multiply(screenTransform);

  // Application of the device quaternion
  // TODO this should be callback based?
  this.object.quaternion.copy(this.quaternion);

  if (this.target) {
    // Does an orbit style thing around the target.
    var vector = new THREE.Vector3(0, 0, 1);

    var offset = this.object.position.clone().sub( this.target );
    var scaleRadius = offset.length();
    if (this.controls && this.controls.scaleRadius) {
      // TODO double check this logic?
      scaleRadius = this.controls.scaleRadius;
    }
    vector.multiplyScalar(scaleRadius);

    vector.applyQuaternion(this.quaternion, 'ZXY');

    this.object.position.copy(vector.add(this.target));
  }
  // TODO return false if the viewport doesn't need rendering?
  return true;
};

DeviceOrientationControls.prototype.connect = function() {
  this.freeze = false;
};

DeviceOrientationControls.prototype.disconnect = function() {
  this.freeze = true;
};

})();

