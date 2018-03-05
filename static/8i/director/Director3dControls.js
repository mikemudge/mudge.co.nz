var OBJ_AXIS = 
	{
		X : 'X',
		Y : 'Y',
		Z : 'Z',
		CAMERA : 'C'
	};

/* Multiple controls for scene object transformation.
   Allows scene objects to be positioned rotated and scaled with the mouse. */
var Director3dControl = function (camera, controls, director) {
	this.camera = camera;
	this.director = director;
	this.cameraVector = camera.getWorldDirection();
	this.controls = controls;

	this.selectedObj = null;

	this.mouseNDC = new THREE.Vector2();

	this.mouseMoved = false;
	this.mouseDown = false;
	this.updateRequired = false;

	this.raycaster = new THREE.Raycaster();

	this.helper = new OBJHelper(director.frontScene);
	this.helper.SetAdvanced(true);
	this.helper.SetVisible(false);

	this.lastCameraPosition = new THREE.Vector3();

	this.enabled = true;
};

Director3dControl.prototype.reset = function() {
	this.helper.SetVisible(false);
	this.mouseMoved = false;
	this.mouseDown = false;
	this.tool = null;
	// Renable camera move controls
	this.controls.setEnabled(true);

	if (this.selectedObj) {
		this.selectedObj.Deselect();
	}
}

Director3dControl.prototype.destroy = function() {
	if (this.selectedObj) {
		this.selectedObj.Deselect();
	}
	this.director.frontScene.remove(this.helper.threeObject);
}

Director3dControl.prototype.onMouseDown = function(event) {
	if (this.enabled) {
		this.mouseDown = true;
		this.mouseMoved = false;

		if (this.selectedObj && this.currentHandleAdv) {
			// Disable camera controls while transforming an asset.
			this.controls.setEnabled(false);

			// pick your tool based on the helper handle clicked on.
			var selectedTool = this.currentHandleAdv.tool;
			if (selectedTool === OBJ_ADV_TOOL.TRANSLATE) {
				// TODO this isn't quite the right tool.
				this.tool = new LinearTranslateControl(this.camera, this.currentHandleAdv.axis);
			} else if (selectedTool === OBJ_ADV_TOOL.ROTATE) {
				this.tool = new RotateControl(this.camera, this.currentHandleAdv.axis);
			} else if (selectedTool === OBJ_ADV_TOOL.SCALE) {
				this.tool = new ScaleControl(this.camera);
			}
			if (this.tool) {
				this.tool.setTarget(this.selectedObj);
				this.tool.onMouseDown(event);
			}
			this.currentHandleAdv.threeObject.quaternion.set(0, 0, 0, 1);
			this.updateRequired = true;
		}
	}
};

Director3dControl.prototype.onMouseMove = function(event) {
	if (this.enabled) {
		var mX = event.offsetX;
		var mY = event.offsetY;

		this.mouseNDC.x = ( mX / event.currentTarget.clientWidth ) * 2 - 1;
		this.mouseNDC.y = - ( mY / event.currentTarget.clientHeight ) * 2 + 1;
		this.raycaster.setFromCamera( this.mouseNDC, this.camera );
		this.updateRequired = true;
		this.mouseMoved = true;

		// Select an advanced handle while hovering on it.
		if (!this.mouseDown) {
			if (this.helper.threeObject.visible) {
				var currentHandle = this.helper.RaycastHandleAdv(null, this.raycaster);
				if (currentHandle != this.currentHandleAdv) {
					if (this.currentHandleAdv) {
						this.currentHandleAdv.Deselect();
					}
					this.currentHandleAdv = currentHandle;
					if (this.currentHandleAdv) {
						this.currentHandleAdv.Select();
					}
				}
			}
		}

		if (this.mouseDown && this.tool && this.selectedObj) {
			this.tool.onMouseMove(event, this.currentHandleAdv);
			this.helper.threeObject.position.copy(this.selectedObj.wrapper.position);
			return;
		}
	}
};

Director3dControl.prototype.moveFinishedCB = function() {}
Director3dControl.prototype.selectObjectCB = function() {}

Director3dControl.prototype.onMouseLeave = function(event) {
	if (!this.enabled) {
		return;
	}
	if (!this.mouseDown) {
		return;
	}
	if (this.currentHandleAdv) {
		this.currentHandleAdv.threeObject.quaternion.set(0, 0, 0, 1);
	}
	this.mouseDown = false;
	this.tool = null;
	// Renable camera move controls
	this.controls.setEnabled(true);
	if (this.mouseMoved) {
		this.moveFinishedCB.apply(this, []);
	}
}

Director3dControl.prototype.onMouseUp = function(event) {
	if (this.enabled) {
		this.mouseDown = false;
		// Renable camera move controls
		this.controls.setEnabled(true);
		if (this.tool && this.mouseMoved) {
			if (this.currentHandleAdv) {
				this.currentHandleAdv.threeObject.quaternion.set(0, 0, 0, 1);
			}

			this.tool = null;
			// Call the move finished callback so we can auto save.
			// TODO better way than this?
			this.moveFinishedCB.apply(this, []);
			// This was a drag and it moved something so we shouldn't select anything now.
			return;
		}
		this.tool = null;

		if (this.selectedObj && !this.mouseMoved) {
			this.selectObject(null);
		}

		this.raycaster.setFromCamera( this.mouseNDC, this.camera );

		// TODO prebuild this list rather than building it each call?
		var raycastObjects = [];
		for (i = 0; i < this.director.objects.length; i++) {
			object = this.director.objects[i];
			if (object.isAliveAtFrame(this.director.currentFrame)) {
				var raycastObject = object.GetRaycastObject();
				if (raycastObject) {
					raycastObjects.push( raycastObject );
				}
			}
		}

		var closestObj = null;
		var intersects = this.raycaster.intersectObjects( raycastObjects , true );
		if (intersects.length > 0) {
			// TODO actually use the parentObj's position to determine closeness?
			// Currently all bounding boxes are always closer than non bounding boxes.
			closestObj = intersects[0].object.parentObj;
		}

		if (closestObj) {
			this.selectObject(closestObj);
		}
	}
};

Director3dControl.prototype.selectObject = function(object) {
	if (this.selectedObj == object) {
		// already selected.
		return;
	}
	if (this.selectedObj) {
		this.selectedObj.Deselect();
		this.helper.SetVisible(false);
		this.selectedObj = null;
	}
	this.updateRequired = true;
  if (object && object.background) {
    // Don't allow selecting?
    return;
  }
  if (object && object.type == 'audio') {
  	// Don't allow selecting?
  	// TODO there should be a nicer way to set this.
  	return;
  }
	this.selectedObj = object;

	if (this.selectedObj) {
		this.selectObjectCB(this.selectedObj);
		this.selectedObj.Select();
		this.helper.SetVisible(true);
		// Update helper to be positioned on the object.
		this.helper.threeObject.position.copy(this.selectedObj.wrapper.position);
	}
}

Director3dControl.prototype.update = function(time) {

	if (!this.enabled) {
		return false;
	}

	if (this.selectedObj) {
		// TODO hide if the object is before startTime or after endTime?
		if (time < this.selectedObj.startTime || time > this.selectedObj.endTime) {
			this.selectObject(null);
		} else {
			this.helper.threeObject.position.copy(this.selectedObj.wrapper.position);
		}
	}


	if (this.updateRequired || !this.camera.position.equals(this.lastCameraPosition)) {

		this.helper.UpdateScale(this.camera); // return true if changed

		this.lastCameraPosition.copy(this.camera.position);
	}
	else if (!this.updateRequired) {

		return false;
	}


	this.updateRequired = false;
	return true;
};


var KeyControls = function(keyMap, callback) {
  this.keyMap = keyMap;
  this.callback = callback;
}
KeyControls.keysDown = {};

KeyControls.onKeyDown = function(event) {
  KeyControls.keysDown[event.keyCode] = true;
}
window.addEventListener('keydown', KeyControls.onKeyDown, false);

KeyControls.onKeyUp = function(event) {
  KeyControls.keysDown[event.keyCode] = false;
}
window.addEventListener('keyup', KeyControls.onKeyUp, false);

KeyControls.prototype.update = function() {
	return this.applyKeys();
}

KeyControls.prototype.applyKeys = function() {
	var keys = {};
	for (key in this.keyMap) {
		keys[key] = KeyControls.keysDown[this.keyMap[key]];
	}
  return this.callback.apply(null, [keys]);
}

// Translates a target position attached to a single axis(line).
var LinearTranslateControl = function(camera, axis) {
	this.camera = camera;
	this.selectedAxis = axis || OBJ_AXIS.Y;

	this.mouseDownNDC = new THREE.Vector3(0, 0, 0.5);
	this.mouseCurrNDC = new THREE.Vector3(0, 0, 0.5);
	this.mousePrev = new THREE.Vector2();
	this.mouseDelta = new THREE.Vector2();

	this.objScreenMouseDownNDC = new THREE.Vector3(0, 0, 0);
	this.objScreenCoord = new THREE.Vector2();
	this.objScreenVecX = new THREE.Vector2();
	this.objScreenVecY = new THREE.Vector2();
	this.objScreenVecZ = new THREE.Vector2();
}

LinearTranslateControl.prototype.setTarget = function(target) {
	this.target = target;
}

LinearTranslateControl.prototype.onMouseDown = function(event) {
	var mX = event.offsetX;
	var mY = event.offsetY;

	this.mouseDownNDC.x = ( mX / event.currentTarget.clientWidth ) * 2 - 1;
	this.mouseDownNDC.y = - ( mY / event.currentTarget.clientHeight ) * 2 + 1;

	this.objScreenMouseDownNDC.setFromMatrixPosition( this.target.wrapper.matrixWorld );
	this.objScreenMouseDownNDC.project(this.camera);

	this.mousePrev.set( mX , mY );
}

LinearTranslateControl.prototype.onMouseMove = function(event) {
	var mX = event.offsetX;
	var mY = event.offsetY;

	this.mouseCurrNDC.x = ( mX / event.currentTarget.clientWidth ) * 2 - 1;
	this.mouseCurrNDC.y = - ( mY / event.currentTarget.clientHeight ) * 2 + 1;

	this.mouseDelta.set( mX - this.mousePrev.x , mY - this.mousePrev.y );
	this.mousePrev.set( mX , mY );

	this.update();
}

//selected object's X, Y, and Z direction vectors from its origin, all in screen space
LinearTranslateControl.prototype.ComputeObjectScreenAxisProjections = function() {

	if (this.target) {
		var width = canvas.clientWidth, height = canvas.clientHeight;
		var widthHalf = width / 2, heightHalf = height / 2;

		var objPos = new THREE.Vector3();
		objPos.setFromMatrixPosition( this.target.wrapper.matrixWorld );

		var objX = objPos.clone();
		var objY = objPos.clone();
		var objZ = objPos.clone();

		objX.x += 1;
		objY.y += 1;
		objZ.z += 1;

		var objPosScreen = objPos.clone();
		objPosScreen.project(this.camera);

		var objXScreen = objX.clone();
		objXScreen.project(this.camera);

		var objYScreen = objY.clone();
		objYScreen.project(this.camera);

		var objZScreen = objZ.clone();
		objZScreen.project(this.camera);

		objXScreen.sub(objPosScreen);
		objYScreen.sub(objPosScreen);
		objZScreen.sub(objPosScreen);

		objXScreen.normalize();
		objYScreen.normalize();
		objZScreen.normalize();

		this.objScreenCoord.x = ( objPosScreen.x * widthHalf ) + widthHalf;
		this.objScreenCoord.y = - ( objPosScreen.y * heightHalf ) + heightHalf;

		this.objScreenVecX.x = objXScreen.x;
		this.objScreenVecX.y = - objXScreen.y;

		this.objScreenVecY.x = objYScreen.x;
		this.objScreenVecY.y = - objYScreen.y;

		this.objScreenVecZ.x = objZScreen.x;
		this.objScreenVecZ.y = - objZScreen.y;
	}
};

LinearTranslateControl.prototype.update = function() {
	// this.ComputeObjectScreenAxisProjections();

	// https://www.cs.princeton.edu/courses/archive/fall00/cs426/lectures/raycast/sld017.htm

	var dir = this.mouseCurrNDC.clone();
	dir.sub(this.mouseDownNDC);
	dir.add(this.objScreenMouseDownNDC);
	dir.unproject(this.camera);
	dir.sub(this.camera.position);
	dir.normalize();


	var p0 = this.camera.position.clone();

	var m = this.target.wrapper.position.clone();

	var N = p0.clone();
	N.sub(m);
	N.normalize();
	if (this.selectedAxis === OBJ_AXIS.X) {
		N.x = 0;
	}
	else if (this.selectedAxis === OBJ_AXIS.Y) {
		N.y = 0;
	}
	else if (this.selectedAxis === OBJ_AXIS.Z) {
		N.z = 0;
	}

	// d is the same as - m.dot(N)
	var d = - ( N.x*m.x + N.y*m.y + N.z*m.z );
	var t = -(p0.dot(N) + d)/(dir.dot(N));

	var p = dir.clone();
	p.multiplyScalar(t);
	p.add(p0);

	if (this.selectedAxis === OBJ_AXIS.X) {
		this.target.SetTranslationX(p.x);
	}
	else if (this.selectedAxis === OBJ_AXIS.Y) {

		this.target.SetTranslationY(p.y);
	}
	else if (this.selectedAxis === OBJ_AXIS.Z) {

		this.target.SetTranslationZ(p.z);
	}
}

// Translates a target position attached to a plane.
var TranslateControl = function(camera, axis) {
	this.camera = camera;
	this.selectedAxis = axis || OBJ_AXIS.Y;

	this.mouseDownNDC = new THREE.Vector3(0, 0, 0.5);
	this.mouseCurrNDC = new THREE.Vector3(0, 0, 0.5);
	this.mousePrev = new THREE.Vector2();
	this.mouseDelta = new THREE.Vector2();

	this.objScreenMouseDownNDC = new THREE.Vector3(0, 0, 0);
	this.objScreenCoord = new THREE.Vector2();
	this.objScreenVecX = new THREE.Vector2();
	this.objScreenVecY = new THREE.Vector2();
	this.objScreenVecZ = new THREE.Vector2();
}

TranslateControl.prototype.setTarget = function(target) {
	this.target = target;
}

TranslateControl.prototype.onMouseDown = function(event) {
	var mX = event.offsetX;
	var mY = event.offsetY;

	this.mouseDownNDC.x = ( mX / event.currentTarget.clientWidth ) * 2 - 1;
	this.mouseDownNDC.y = - ( mY / event.currentTarget.clientHeight ) * 2 + 1;

	this.objScreenMouseDownNDC.setFromMatrixPosition( this.target.wrapper.matrixWorld );
	this.objScreenMouseDownNDC.project(this.camera);

	this.mousePrev.set( mX , mY );
}

TranslateControl.prototype.onMouseMove = function(event) {
	var mX = event.offsetX;
	var mY = event.offsetY;

	this.mouseCurrNDC.x = ( mX / event.currentTarget.clientWidth ) * 2 - 1;
	this.mouseCurrNDC.y = - ( mY / event.currentTarget.clientHeight ) * 2 + 1;
	this.mouseDelta.set( mX - this.mousePrev.x , mY - this.mousePrev.y );
	this.mousePrev.set( mX , mY );

	this.update();
}

//selected object's X, Y, and Z direction vectors from its origin, all in screen space
TranslateControl.prototype.ComputeObjectScreenAxisProjections = function() {

	if (this.target) {
		var width = canvas.clientWidth, height = canvas.clientHeight;
		var widthHalf = width / 2, heightHalf = height / 2;

		var objPos = new THREE.Vector3();
		objPos.setFromMatrixPosition( this.target.wrapper.matrixWorld );

		var objX = objPos.clone();
		var objY = objPos.clone();
		var objZ = objPos.clone();

		objX.x += 1;
		objY.y += 1;
		objZ.z += 1;

		var objPosScreen = objPos.clone();
		objPosScreen.project(this.camera);

		var objXScreen = objX.clone();
		objXScreen.project(this.camera);

		var objYScreen = objY.clone();
		objYScreen.project(this.camera);

		var objZScreen = objZ.clone();
		objZScreen.project(this.camera);

		objXScreen.sub(objPosScreen);
		objYScreen.sub(objPosScreen);
		objZScreen.sub(objPosScreen);

		objXScreen.normalize();
		objYScreen.normalize();
		objZScreen.normalize();

		this.objScreenCoord.x = ( objPosScreen.x * widthHalf ) + widthHalf;
		this.objScreenCoord.y = - ( objPosScreen.y * heightHalf ) + heightHalf;

		this.objScreenVecX.x = objXScreen.x;
		this.objScreenVecX.y = - objXScreen.y;

		this.objScreenVecY.x = objYScreen.x;
		this.objScreenVecY.y = - objYScreen.y;

		this.objScreenVecZ.x = objZScreen.x;
		this.objScreenVecZ.y = - objZScreen.y;
	}
};

TranslateControl.prototype.update = function() {
	// compute direction of axes as seen in screenspace
	// this.ComputeObjectScreenAxisProjections();

	// https://www.cs.princeton.edu/courses/archive/fall00/cs426/lectures/raycast/sld017.htm

	var dir = this.mouseCurrNDC.clone();
	dir.sub(this.mouseDownNDC);
	dir.add(this.objScreenMouseDownNDC);
	dir.unproject(this.camera);
	dir.sub(this.camera.position);
	dir.normalize();

	var p0 = this.camera.position.clone();
	var m = this.target.wrapper.position.clone();

	var N = new THREE.Vector3();
	if (this.selectedAxis === OBJ_AXIS.X) {
		N.set(1,0,0);
	}
	else if (this.selectedAxis === OBJ_AXIS.Y) {
		N.set(0,1,0);
	}
	else if (this.selectedAxis === OBJ_AXIS.Z) {
		N.set(0,0,1);
	}
	else if (this.selectedAxis === OBJ_AXIS.CAMERA) {
		N.copy(p0);
		N.sub(m);
		// N.y = 0;
		N.normalize();
	}

	var d = - ( N.x*m.x + N.y*m.y + N.z*m.z );

	var t = -(p0.dot(N) + d)/(dir.dot(N));

	var p = dir.clone();
	p.multiplyScalar(t);
	p.add(p0);

	this.target.SetTranslation( p.x , p.y , p.z );
}

var ScaleControl = function(camera) {
	this.camera = camera;

	this.objScreenCoord = new THREE.Vector2();

	this.mouseDistPrev = 0;
	this.mouseDistDelta = 0;
}

ScaleControl.prototype.setTarget = function(target) {
	this.target = target;
}

ScaleControl.prototype.onMouseDown = function(event) {
	var mX = event.offsetX;
	var mY = event.offsetY;

	if (this.target) {

		var width = canvas.clientWidth, height = canvas.clientHeight;
		var widthHalf = width / 2, heightHalf = height / 2;

		var vector = new THREE.Vector3();
		vector.setFromMatrixPosition( this.target.wrapper.matrixWorld );
		vector.project(this.camera);

		this.objScreenCoord.x = ( vector.x * widthHalf ) + widthHalf;
		this.objScreenCoord.y = - ( vector.y * heightHalf ) + heightHalf;

		var distY = mY - this.objScreenCoord.y;
		this.mouseDistPrev = -distY; // Math.sqrt(distX*distX + distY*distY);
	}
}

ScaleControl.prototype.onMouseMove = function(event) {
	var mX = event.offsetX;
	var mY = event.offsetY;

	// var distX = mX - this.objScreenCoord.x;
	var distY = mY - this.objScreenCoord.y;

	var dist = -distY; // Math.sqrt(distX*distX + distY*distY);

	this.mouseDistDelta = dist - this.mouseDistPrev;
	this.mouseDistPrev = dist;

	this.update();
}

ScaleControl.prototype.update = function() {
	this.target.Scale(Math.atan(0.1 * this.mouseDistDelta)/3 + 1);
}

var RotateControl = function(camera, axis) {
	this.camera = camera;
	this.cameraVector = camera.getWorldDirection();
	this.selectedAxis = axis || OBJ_AXIS.Y;
	this.direction = 1;
	this.selectedSignedAxisVector = new THREE.Vector3();
	this.q = new THREE.Quaternion();

	this.mouseDownNDC = new THREE.Vector3(0, 0, 0.5);
	this.mouseCurrNDC = new THREE.Vector3(0, 0, 0.5);
	this.objScreenCoord = new THREE.Vector2();
	this.objScreenMouseDownNDC = new THREE.Vector3(0, 0, 0);

	// this.mouse3DDelta = new THREE.Vector3(0, 0, 0);
	this.mouse3DPrev = new THREE.Vector3(0, 0, 0);
	this.angleDelta = 0;

	this.mouseAnglePrev = 0;
	this.mouseAngleDelta = 0;
	this.mouseAngle = 0;
}

RotateControl.prototype.GetMouse3DOnPlane = function() {

	var dir = this.mouseCurrNDC.clone();
	// dir.sub(this.mouseDownNDC);
	// dir.add(this.objScreenMouseDownNDC);
	dir.unproject(this.camera);
	dir.sub(this.camera.position);
	dir.normalize();

	var p0 = this.camera.position.clone();
	var m = this.target.wrapper.position.clone();

	var N = new THREE.Vector3();
	if (this.selectedAxis === OBJ_AXIS.CAMERA) {
		N.copy(p0);
		N.sub(m);
		// N.y = 0;
		N.normalize();
	}
	else {
		N.copy(this.selectedSignedAxisVector);
	}

	var d = - ( N.x * m.x + N.y * m.y + N.z * m.z );

	var t = -(p0.dot(N) + d)/(dir.dot(N));

	var p = dir.clone();
	p.multiplyScalar(t);
	p.add(p0);

	return p;
};

RotateControl.prototype.setTarget = function(target) {
	this.target = target;
}

RotateControl.prototype.onMouseDown = function(event) {

	var mX = event.offsetX;
	var mY = event.offsetY;

	// Assumes the camera will not move during this mouse interaction.
	this.cameraVector.copy(this.camera.getWorldDirection());
	// Get the vector from the camera towards the object, not just the camera direction.
	this.cameraVector.copy(this.target.wrapper.position);
	this.cameraVector.sub(this.camera.position);

	if (this.selectedAxis == OBJ_AXIS.X) {

		this.direction = Math.sign(this.cameraVector.x) || 1;
		this.selectedSignedAxisVector.set(1, 0, 0);

		}
		else if (this.selectedAxis == OBJ_AXIS.Y) {

			this.direction = Math.sign(this.cameraVector.y) || 1;
			this.selectedSignedAxisVector.set(0, 1, 0);

		}
		else if (this.selectedAxis == OBJ_AXIS.Z) {

			this.direction = Math.sign(this.cameraVector.z) || 1;
			this.selectedSignedAxisVector.set(0, 0, 1);

		}
		else if (this.selectedAxis == OBJ_AXIS.CAMERA) {

		var absX = Math.abs(this.cameraVector.x);
		var absY = Math.abs(this.cameraVector.y);
		var absZ = Math.abs(this.cameraVector.z);

		if ( absX > absY && absX > absZ ) {

			this.direction = Math.sign(this.cameraVector.x) || 1;
			this.selectedSignedAxisVector.set(1,0,0);
		}
		else if ( absY > absX && absY > absZ ) {

			this.direction = Math.sign(this.cameraVector.y) || 1;
			this.selectedSignedAxisVector.set(0,1,0);
		}
		else if ( absZ > absY && absZ > absX ) {

			this.direction = Math.sign(this.cameraVector.z) || 1;
			this.selectedSignedAxisVector.set(0,0,1);
		}
	}

	if (this.target) {

		this.mouseDownNDC.x = ( mX / event.currentTarget.clientWidth ) * 2 - 1;
		this.mouseDownNDC.y = - ( mY / event.currentTarget.clientHeight ) * 2 + 1;

		this.mouseCurrNDC.copy(this.mouseDownNDC);

		this.objScreenMouseDownNDC.setFromMatrixPosition( this.target.wrapper.matrixWorld );
		this.objScreenMouseDownNDC.project(this.camera);

		var p = this.GetMouse3DOnPlane();
		this.mouse3DPrev.copy(p);
	}
}

RotateControl.prototype.onMouseMove = function(event, helper) {
	var mX = event.offsetX;
	var mY = event.offsetY;

	this.mouseCurrNDC.x = ( mX / event.currentTarget.clientWidth ) * 2 - 1;
	this.mouseCurrNDC.y = - ( mY / event.currentTarget.clientHeight ) * 2 + 1;

	this.update();
	helper.threeObject.quaternion.multiply(this.q);
}

RotateControl.prototype.update = function() {

	var p = this.GetMouse3DOnPlane();
	var objToP = p.clone();
	objToP.sub(this.target.wrapper.position);
	var objToPrevP = this.mouse3DPrev.clone();
	objToPrevP.sub(this.target.wrapper.position);

	this.angleDelta = objToPrevP.angleTo(objToP);

	var axisVector = new THREE.Vector3();
	axisVector.crossVectors(objToPrevP, objToP);
	axisVector.normalize();

	this.mouseAngle += this.angleDelta /*this.mouseAngleDelta*/;
	// Snap mouse angles to closest Math.PI / 48 (96 angles for a rotation)
	if (!p.equals(this.mouse3DPrev)) {
		rotateAmount = 0
		while (this.mouseAngle > Math.PI / 48) {
			this.mouseAngle -= Math.PI / 48;
			rotateAmount += Math.PI / 48;
		}
		while (this.mouseAngle < -Math.PI / 48) {
			this.mouseAngle += Math.PI / 48;
			rotateAmount -= Math.PI / 48;
		}
		this.q.setFromAxisAngle( axisVector, rotateAmount);
		this.target.RotateQuaternion(this.q);
	} else {
		this.q.set(0, 0, 0, 1);
	}

	this.mouse3DPrev.copy(p);
};
