
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

  gamepads = navigator.getGamepads();
  console.log(gamepads);
  if (gamepads[0]) {
    this.gamepad = gamepads[0];
    console.log("Rumble");
    this.gamepad.vibrationActuator.playEffect("dual-rumble", {
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
      console.log("Rumble");
      this.gamepad.vibrationActuator.playEffect("dual-rumble", {
        duration: 1000,
        strongMagnitude: 1.0,
        weakMagnitude: 1.0,
      });

      console.log("Switching to gamepad");
      this.keyControls = new ControllerControls(this.gamepad);

      // TODO hook up controls on join?
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
  this.scene.add(this.testtrack());

  // this.scene.add(this.fractal());

  if (this.gamepad) {
    console.log("Using gamepad");
    this.keyControls = new ControllerControls(this.gamepad);
  } else {
    console.log("Using keyboard");
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

    this.move(this.keyControls.get(), speed);

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

var ControllerControls = function() {
  this.lastButton3 = false;
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

  if (gamepad.buttons[3].pressed && !this.lastButton3) {
    // If the state of button 3 changed from off to on.
    result['toggleView'] = 1;
  }
  this.lastButton3 = gamepad.buttons[3].pressed;

  if (gamepad.buttons[9].pressed) {
    result['pause'] = 1;
  }
  // Handy for figuring out which is which.
  // for (i=0;i<=15;i++) {
  //   if (gamepad.buttons[i].pressed) {
  //     console.log(i);
  //   }
  // }

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
