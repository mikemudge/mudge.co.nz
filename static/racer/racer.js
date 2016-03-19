
var Player = function() {
  // TODO should have a mesh
  this.x = (Math.random() * 18 + 1) * 100;
  this.y = (Math.random() * 18 + 1) * 100;
  this.ang = 0;
  this.vx = 0;
  this.vy = 0;
};
Player.ACCELERATION = 0.005;
Player.FRICTION = 0.25;
Player.TURN_SPEED = 0.05;

var MainController = function() {
  var canvas = document.getElementById('canvas');

  this.renderer = new THREE.WebGLRenderer({'canvas': canvas});
  this.renderer.setSize( window.innerWidth, window.innerHeight );

  var geometry = new THREE.BoxGeometry( 1, 1, 1 );
  var material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
  this.cube = new THREE.Mesh( geometry, material );
  this.cube.scale.z = 1.5;
  // Move above the plane.
  this.cube.position.y = 1;

  var loader = new THREE.BinaryLoader();
  //obj/veyron/VeyronNoUv_bin.js
  loader.load("http://threejs.org/examples/obj/f50/F50NoUv_bin.js", angular.bind(this, function( geometry ) {
    geometry.sortFacesByMaterialIndex();

    var m = new THREE.MultiMaterial();

    var r = "/static/img/";
    var urls = [
      r + "posz.jpg", r + "posz.jpg",
      r + "posz.jpg", r + "posz.jpg",
      r + "posz.jpg", r + "posz.jpg"
    ];

    var textureCube = new THREE.CubeTextureLoader().load( urls );
    textureCube.format = THREE.RGBFormat;

    var mlib = {
      "Orange":   new THREE.MeshLambertMaterial( { color: 0xff6600, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.3 } ),
      "Blue":   new THREE.MeshLambertMaterial( { color: 0x001133, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.3 } ),
      "Red":    new THREE.MeshLambertMaterial( { color: 0x660000, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.25 } ),
      "Black":  new THREE.MeshLambertMaterial( { color: 0x000000, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.15 } ),
      "White":  new THREE.MeshLambertMaterial( { color: 0xffffff, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.25 } ),

      "Carmine":  new THREE.MeshPhongMaterial( { color: 0x770000, specular:0xffaaaa, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Gold":   new THREE.MeshPhongMaterial( { color: 0xaa9944, specular:0xbbaa99, shininess:50, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Bronze": new THREE.MeshPhongMaterial( { color: 0x150505, specular:0xee6600, shininess:10, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.25 } ),
      "Chrome":   new THREE.MeshPhongMaterial( { color: 0xffffff, specular:0xffffff, envMap: textureCube, combine: THREE.MultiplyOperation } ),

      "Orange metal": new THREE.MeshLambertMaterial( { color: 0xff6600, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Blue metal":   new THREE.MeshLambertMaterial( { color: 0x001133, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Red metal":  new THREE.MeshLambertMaterial( { color: 0x770000, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Green metal":  new THREE.MeshLambertMaterial( { color: 0x007711, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Black metal":  new THREE.MeshLambertMaterial( { color: 0x222222, envMap: textureCube, combine: THREE.MultiplyOperation } ),

      "Pure chrome":  new THREE.MeshLambertMaterial( { color: 0xffffff, envMap: textureCube } ),
      "Dark chrome":  new THREE.MeshLambertMaterial( { color: 0x444444, envMap: textureCube } ),
      "Darker chrome":new THREE.MeshLambertMaterial( { color: 0x222222, envMap: textureCube } ),

      "Black glass":  new THREE.MeshLambertMaterial( { color: 0x101016, envMap: textureCube, opacity: 0.975, transparent: true } ),
      "Dark glass": new THREE.MeshLambertMaterial( { color: 0x101046, envMap: textureCube, opacity: 0.25, transparent: true } ),
      "Blue glass": new THREE.MeshLambertMaterial( { color: 0x668899, envMap: textureCube, opacity: 0.75, transparent: true } ),
      "Light glass":  new THREE.MeshBasicMaterial( { color: 0x223344, envMap: textureCube, opacity: 0.25, transparent: true, combine: THREE.MixOperation, reflectivity: 0.25 } ),

      "Red glass":  new THREE.MeshLambertMaterial( { color: 0xff0000, opacity: 0.75, transparent: true } ),
      "Yellow glass": new THREE.MeshLambertMaterial( { color: 0xffffaa, opacity: 0.75, transparent: true } ),
      "Orange glass": new THREE.MeshLambertMaterial( { color: 0x995500, opacity: 0.75, transparent: true } ),

      "Orange glass 50":  new THREE.MeshLambertMaterial( { color: 0xffbb00, opacity: 0.5, transparent: true } ),
      "Red glass 50":   new THREE.MeshLambertMaterial( { color: 0xff0000, opacity: 0.5, transparent: true } ),

      "Fullblack rough":  new THREE.MeshLambertMaterial( { color: 0x000000 } ),
      "Black rough":    new THREE.MeshLambertMaterial( { color: 0x050505 } ),
      "Darkgray rough": new THREE.MeshLambertMaterial( { color: 0x090909 } ),
      "Red rough":    new THREE.MeshLambertMaterial( { color: 0x330500 } ),

      "Darkgray shiny": new THREE.MeshPhongMaterial( { color: 0x000000, specular: 0x050505 } ),
      "Gray shiny":   new THREE.MeshPhongMaterial( { color: 0x050505, shininess: 20 } )
    };

    var material = mlib['Red']; new THREE.MeshBasicMaterial( { color: 0xff0000 } );

    mmap = {
      0:  mlib[ "Dark chrome" ],    // interior + rim
      1:  mlib[ "Pure chrome" ],    // wheels + gears chrome
      2:  mlib[ "Blue glass" ],     // glass
      3:  material,      // torso mid + front spoiler
      4:  mlib[ "Darkgray shiny" ],   // interior + behind seats
      5:  mlib[ "Darkgray shiny" ],   // tiny dots in interior
      6:  material,      // back torso
      7:  material,      // right mirror decal
      8:  material,      // front decal
      9:  material,      // front torso
      10: material,      // left mirror decal
      11: mlib[ "Pure chrome" ],    // engine
      12: mlib[ "Darkgray rough" ], // tires side
      13: mlib[ "Darkgray rough" ], // tires bottom
      14: mlib[ "Darkgray shiny" ],   // bottom
      15: mlib[ "Black rough" ],    // ???
      16: mlib[ "Orange glass" ],   // front signals
      17: mlib[ "Dark chrome" ],    // wheels center
      18: mlib[ "Red glass" ],    // back lights
      19: mlib[ "Black rough" ],    // ???
      20: mlib[ "Red rough" ],    // seats
      21: mlib[ "Black rough" ],    // back plate
      22: mlib[ "Black rough" ],    // front light dots
      23: material,      // back torso
      24: material       // back torso center
    }

    for ( var i in mmap ) {
      m.materials[ i ] = mmap[ i ];
    }

    var mesh = new THREE.Mesh( geometry, m );

    // This model is big.
    mesh.scale.x = mesh.scale.y = mesh.scale.z = 0.0001;
    mesh.position.y = 1;
    mesh.rotation.y = Math.PI;

    this.cube = mesh;
    this.scene.add( mesh );
  }));

  this.scene = new THREE.Scene();
  this.scene.add(this.cube);

  var ambient = new THREE.AmbientLight( 0x050505 );
  this.scene.add( ambient );

  var directionalLight = new THREE.DirectionalLight( 0xffffff, 2 );
  directionalLight.position.set( 2, 1.2, 10 ).normalize();
  this.scene.add( directionalLight );

  directionalLight = new THREE.DirectionalLight( 0xffffff, 1 );
  directionalLight.position.set( -2, 1.2, -10 ).normalize();
  this.scene.add( directionalLight );

  var pointLight = new THREE.PointLight( 0xffaa00, 2 );
  pointLight.position.set( 2000, 1200, 10000 );
  this.scene.add( pointLight );

  this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  this.camera.position.z = 5;

  this.raycaster = new THREE.Raycaster();
  this.mouse = new THREE.Vector2();

  this.vx = 0;
  this.vz = 0;

  var geometry = new THREE.PlaneGeometry(100, 100, 100, 100);
  var material = new THREE.MeshBasicMaterial({
    color: 0xD43A65,
    side: THREE.DoubleSide,
    wireframe: true
  });
  this.plane = new THREE.Mesh(geometry, material);
  this.plane.rotation.x = Math.PI * 0.50;
  this.camera.position.y = 5;
  this.scene.add(this.plane);

  this.keyControls = new KeyControls({
    // WASD
    left: 65,
    up: 87,
    right: 68,
    down: 83
  });
  this.controls = new THREE.OrbitControls(this.camera, canvas);

  window.addEventListener('resize', angular.bind(this, this.resize));

  var render = angular.bind(this, function() {
    requestAnimationFrame(render);
    this.render();
  });
  render();
};

MainController.prototype.resize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize( window.innerWidth, window.innerHeight );
}

MainController.prototype.render = function() {
  this.move(this.keyControls.get());

  this.cube.position.x += this.vx;
  this.cube.position.z += this.vz;

  // Slow down;
  this.vx *= (1 - 0.2 * Player.FRICTION);
  this.vz *= (1 - 0.2 * Player.FRICTION);
  if (this.vx < 0.001 && this.vx > -0.001) {
    this.vx = 0;
  }
  if (this.vz < 0.001 && this.vz > -0.001) {
    this.vz = 0;
  }

  this.renderer.render(this.scene, this.camera);
}

MainController.prototype.move = function(keys) {
  if (keys.left) {
    this.cube.rotation.y += Player.TURN_SPEED;
  }
  if (keys.right) {
    this.cube.rotation.y -= Player.TURN_SPEED;
  }
  if (keys.up) {
    this.vx += Math.sin(this.cube.rotation.y) * Player.ACCELERATION;
    this.vz += Math.cos(this.cube.rotation.y) * Player.ACCELERATION;
  }
  if (keys.down) {
    this.vx -= Math.sin(this.cube.rotation.y) * Player.ACCELERATION;
    this.vz -= Math.cos(this.cube.rotation.y) * Player.ACCELERATION;
  }
}

MainController.prototype.mouseMove = function(event) {
  mouse.x = ( event.clientX / this.renderer.domElement.width ) * 2 - 1;
  mouse.y = - ( event.clientY / this.renderer.domElement.height ) * 2 + 1;
}

MainController.prototype.getAim = function() {
  raycaster.setFromCamera( mouse, camera );
  // objects needs to contain the floor.
  var intersects = raycaster.intersectObjects( objects, false /* recurse */);
}

var KeyControls = function(keySettings) {
  this.keys = keySettings;
}
KeyControls.down = {};

KeyControls.prototype.setTeam = function(team) {
  this.team = team;
  this.player = team.players[0];
}

KeyControls.prototype.get = function() {
  return {
    'up': KeyControls.down[this.keys.up],
    'down': KeyControls.down[this.keys.down],
    'left': KeyControls.down[this.keys.left],
    'right': KeyControls.down[this.keys.right]
  };
};

KeyControls.keyUp = function(e) {
  var key = e.keyCode ? e.keyCode : e.which;
  KeyControls.down[key] = false;
}
window.onkeyup = KeyControls.keyUp;

KeyControls.keyDown = function(e) {
  var key = e.keyCode ? e.keyCode : e.which;
  KeyControls.down[key] = true;
}
window.onkeydown = KeyControls.keyDown;

angular.module('racer', [])
.controller('MainController', MainController);
