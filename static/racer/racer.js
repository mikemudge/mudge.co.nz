
var Player = function() {
  // TODO should have a mesh
  this.x = (Math.random() * 18 + 1) * 100;
  this.y = (Math.random() * 18 + 1) * 100;
  this.ang = 0;
  this.vx = 0;
  this.vy = 0;
};
Player.ACCELERATION = 0.015;
Player.FRICTION = 0.25;
Player.TURN_SPEED = 0.05;

var MainController = function() {
  var canvas = document.getElementById('canvas');

  this.renderer = new THREE.WebGLRenderer({'canvas': canvas, antialias: true});
  this.renderer.setSize( window.innerWidth, window.innerHeight );

  gamepads = navigator.getGamepads();
  console.log(gamepads);
  if (gamepads[0]) {
    this.gamepad = gamepads[0];
    this.gamepad.vibrationActuator.playEffect("dual-rumble", {
      startDelay: 0,
      duration: 1000,
      weakMagnitude: 1.0,
      strongMagnitude: 1.0
    });
  } else {
    // Add a listener for gamepad connections.
    window.addEventListener("gamepadconnected", function(event) {
      this.gamepad = event.gamepad;
      console.log("Game Pad connected", this.gamepad);
      // A little rumble to show you it connected.
      this.gamepad.vibrationActuator.playEffect("dual-rumble", {
        duration: 1000,
        strongMagnitude: 1.0,
        weakMagnitude: 1.0,
      });
    }.bind(this));
  }

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

  // this.scene.add(this.fractal());

  if (this.gamepad) {
    this.keyControls = new ControllerControls(this.gamepad);
  } else {
    this.keyControls = new KeyControls({
      // WASD
      left: 65,
      up: 87,
      right: 68,
      down: 83
    });
  }
  this.controls = new THREE.OrbitControls(this.camera, canvas);
  this.controls.maxDistance = 3;

  var callback = function(car) {
    // car.position.y = 0.1;
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

  callback(cube);
  // Not working???
  // loadCar(callback);

  window.addEventListener('resize', angular.bind(this, this.resize));

  var render = angular.bind(this, function() {
    requestAnimationFrame(render);
    this.render();
  });
  render();
};

MainController.prototype.track = function() {
  var geometry = new THREE.PlaneGeometry(100, 100, 100, 100);
  var texture = new THREE.TextureLoader().load("/static/img/Track.jpg" );
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
  this.move(this.keyControls.get());

  if (this.cube) {
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

    this.camera.position.x = this.cube.position.x
        - Math.sin(this.cube.rotation.y) * 3;
    this.camera.position.z = this.cube.position.z
        - Math.cos(this.cube.rotation.y) * 3;
    this.camera.position.y = 2;
  }

  this.controls.update(time);

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

var ControllerControls = function() {
}

ControllerControls.prototype.get = function() {
  // Need to re-get each time, values don't change otherwise.
  var gamepad = navigator.getGamepads()[0];
  result = {
    'up': gamepad.buttons[7].value,
    'down': gamepad.buttons[6].value,
    'left': gamepad.buttons[14].value,
    'right': gamepad.buttons[15].value
  };
  if (gamepad.axes[0] < 0.1) {
    result['left'] = -gamepad.axes[0];
  }
  if (gamepad.axes[0] > 0.1) {
    result['right'] = gamepad.axes[0];
  }
  return result;
};

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

angular.module('racer', [
  'ngRoute'
])
.controller('MainController', MainController)
.config(function($locationProvider, $routeProvider) {
  // $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    template: '<canvas id="canvas"></canvas>',
    controller: 'MainController'
  })
})
;
