var SkyBackground = function() {
  // These need to match the <input type='color' /> format.
  this.skyColor = '#00AAFF';
  this.horizonColor = '#EEEEFF';
  this.floorColor = '#00AA00';
}

SkyBackground.prototype.cssColor = function(v) {
  var hex = Number(v).toString(16);
  return '#' + "000000".substring(hex.length) + hex;
}
SkyBackground.prototype.setComponent = function(component) {
  this.component = component;
  if (component.skyColor) {
    this.skyColor = this.cssColor(component.skyColor);
  }
  if (component.horizonColor) {
    this.horizonColor = this.cssColor(component.horizonColor);
  }
  if (component.floorColor) {
    this.floorColor = this.cssColor(component.floorColor);
  }

  this.sky = this.addSkyBackground();
  this.floor = this.addFloorBackground();
  this.update();
}

SkyBackground.prototype.update = function() {
  this.component.skyColor = parseInt(this.skyColor.substring(1), 16);
  this.component.horizonColor = parseInt(this.horizonColor.substring(1), 16);
  this.component.floorColor = parseInt(this.floorColor.substring(1), 16);

  this.sky.material.uniforms.skyColor.value = new THREE.Color(this.skyColor);
  this.sky.material.uniforms.horizonColor.value = new THREE.Color(this.horizonColor);
  this.sky.material.uniforms.lowerHemisphereColor.value = new THREE.Color(this.floorColor);
  this.floor.material.uniforms.color.value = new THREE.Color(this.floorColor);
}

SkyBackground.prototype.addSkyBackground = function() {
  // TODO should init the sky color object here?
  // Might need my own directive which supports threejs.
  // Angular wants colors in #rrggbb format while threejs needs a THREE.Color.
  var skyCol = new THREE.Color(this.skyColor);
  var horizonCol = new THREE.Color(this.horizonColor);
  // This is fairly hidden by the floor?
  var lowerHemisphereCol = new THREE.Color(0x77AAFF);
  var horizonWidth = 0.2; // 10% of the total lattitude top to bottom

  var shaderMaterial = new THREE.ShaderMaterial({
    // update uniforms like so:
    // this.sky.material.uniforms["skyColor"].value = new THREE.Color(0xFFFFFF);
    // this.sky.material.uniforms["horizonWidth"].value = 0.5;
    uniforms: {
      skyColor : { type:'c', value: skyCol },
      horizonColor : { type:'c', value: horizonCol },
      lowerHemisphereColor : { type:'c', value: lowerHemisphereCol },
      horizonWidth : { type:'f', value: horizonWidth },
    },
    vertexShader: DirectorSkyVertexShader,
    fragmentShader: DirectorSkyFragmentShader,
    side: THREE.BackSide,
  });

  this.sky = new THREE.Mesh(
    new THREE.SphereGeometry( 17, 32, 32 ),
    shaderMaterial
  );

  this.sky.visible = true;
  this.sky.updateMatrix();
  this.sky.matrixAutoUpdate = false;
  return this.sky;
}

SkyBackground.prototype.addFloorBackground = function() {

  var color = new THREE.Color(0x00AA00);

  // floor
  var radius = 10;
  var spread = 14;

  var shaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      color : { type:'c', value:color },
      radius : { type:'f', value:radius },
      spread : { type:'f', value:spread },
    },
    vertexShader: DirectorGroundGradientVertexShader,
    fragmentShader: DirectorGroundGradientFragmentShader,
    transparent: true,
  });

  // this.floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(500, 500), materialT);
  this.floor = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(radius*2 + spread, radius*2 + spread),
    shaderMaterial
  );

  // update uniforms like so:
  // this.floor.material.uniforms["color"].value = new THREE.Color(0xFFFFFF);
  // this.floor.material.uniforms["radius"].value = 100;

  this.floor.rotation.z = Math.PI*.9;
  // Lie the floor down, so its not a wall.
  this.floor.rotation.x = -Math.PI/2;
  this.floor.visible = true;
  this.floor.updateMatrix();
  this.floor.matrixAutoUpdate = false;
  return this.floor;
}

var DirectorGroundGradientVertexShader = [
  'precision mediump float;',
  'varying vec3 vPosition;',
  'void main ()',
  '{',
    'vPosition = position;',
    'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join("\n");

var DirectorGroundGradientFragmentShader = [
  'precision mediump float;',
  'uniform vec3 color;',
  'uniform float radius;',
  'uniform float spread;',
  'varying vec3 vPosition;',
  'void main ()',
  '{',
    'float dist = length(vPosition);',

    // 'float fallOff = atan(0.02 * (200.0 - dist))/3.14159 + 0.5;',
    // 'float fallOff = sqrt(1.0 - dist*dist/200.0/200.0);',
    'float fallOff = 1.0 - smoothstep(radius-spread/2.0, radius+spread/2.0, dist);',

    // 'float gridX = 0.5+0.5*(1.0 - smoothstep(0.8, 1.0, mod(vPosition.x/20.0, 1.0)));',
    // 'float gridY = 0.5+0.5*(1.0 - smoothstep(0.8, 1.0, mod(vPosition.y/20.0, 1.0)));',

    // 'float gridX = 0.5 * pow(abs(cos(2.0 * 3.14159 * vPosition.x / 50.0)), 128.0);',
    // 'float gridY = 0.5 * pow(abs(cos(2.0 * 3.14159 * vPosition.y / 50.0)), 128.0);',

    'gl_FragColor = vec4(color, fallOff);',
  '}',
].join("\n");


var DirectorSkyVertexShader = [
  'precision mediump float;',
  'varying vec3 vNormal;',
  'void main ()',
  '{',
    'vNormal = ( modelMatrix * vec4(normal, 0.0) ).xyz;',
    'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join("\n");

var DirectorSkyFragmentShader = [
  'precision mediump float;',
  'uniform vec3 skyColor;',
  'uniform vec3 horizonColor;',
  'uniform vec3 lowerHemisphereColor;',
  'uniform float horizonWidth;',
  'varying vec3 vNormal;',
  'void main ()',
  '{',
    'float lat = -atan(vNormal.y / length(vec2(vNormal.x, vNormal.z)));', //latitude
    'lat = lat / 3.1415 + 0.5;', //set range [0,1]
    'vec3 topCol = mix(skyColor, horizonColor, smoothstep(0.5 - horizonWidth / 2.0, 0.5, lat));',
    'vec3 bottomCol = mix(horizonColor, lowerHemisphereColor, smoothstep(0.5, 0.51, lat));',
    'gl_FragColor = vec4(mix(topCol, bottomCol, step(0.5, lat)), 1.0);',
  '}',
].join("\n");
