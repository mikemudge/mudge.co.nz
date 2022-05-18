
var Player = function() {
  // TODO should have a mesh
  this.x = (Math.random() * 18 + 1) * 100;
  this.y = (Math.random() * 18 + 1) * 100;
  this.ang = 0;
  this.vx = 0;
  this.vy = 0;
};
Player.ACCELERATION = 0.004;
Player.FRICTION = 0.04;
Player.TURN_SPEED = 0.07;
// 0-1 How much your tyres slip on corners.
Player.SLIP_FACTOR = 0.9;

var MainController = function($scope) {
  this.$scope = $scope;
  this.Player = Player;
  var canvas = document.getElementById('canvas');

  this.renderer = new THREE.WebGLRenderer({'canvas': canvas, antialias: true});
  this.renderer.setSize( window.innerWidth, window.innerHeight );

  // TODO enable left + right axes, but not up+down?
  // TODO set 
  this.humanControls = new GameControls({
    'debug': true
  });
  this.humanControls.init();

  this.scene = new THREE.Scene();

  var ambient = new THREE.AmbientLight( 0xFFFFFF );
  this.scene.add( ambient );

  this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  this.camera.position.z = 5;
  this.camera.position.y = 2;

  this.raycaster = new THREE.Raycaster();
  this.mouse = new THREE.Vector2();

  this.vx = 0;
  this.vz = 0;

  this.scene.add(this.track());
  this.scene.add(this.testtrack());

  // this.scene.add(this.fractal());

  this.controls = new THREE.OrbitControls(this.camera, canvas);
  this.controls.maxDistance = 3;
  this.controls.minDistance = 3;
  // We start in close mode.
  this.followMode = 1;

  var callback = function(car) {
    car.position.y = 0.2;
    car.rotation.y = Math.PI;

    this.cube = car;
    this.scene.add(car);

    this.controls.target = this.cube.position;
    this.controls.update();
  }.bind(this);

  var mesh = new THREE.CubeGeometry( .4, .2, .8 );
  var material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0xff0000
  });
  var cube = new THREE.Mesh(mesh, material);

  // callback(cube);
  // Not working???
  loadCar(callback);

  window.addEventListener('resize', angular.bind(this, this.resize));

  // Pause if the window loses focus
  window.addEventListener('blur', function() {
    this.pause = true;
    this.$scope.$apply();
  }.bind(this), false);

  this.start();
}

MainController.prototype.start = function() {
  // game.start???
  // TODO still want to check gamepad when paused.
  // And allow menu selection etc?

  this.pause = false;
  var render = function() {
    if (this.pause) {
      return;
    }
    requestAnimationFrame(render);
    this.render();
  }.bind(this);
  render();
};

MainController.prototype.testtrack = function() {
  var size = 100;
  var divisions = 100;

  var gridHelper = new THREE.GridHelper( size, divisions );
  return gridHelper;
}

MainController.prototype.track = function() {
  var geometry = new THREE.PlaneGeometry(100, 100, 100, 100);
  var texture = new THREE.TextureLoader().load("/static/img/Track.jpg?v=1" );
  var material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    // color: 0xD43A65,
    // wireframe: true,
  });
  var plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = Math.PI * 0.50;
  return plane;
}

MainController.prototype.resize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize( window.innerWidth, window.innerHeight );
}

MainController.prototype.render = function(time) {
  if (this.cube) {
    var speed = Math.sqrt(this.vx * this.vx + this.vz * this.vz)
    // Direction based on angle.
    var expectedx = Math.sin(this.cube.rotation.y);
    var expectedz = Math.cos(this.cube.rotation.y);

    // Dot product to find direction of speed.
    var dp = this.vx * expectedx + this.vz * expectedz;
    if (dp < 0) {
      // Reversing.
      speed *= -1
    }

    this.move(this.humanControls.get(), speed);

    this.cube.position.x += this.vx;
    this.cube.position.z += this.vz;

    // Use some original speed and some speed in your aimed direction.
    // This acts like tyre grip.
    // TODO should be higher at high speeds?
    // TODO like turn speed?

    var speed = Math.sqrt(this.vx * this.vx + this.vz * this.vz)

    var slipFactor = Player.SLIP_FACTOR;
    slipFactor *= Math.abs(speed) * 2

    // TODO if braking, then slipFactor should be higher?
    if (slipFactor > 1) {
      slipFactor = 1;
    }
    // Dot product to find direction of speed.
    var dp = this.vx * expectedx + this.vz * expectedz;
    if (dp < 0) {
      // Reversing.
      speed *= -1
    }

    var mx = this.vx * slipFactor;
    var mz = this.vz * slipFactor;
    var gx = (1 - slipFactor) * expectedx * speed;
    var gz = (1 - slipFactor) * expectedz * speed;
    this.vx = mx + gx;
    this.vz = mz + gz;

    // Slow down;
    this.vx *= (1 - 0.2 * Player.FRICTION);
    this.vz *= (1 - 0.2 * Player.FRICTION);
    if (this.vx < 0.001 && this.vx > -0.001) {
      this.vx = 0;
    }
    if (this.vz < 0.001 && this.vz > -0.001) {
      this.vz = 0;
    }

    // Loosly follow the car, but don't change camera height.
    // TODO support follow distance? With variable height too?
    this.camera.lookAt(this.cube.position);
    this.camera.position.y = 2;
  }

  this.controls.update(time);

  this.renderer.render(this.scene, this.camera);
}

MainController.prototype.move = function(keys, speed) {
  if (keys.toggleView) {
    if (this.followMode != 1) {
      this.followMode = 1;
      this.controls.maxDistance = 3;
    } else {
      this.followMode = 2;
      this.controls.maxDistance = 5;
    }
  }

  if (keys.pause) {
    this.pause = true;
    this.$scope.$apply();
  }

  if (keys.up) {
    this.vx += keys.up * Math.sin(this.cube.rotation.y) * Player.ACCELERATION;
    this.vz += keys.up * Math.cos(this.cube.rotation.y) * Player.ACCELERATION;
  }
  if (keys.down) {
    this.vx -= keys.down * Math.sin(this.cube.rotation.y) * Player.ACCELERATION;
    this.vz -= keys.down * Math.cos(this.cube.rotation.y) * Player.ACCELERATION;
  }
  // turnSpeed increases with speed, but not linearly.
  var turnSpeed = Math.sign(speed) * Math.sqrt(Math.abs(speed)) * Player.TURN_SPEED;

  if (keys.left) {
    this.cube.rotation.y += keys.left * turnSpeed;
  }
  if (keys.right) {
    this.cube.rotation.y -= keys.right * turnSpeed;
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

angular.module('racer', [
  'ngRoute',
  'config'
])
.controller('MainController', MainController)
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    templateUrl: '/static/racer/racer.tpl.html?v=' + config.version,
    controller: 'MainController',
    controllerAs: 'ctrl'
  })
})
;
