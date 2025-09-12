// vert shader for helper objects
var OBJHelperVertexShader = [
// regular rendering, no change to geometry
  'precision mediump float;',
  'varying vec3 vNormal;',
  'void main ()',
  '{',
    'vNormal = ( modelViewMatrix * vec4(normal, 0.0) ).xyz;',
    'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join("\n");
// frag shader for helper objects
var OBJHelperFragmentShader = [
// toon shading with constant light direction
  'precision mediump float;',
  'const vec3 selectColor = vec3( 0.9, 0.0, 0.3 );',
  'const vec3 activeColor = vec3( 0.0, 0.7, 0.7 );',
  'uniform vec3 color;',
  'uniform int active;',
  'uniform int selected;',
  'varying vec3 vNormal;',
  'void main()',
  '{',
    'vec3 nNormal = normalize(vNormal);',
    'vec3 light = normalize((viewMatrix * vec4(vec3(1.0), 0.0)).xyz);',
    'float l = clamp(dot(nNormal, light), 0.0, 1.0);',
    'vec3 col = color;',
    'float opacity = 0.85;',
    'if (active==1)',
    ' col = activeColor;',
    'if (selected==1)',
    ' opacity = 1.0;',
    'gl_FragColor = vec4( col * ( 0.5 + 0.5 * smoothstep(0.0,0.2,l) ), opacity );',
  '} ',
].join("\n");

var OBJ_HANDLE_AXIS =
  {
    X : 'X',
    Y : 'Y',
    Z : 'Z',
    MULTI: 'MULTI'
  };

var OBJ_MODE =
  {
    SIMPLE : 0,
    ADVANCED : 1,
  };

var OBJ_ADV_TOOL =
  {
    TRANSLATE : 0,
    ROTATE : 1,
    SCALE : 2,
  };

var OBJ_SIMPLE_TOOL =
  {
    SLIDE : 0,
    DRAG : 1,
    ROTATE : 2,
    ROLL : 3,
  };

var OBJCreateBoundingMesh = function( object , parent ) {

  var boundingBox = new THREE.Box3().setFromObject(object);
  var boundingCenter = boundingBox.center();

  var boundingBoxGeo = new THREE.BoxGeometry(
    boundingBox.max.x - boundingBox.min.x,
    boundingBox.max.y - boundingBox.min.y,
    boundingBox.max.z - boundingBox.min.z
  );

  var boundingBoxMaterial = new THREE.MeshLambertMaterial({wireframe:true});

  var boundingBoxMesh = new THREE.Mesh( boundingBoxGeo , boundingBoxMaterial );

  boundingBoxMesh.position.copy(boundingCenter);

  // boundingBoxMesh.visible = true;

  var boundingMesh = new THREE.Object3D();
  boundingMesh.add(boundingBoxMesh);

  boundingBoxMesh.parentObj = parent;

  return boundingMesh;
};
var OBJHelper = function (frontScene) {

  this.threeObjectSimple = new THREE.Object3D();

  this.translateHandleMulti = new OBJHandle( OBJ_ADV_TOOL.TRANSLATE , OBJ_HANDLE_AXIS.MULTI ); // for reference
  this.threeObjectSimple.add(this.translateHandleMulti.threeObject); // for rendering

  this.rotateHandleMulti = new OBJHandle( OBJ_ADV_TOOL.ROTATE , OBJ_HANDLE_AXIS.MULTI ); // for reference
  this.threeObjectSimple.add(this.rotateHandleMulti.threeObject); // for rendering

  this.threeObjectAdv = new THREE.Object3D();

  // advanced translate handles
  this.translateHandleX = new OBJHandle( OBJ_ADV_TOOL.TRANSLATE , OBJ_HANDLE_AXIS.X ); // for reference
  this.threeObjectAdv.add(this.translateHandleX.threeObject); // for rendering
  this.translateHandleY = new OBJHandle( OBJ_ADV_TOOL.TRANSLATE , OBJ_HANDLE_AXIS.Y ); // for reference
  this.threeObjectAdv.add(this.translateHandleY.threeObject); // for rendering
  this.translateHandleZ = new OBJHandle( OBJ_ADV_TOOL.TRANSLATE , OBJ_HANDLE_AXIS.Z ); // for reference
  this.threeObjectAdv.add(this.translateHandleZ.threeObject); // for rendering

  // advanced rotate handles
  this.rotateHandleX = new OBJHandle( OBJ_ADV_TOOL.ROTATE , OBJ_HANDLE_AXIS.X ); // for reference
  this.threeObjectAdv.add(this.rotateHandleX.threeObject); // for rendering
  this.rotateHandleY = new OBJHandle( OBJ_ADV_TOOL.ROTATE , OBJ_HANDLE_AXIS.Y ); // for reference
  this.threeObjectAdv.add(this.rotateHandleY.threeObject); // for rendering
  this.rotateHandleZ = new OBJHandle( OBJ_ADV_TOOL.ROTATE , OBJ_HANDLE_AXIS.Z ); // for reference
  this.threeObjectAdv.add(this.rotateHandleZ.threeObject); // for rendering

  // advanced rotate handles
  this.scaleHandle = new OBJHandle( OBJ_ADV_TOOL.SCALE ); // for reference
  this.threeObjectAdv.add(this.scaleHandle.threeObject); // for rendering

  this.threeObject = new THREE.Object3D();
  this.threeObject.add(this.threeObjectSimple);
  this.threeObject.add(this.threeObjectAdv);
  frontScene.add(this.threeObject);
};

OBJHelper.prototype.RaycastHandle = function (raycaster) {

  var intersects;

  var hitObj = null;

  var hitSomething = false;

  var translateDist = Infinity;
  var rotateDist = Infinity;

  intersects = raycaster.intersectObject(this.translateHandleMulti.raycastObject, true);
  if (intersects.length > 0) {
    translateDist = intersects[0].distance;
    hitSomething = true;
  }

  intersects = raycaster.intersectObject(this.rotateHandleMulti.raycastObject, true);
  if (intersects.length > 0) {
    rotateDist = intersects[0].distance;
    hitSomething = true;
  }

  if (hitSomething) {
    if (translateDist < rotateDist) {
      hitObj = this.translateHandleMulti;
    }
    else {
      hitObj = this.rotateHandleMulti;
    }
  }

  return hitObj;
}
OBJHelper.prototype.RaycastHandleAdv = function (tool, raycaster) {

  var raycastObjects = [];

  // if (tool === OBJ_ADV_TOOL.TRANSLATE) {
    raycastObjects.push(this.translateHandleX.raycastObject);
    raycastObjects.push(this.translateHandleY.raycastObject);
    raycastObjects.push(this.translateHandleZ.raycastObject);
  // }
  // else if (tool === OBJ_ADV_TOOL.ROTATE) {
    raycastObjects.push(this.rotateHandleX.raycastObject);
    raycastObjects.push(this.rotateHandleY.raycastObject);
    raycastObjects.push(this.rotateHandleZ.raycastObject);
  // }
  // else if (tool === OBJ_ADV_TOOL.SCALE) {
    raycastObjects.push(this.scaleHandle.raycastObject);
  // }

  var intersects = raycaster.intersectObjects( raycastObjects , true );

  var hitObj = null;

  if (intersects.length > 0) {

    var intersectObject = intersects[0].object;
    hitObj = intersectObject.parentObj;
  }

  return hitObj;
}
OBJHelper.prototype.LookAtAxis = function(axisVector) {

  // assumes threeObjectSimple local position is always <0,0,0>
  this.threeObjectSimple.lookAt(axisVector);
};

OBJHelper.prototype.SetVisible = function(visible) {

  this.threeObject.visible = visible;
};

OBJHelper.prototype.SetAdvanced = function(advanced) {

  this.threeObjectSimple.visible = !advanced;
  this.threeObjectAdv.visible = advanced;
};

OBJHelper.prototype.SetToolVisible = function(tool, visible) {

  this.translateHandleX.threeObject.visible = true;
  this.translateHandleY.threeObject.visible = true;
  this.translateHandleZ.threeObject.visible = true;

  this.rotateHandleX.threeObject.visible = true;
  this.rotateHandleY.threeObject.visible = true;
  this.rotateHandleZ.threeObject.visible = true;

  this.scaleHandle.threeObject.visible = true;
};

OBJHelper.prototype.DeselectHandles = function() {

  this.translateHandleMulti.Deselect();
  this.rotateHandleMulti.Deselect();

  this.translateHandleX.Deselect();
  this.translateHandleY.Deselect();
  this.translateHandleZ.Deselect();

  this.rotateHandleX.Deselect();
  this.rotateHandleY.Deselect();
  this.rotateHandleZ.Deselect();

  this.scaleHandle.Deselect();
};

OBJHelper.prototype.UpdateScale = function(camera) {

  var size = 0.5;

  var a = this.threeObject.position.clone();
  var a0 = a.clone();
  a0.project(camera);
  var b0 = new THREE.Vector3(a0.x, a0.y + size, a0.z);

  var b = b0.clone();
  b.unproject(camera);

  var s = a.clone();
  s.sub(b);
  scale = s.length();

  this.threeObject.scale.set(scale, scale, scale);
};

var OBJHandle = function ( tool , axis ) {

  this.tool = tool;
  this.axis = axis;

  this.selected = false;
  this.active = false;

  this.threeObject = null;

  this.raycastObject = null;

  if (this.axis === OBJ_HANDLE_AXIS.MULTI) {

    if (this.tool === OBJ_ADV_TOOL.TRANSLATE) {

      this.SetTranslateHandleMulti();
    }
    else if (this.tool === OBJ_ADV_TOOL.ROTATE) {

      this.SetRotateHandleMulti();
    }

  }
  else {

    if (this.tool === OBJ_ADV_TOOL.TRANSLATE) {

      this.SetTranslateHandleAxis(this.axis);
    }
    else if (this.tool === OBJ_ADV_TOOL.ROTATE) {

      this.SetRotateHandleAxis(this.axis);
    }
    else if (this.tool === OBJ_ADV_TOOL.SCALE) {

      this.SetScaleHandle();
    }
  }
};

OBJHandle.prototype.SetTranslateHandleMulti = function() {
  //creatematerial
  var helperMaterial = new THREE.ShaderMaterial({
    uniforms: {
      selected : { type:'i', value:0 },
      active : { type:'i', value:0 },
      color : { type:'c', value:new THREE.Color(0xFFFFFF) },
    },
    vertexShader: OBJHelperVertexShader,
    fragmentShader: OBJHelperFragmentShader,
    shading: THREE.SmoothShading,
    transparent: true,
  });
  //create arrows
  var translateArrowsPoints = [
    new THREE.Vector2(0.5,2.0),
    new THREE.Vector2(2.0,2.0),
    new THREE.Vector2(2.0,0.5)
  ];
  var translateArrowsShape = new THREE.Shape( translateArrowsPoints );
  var extrudeSettings = { amount: 0.2, bevelEnabled: true, bevelSegments: 1, steps: 0, bevelSize: 0.1, bevelThickness: 0.1 };
  var translateArrowsExtrudeGeo = new THREE.ExtrudeGeometry( translateArrowsShape , extrudeSettings );
  var translateArrowsExtrudeMesh1 = new THREE.Mesh( translateArrowsExtrudeGeo , helperMaterial );
  translateArrowsExtrudeMesh1.rotation.z = Math.PI / 2 * 0;
  translateArrowsExtrudeMesh1.scale.set(10,10,10);
  var translateArrowsExtrudeMesh2 = translateArrowsExtrudeMesh1.clone();
  translateArrowsExtrudeMesh2.rotation.z = Math.PI / 2 * 1;
  translateArrowsExtrudeMesh2.scale.set(10,10,10);
  var translateArrowsExtrudeMesh3 = translateArrowsExtrudeMesh1.clone();
  translateArrowsExtrudeMesh3.rotation.z = Math.PI / 2 * 2;
  translateArrowsExtrudeMesh3.scale.set(10,10,10);
  var translateArrowsExtrudeMesh4 = translateArrowsExtrudeMesh1.clone();
  translateArrowsExtrudeMesh4.rotation.z = Math.PI / 2 * 3;
  translateArrowsExtrudeMesh4.scale.set(10,10,10);
  var translateArrowsObject = new THREE.Object3D();
  translateArrowsObject.add( translateArrowsExtrudeMesh1 );
  translateArrowsObject.add( translateArrowsExtrudeMesh2 );
  translateArrowsObject.add( translateArrowsExtrudeMesh3 );
  translateArrowsObject.add( translateArrowsExtrudeMesh4 );
  translateArrowsObject.rotation.z = Math.PI / 4;

  //create center sphere
  var translateHandleGeo = new THREE.SphereGeometry( 10, 16, 16 );
  var translateHandle = new THREE.Mesh( translateHandleGeo , helperMaterial );
  translateHandle.add( translateArrowsObject );

  var boundingMesh = OBJCreateBoundingMesh(translateHandle, this);
  translateHandle.add(boundingMesh);
  boundingMesh.visible = false;

  this.raycastObject = boundingMesh.children[0];

  this.threeObject = translateHandle;
};
OBJHandle.prototype.SetRotateHandleMulti = function() {
  //creatematerial
  var helperMaterial = new THREE.ShaderMaterial({
    uniforms: {
      selected : { type:'i', value:0 },
      active : { type:'i', value:0 },
      color : { type:'c', value:new THREE.Color(0xFFFFFF) },
    },
    vertexShader: OBJHelperVertexShader,
    fragmentShader: OBJHelperFragmentShader,
    shading: THREE.SmoothShading,
    transparent: true,
  });

  //create center sphere
  var sphereGeo = new THREE.SphereGeometry( .07, .16, .16 );
  var sphere = new THREE.Mesh( sphereGeo , helperMaterial );
  sphere.position.y = .50; //boundingTop * 13 / 12;

  var lineMaterial = new THREE.LineBasicMaterial();
  var circleGeo = new THREE.CircleGeometry( sphere.position.y , .32 );
  circleGeo.vertices.shift();
  var circle = new THREE.Line( circleGeo , lineMaterial );

  var rotateHandle = new THREE.Object3D();
  rotateHandle.material = helperMaterial;
  rotateHandle.circle = circle;
  rotateHandle.add(circle);
  rotateHandle.sphere = sphere;
  rotateHandle.add(sphere);

  var boundingMesh = OBJCreateBoundingMesh(sphere, this);
  rotateHandle.add(boundingMesh);
  boundingMesh.visible = false;

  this.raycastObject = boundingMesh.children[0];

  this.threeObject = rotateHandle;
};

OBJHandle.prototype.SetTranslateHandleAxis = function(axis) {

  var color = new THREE.Color(0x000000);

  if (axis == OBJ_HANDLE_AXIS.X) {
    color = new THREE.Color(0xF92672);
  }
  else if (axis == OBJ_HANDLE_AXIS.Y) {
    color = new THREE.Color(0xA6E22E);
  }
  else if (axis == OBJ_HANDLE_AXIS.Z) {
    color = new THREE.Color(0x5CD9EF);
  }

  //create material
  var helperMaterial = new THREE.ShaderMaterial({
    uniforms: {
      selected : { type:'i', value:0 },
      active : { type:'i', value:0 },
      color : { type:'c', value:color },
    },
    vertexShader: OBJHelperVertexShader,
    fragmentShader: OBJHelperFragmentShader,
    shading: THREE.SmoothShading,
    transparent: true,
  });

  this.arrowMesh = new THREE.Object3D();
  this.helperMaterial = helperMaterial;

  this.arrowMesh.scale.set(0.07,0.07,0.07);
  if (axis === OBJ_HANDLE_AXIS.X) {
    this.arrowMesh.rotation.z -= Math.PI / 2;
  }
  else if (axis === OBJ_HANDLE_AXIS.Z) {
    this.arrowMesh.rotation.x += Math.PI / 2;
  }

  this.translateHandle = new THREE.Object3D();
  this.translateHandle.material = helperMaterial;

  this.raycastObject = this.arrowMesh;

  this.threeObject = this.translateHandle;

  var loader = new THREE.OBJLoader();
  loader.load(
    '/static/8i/obj/arrow10.obj',
    function (object) {
      var material = this.helperMaterial;
      object.traverse(
        function (child) {
          if (child instanceof THREE.Mesh) {
            if (!child.geometry.getAttribute("normal")) {
              child.geometry.computeFaceNormals();
              child.geometry.computeVertexNormals();
            }
            child.material = material;
          }
        }
      );
      object.position.y += 2.6;
      this.arrowMesh.add(object);

      this.translateHandle.add(this.arrowMesh);

      var boundingMesh = OBJCreateBoundingMesh(this.translateHandle, this);
      this.translateHandle.add(boundingMesh);
      boundingMesh.visible = false;

      this.raycastObject = boundingMesh.children[0];

    }.bind(this));
};
OBJHandle.prototype.SetRotateHandleAxis = function(axis) {

  var color = new THREE.Color(0x000000);

  if (axis == OBJ_HANDLE_AXIS.X) {
    color = new THREE.Color(0xF92672);
  }
  else if (axis == OBJ_HANDLE_AXIS.Y) {
    color = new THREE.Color(0xA6E22E);
  }
  else if (axis == OBJ_HANDLE_AXIS.Z) {
    color = new THREE.Color(0x5CD9EF);
  }

  // create material
  var helperMaterial = new THREE.ShaderMaterial({
    uniforms: {
      selected : { type:'i', value:0 },
      active : { type:'i', value:0 },
      color : { type:'c', value:color },
    },
    vertexShader: OBJHelperVertexShader,
    fragmentShader: OBJHelperFragmentShader,
    shading: THREE.SmoothShading,
    transparent: true,
  });

  var radius = 0.65;

  var sphereGeo = new THREE.SphereGeometry( 0.07 , .16 , .16 );

  var translateMat = new THREE.Matrix4();
  translateMat.makeTranslation(0, radius, 0);
  sphereGeo.applyMatrix(translateMat);

  var sphere = new THREE.Mesh( sphereGeo , helperMaterial );

  var lineMaterial = new THREE.LineBasicMaterial({color: color});
  var circleGeo = new THREE.CircleGeometry( radius , 32 );
  circleGeo.vertices.shift();
  var circle = new THREE.Line( circleGeo , lineMaterial );

  if (axis === OBJ_HANDLE_AXIS.X) {
    sphere.rotation.y -= Math.PI / 2;
  }
  else if (axis === OBJ_HANDLE_AXIS.Y) {
    sphere.rotation.x += Math.PI / 2;
  }
  else if (axis === OBJ_HANDLE_AXIS.Z) {
    sphere.rotation.z -= Math.PI / 2;
  }

  if (axis === OBJ_HANDLE_AXIS.X) {
    circle.rotation.z += Math.PI / 2;
    circle.rotation.y -= Math.PI / 2;
  }
  else if (axis === OBJ_HANDLE_AXIS.Y) {
    circle.rotation.x += Math.PI / 2;
  }

  var rotateHandle = new THREE.Object3D();
  rotateHandle.material = helperMaterial;
  rotateHandle.add(sphere);
  rotateHandle.add(circle);

  var boundingMesh = OBJCreateBoundingMesh(sphere, this);
  rotateHandle.add(boundingMesh);
  boundingMesh.visible = false;

  rotateHandle.circle = circle;
  rotateHandle.circle.visible = false;
  rotateHandle.sphere = sphere;

  // TODO hacky raycast into mesh so the object can be invisible.
  this.raycastObject = boundingMesh.children[0];

  this.threeObject = rotateHandle;
};
OBJHandle.prototype.SetScaleHandle = function() {

  var color = new THREE.Color(0xFFFFFF);

  // create material
  var helperMaterial = new THREE.ShaderMaterial({
    uniforms: {
      selected : { type:'i', value:0 },
      active : { type:'i', value:0 },
      color : { type:'c', value:color },
    },
    vertexShader: OBJHelperVertexShader,
    fragmentShader: OBJHelperFragmentShader,
    transparent: true,
  });

  cubeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.15),
    helperMaterial
  );

  var scaleHandle = new THREE.Object3D();
  scaleHandle.material = helperMaterial;
  scaleHandle.add(cubeMesh);

  var boundingMesh = OBJCreateBoundingMesh(scaleHandle, this);
  scaleHandle.add(boundingMesh);
  boundingMesh.visible = false;

  this.raycastObject = boundingMesh.children[0];

  this.threeObject = scaleHandle;
};

OBJHandle.prototype.Select = function() {

  this.selected = true;
  this.threeObject.material.uniforms["selected"].value = 1;

  if (this.tool === OBJ_ADV_TOOL.ROTATE /*&& this.axis === OBJ_HANDLE_AXIS.MULTI*/) {
    this.threeObject.sphere.material.uniforms["selected"].value = 1;
    this.threeObject.circle.visible = true;
  }
};
OBJHandle.prototype.Deselect = function() {

  this.selected = false;
  this.threeObject.material.uniforms["selected"].value = 0;

  if (this.tool === OBJ_ADV_TOOL.ROTATE /*&& this.axis === OBJ_HANDLE_AXIS.MULTI*/) {
    this.threeObject.sphere.material.uniforms["selected"].value = 0;
    this.threeObject.circle.visible = false;
  }

  this.Deactivate();
};
OBJHandle.prototype.Activate = function() {

  this.active = true;
  this.threeObject.material.uniforms["active"].value = 1;

  if (this.tool === OBJ_ADV_TOOL.ROTATE /*&& this.axis === OBJ_HANDLE_AXIS.MULTI*/) {
    this.threeObject.sphere.material.uniforms["active"].value = 1;
    this.threeObject.sphere.visible = false;
    this.threeObject.circle.visible = true;
  }
};
OBJHandle.prototype.Deactivate = function() {

  this.active = false;
  this.threeObject.material.uniforms["active"].value = 0;

  if (this.tool === OBJ_ADV_TOOL.ROTATE /*&& this.axis === OBJ_HANDLE_AXIS.MULTI*/) {
    this.threeObject.sphere.material.uniforms["active"].value = 0;
    this.threeObject.circle.visible = false;
    this.threeObject.sphere.visible = true;
  }
};
