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
  var screenOrientation = window.orientation || 0;

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
  }
  window.addEventListener('orientationchange', onScreenOrientationChangeEvent, false);


THREE.DeviceOrientationControls = function(object, target, settings) {

  settings = settings || {};
  this.alphaOnly = settings.alphaOnly;
  this.controls = settings.controls;
  this.object = object;
  this.initialRotation = 0;

  this.object.rotation.reorder('YXZ');

  this.freeze = true;

  this.movementSpeed = 1.0;
  this.rollSpeed = 0.005;
  this.autoAlign = false;//true;
  this.autoForward = false;

  this.alpha = 0;
  this.beta = 0;
  this.gamma = 0;
  this.orient = 0;

  this.target = target;

  this.alignQuaternion = new THREE.Quaternion();
  this.orientationQuaternion = new THREE.Quaternion();

  var quaternion = new THREE.Quaternion();
  var quaternionLerp = new THREE.Quaternion();

  var tempVector3 = new THREE.Vector3();
  var tempMatrix4 = new THREE.Matrix4();
  var tempEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  var tempQuaternion = new THREE.Quaternion();

  var zee = new THREE.Vector3(0, 0, 1);
  var up = new THREE.Vector3(0, 1, 0);
  var v0 = new THREE.Vector3(0, 0, 0);
  var euler = new THREE.Euler();
  var q0 = new THREE.Quaternion(); // - PI/2 around the x-axis
  var q1 = new THREE.Quaternion(- Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

  var upDownRotate = 0;
  var leftRightRotate = 0;
  var totalLogCountLR = 1;
  var totalLogCountUD = 1;
  var previousAngle;

  this.update = (function(delta) {

    return function(delta) {

      if (this.freeze) return false;

      // should not need this
      //var orientation = getOrientation();
      //if (orientation !== this.screenOrientation) {
        //this.screenOrientation = orientation;
        //this.autoAlign = true;
      //}

      this.alpha = deviceOrientation.gamma ?
        THREE.Math.degToRad(deviceOrientation.alpha) : 0; // Z
      this.beta = deviceOrientation.beta ?
        THREE.Math.degToRad(deviceOrientation.beta) : 0; // X'
      this.gamma = deviceOrientation.gamma ?
        THREE.Math.degToRad(deviceOrientation.gamma) : 0; // Y''
      this.orient = screenOrientation ?
        THREE.Math.degToRad(screenOrientation) : 0; // O

      if (this.target) {
        var vector = new THREE.Vector3(0, 0, 200);

        if (this.controls) {
          vector.multiplyScalar(this.controls.scaleRadius / 200);
        }

        var quaternion;

        var alpha = this.alpha
        if (this.controls && this.initialRotation == 0) {
          this.initialRotation = alpha;
          // This should locate the asset in front initially?
          this.controls.rotateOffsetX = this.initialRotation;

          // The alpha changes based on if the phone is tilted past vertical.
          // Use gamma to determine which way we need to rotate alpha to get the
          // scene aiming at the viewer.
          if (this.gamma > 0) {
            this.controls.rotateOffsetX += Math.PI / 2
          } else {
            this.controls.rotateOffsetX -= Math.PI / 2
          }
        }

        if (this.controls) {
          // If there is a complement controls we can combine its rotational offset with ours.
          alpha = this.alpha - this.controls.rotateOffsetX;
        }
        if (this.alphaOnly) {
          // Limit phone to portrait left-right rotate only?
          // Fixed beta to 90 degrees.
          quaternion = createQuaternion(alpha * 2, Math.PI/2, 0, 0);
        } else {
          quaternion = createQuaternion(alpha, this.beta, this.gamma, this.orient);
        }

        this.object.quaternion.copy(quaternion);

        vector.applyQuaternion(quaternion, 'ZXY');

        this.analytics();

        this.object.position.copy(vector.add(this.target));
        // TODO return false if the viewport doesn't need rendering?
        return true;

        euler.set(this.beta, this.alpha, - this.gamma, 'YXZ');
        quaternion.setFromEuler(euler);
        // Point out the camera on the back.
        quaternion.multiply(q1);
        // adjust for screen orientation
        this.orientationQuaternion.multiply(q0.setFromAxisAngle(zee, - this.orient));
        vector.applyQuaternion(quaternion);

        $('#position').html(parseInt(this.alpha * 100, 10) + ', ' + parseInt(this.beta * 100, 10) + ', ' + parseInt(this.gamma * 100, 10));

        $('#position').html(parseInt(this.target.x * 100, 10) + ', ' + parseInt(this.target.y * 100, 10) + ', ' + parseInt(this.target.z * 100, 10));

        object.position.copy(vector.add(this.target));
        object.lookAt(this.target)
      }

      return true; // Good enough.

      // The angles alpha, beta and gamma
      // form a set of intrinsic Tait-Bryan angles of type Z-X'-Y''

      // 'ZXY' for the device, but 'YXZ' for us
      euler.set(this.beta, this.alpha, - this.gamma, 'YXZ');

      quaternion.setFromEuler(euler);
      quaternionLerp.slerp(quaternion, 0.5); // interpolate

      // orient the device
      if (this.autoAlign) {
        this.orientationQuaternion.copy(quaternion); // interpolation breaks the auto alignment
      } else {
        this.orientationQuaternion.copy(quaternionLerp);
      }

      // camera looks out the back of the device, not the top
      this.orientationQuaternion.multiply(q1);

      // adjust for screen orientation
      this.orientationQuaternion.multiply(q0.setFromAxisAngle(zee, - this.orient));

      this.object.quaternion.copy(this.alignQuaternion);
      this.object.quaternion.multiply(this.orientationQuaternion);

      if (this.autoForward) {

        tempVector3
          .set(0, 0, -1)
          .applyQuaternion(this.object.quaternion, 'ZXY')
          .setLength(this.movementSpeed / 50); // TODO: why 50 :S

        this.object.position.add(tempVector3);

      }

      if (this.autoAlign && this.alpha !== 0) {

        this.autoAlign = false;

        this.align();

      }

      return true;
    };

  })();

  this.analytics = function() {
    // Double check this with some one who knows euler/quats?
    euler.set(this.beta, this.alpha, - this.gamma, 'YXZ');

    if (previousAngle) {
      euler.reorder('YXZ');
      previousAngle.reorder('YXZ');

      var deltaLR = euler.y - previousAngle.y;
      while (deltaLR >= Math.PI) deltaLR -= Math.PI * 2;
      while (deltaLR < -Math.PI) deltaLR += Math.PI * 2;
      deltaLR = Math.abs(deltaLR);
      if (deltaLR > 0.02) {
        // Ignore small movements.
        leftRightRotate += Math.abs(deltaLR);
      }
      var logCountLR = Math.floor(Math.log2(leftRightRotate));
      if (logCountLR > totalLogCountLR) {
        // Each time the log count increases fire an event to track how far has been reached.
        totalLogCountLR = logCountLR;
        ga('send', 'event', 'Asset', 'deviceRotateLR', Math.pow(2, logCountLR) + "rad");
      }

      var deltaUD = euler.z - previousAngle.z;
      while (deltaUD > Math.PI) deltaUD -= Math.PI * 2;
      while (deltaUD < -Math.PI) deltaUD += Math.PI * 2;
      deltaUD = Math.abs(deltaUD);
      if (deltaUD > 0.02) {
        // Ignore small movements.
        upDownRotate += deltaUD;
      }
      var logCountUD = Math.floor(Math.log2(upDownRotate));
      if (logCountUD > totalLogCountUD) {
        // Each time the log count increases fire an event to track how far has been reached.
        totalLogCountUD = logCountUD;
        ga('send', 'event', 'Asset', 'deviceRotateUD', Math.pow(2, logCountUD) + "rad");
      }

      // rotates about 10 radians for each during a small test.
    } else {
      previousAngle = new THREE.Euler(0, 0, 0, 'YXZ');
    }
    previousAngle.copy(euler);
  }

  var createQuaternion = function () {

    var finalQuaternion = new THREE.Quaternion();

    var deviceEuler = new THREE.Euler();

    var screenTransform = new THREE.Quaternion();

    var worldTransform = new THREE.Quaternion( - Math.sqrt(0.5), 0, 0, Math.sqrt(0.5) ); // - PI/2 around the x-axis

    var minusHalfAngle = 0;

    return function ( alpha, beta, gamma, screenOrientation ) {

      deviceEuler.set( beta, alpha, - gamma, 'YXZ' );

      finalQuaternion.setFromEuler( deviceEuler );

      minusHalfAngle = - screenOrientation / 2;

      screenTransform.set( 0, Math.sin( minusHalfAngle ), 0, Math.cos( minusHalfAngle ) );

      finalQuaternion.multiply( screenTransform );

      finalQuaternion.multiply( worldTransform );

      return finalQuaternion;

    }

  }();
  // //debug
  // window.addEventListener('click', (function(){
  //   this.align();
  // }).bind(this));

  this.align = function() {

    tempVector3
      .set(0, 0, -1)
      .applyQuaternion( tempQuaternion.copy(this.orientationQuaternion).inverse(), 'ZXY' );

    tempEuler.setFromQuaternion(
      tempQuaternion.setFromRotationMatrix(
        tempMatrix4.lookAt(tempVector3, v0, up)
     )
   );

    tempEuler.set(0, tempEuler.y, 0);
    this.alignQuaternion.setFromEuler(tempEuler);

  };

  this.connect = function() {
    this.freeze = false;
  };

  this.disconnect = function() {
    this.freeze = true;
  };

};

})();

