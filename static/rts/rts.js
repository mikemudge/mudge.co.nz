var MainController = function() {
  var canvas = document.getElementById('canvas');

  window.ctrl = this;
  this.renderer = new THREE.WebGLRenderer({'canvas': canvas, antialias: true});
  this.renderer.setSize( window.innerWidth, window.innerHeight );

  this.scene = new THREE.Scene();

  var ambient = new THREE.AmbientLight( 0xFFFFFF );
  this.scene.add( ambient );

  this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  this.camera.position.z = 80;
  this.camera.position.y = 80;
  // This is 45 degrees down onto the map.
  this.camera.rotation.x = -Math.PI * 1 / 4;

  var gridHelper = new THREE.GridHelper(100, 1);
  this.scene.add(gridHelper);

  this.raycaster = new THREE.Raycaster();
  this.mouse = new THREE.Vector2();

  this.game = new Game(this.scene);

  this.keyControls = new KeyControls({
    // WASD
    left: 65,
    up: 87,
    right: 68,
    down: 83
  });

  this.controls = new THREE.OrbitControls(this.camera);
  // this.controls = new THREE.OrbitControls(this.camera, canvas);
  // this.controls.maxDistance = 3;

  window.addEventListener('resize', angular.bind(this, this.resize));
  this.resize();

  var render = angular.bind(this, function() {
    requestAnimationFrame(render);
    this.render();
  });
  render();
}

MainController.prototype.resize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize( window.innerWidth, window.innerHeight );
}

MainController.prototype.render = function(time) {
  this.game.update(time);

  if (this.controls) {
    this.controls.update(time);
  }

  this.renderer.render(this.scene, this.camera);
}

angular.module('rts', [])
.controller('MainController', MainController);

/* ---------------------------------- Game objects ---------------------------------- */
var colors = {
  BLACK: new THREE.Color(THREE.ColorKeywords.black),
  GREEN: new THREE.Color(THREE.ColorKeywords.lime),
  RED: new THREE.Color(THREE.ColorKeywords.red)
}

var Game = function(scene) {
  this.scene = scene;
  this.players = [];
  this.gameObjects = [];

  this.setup();
}

Game.prototype.setup = function() {
  var team1 = new Team(this, colors.GREEN);
  this.addObject(new Spawner(team1, -50, -50));

  var team2 = new Team(this, colors.RED);
  this.addObject(new Spawner(team2, 50, 50));
}

Game.prototype.addObject = function(gameObject) {
  this.scene.add(gameObject.mesh);
  this.gameObjects.push(gameObject);
}
Game.prototype.removeObject = function(gameObject) {
  this.scene.remove(gameObject.mesh);
  this.gameObjects.splice(this.gameObjects.indexOf(gameObject), 1);
}
Game.prototype.update = function(time) {
  angular.forEach(this.gameObjects, angular.bind(this, function(gameObject) {
    if (gameObject.health <= 0) {
      // Dead, leave the game.
      this.removeObject(gameObject);
    }
    gameObject.update();
  }));
}

Game.prototype.getNearby = function(position, range) {
  var result = [];
  var rangeSq = range * range;
  angular.forEach(this.gameObjects, function(gameObject) {
    if (gameObject.mesh.position.distanceToSquared(position) < rangeSq) {
      result.push(gameObject);
    }
  });
  result.sort();
  return result;
}

var Team = function(game, color) {
  this.game = game;
  this.color = color;
}

var cube = function(size, color) {
  var geometry = new THREE.BoxGeometry( size, size, size );
  var material = new THREE.MeshBasicMaterial( {color: color} );
  var cube = new THREE.Mesh( geometry, material );
  return cube;
}

var Spawner = function(team, x, z) {
  this.game = team.game;
  this.team = team;
  this.buildTime = 50;
  this.mesh = cube(10, team.color);
  this.mesh.position.x = x;
  this.mesh.position.z = z;
}
Spawner.prototype.update = function() {
  this.buildTime--;
  if (this.buildTime <= 0) {
    // Complete a unit.
    // TODO generate a position next to this spawner.
    this.game.addObject(new Carrier(this.team, this.mesh.position));
    // 60fps * seconds.
    this.buildTime = 60 * 10;
  }
}

var Carrier = function(team, position) {
  this.dockedUnits = 5;
  this.game = team.game;
  this.team = team;
  this.health = 100;
  this.mesh = cube(6, team.color);
  this.mesh.scale.z = 2;
  this.mesh.position.copy(position);

  var pos = new THREE.Vector3();
  pos.copy(position).negate();
  this.move = new MoveAction(this, pos);
}
Carrier.prototype.update = function() {
  var colorScale = 1 - this.health / 100;
  this.mesh.material.color.copy(this.team.color);
  this.mesh.material.color.lerp(colors.BLACK, colorScale);
  this.mesh.material.needsUpdate = true;

  if (!this.target) {
    // Look for enemy.
    // TODO use sight for range.
    var nearbyUnits = this.game.getNearby(this.mesh.position, 30);
    angular.forEach(nearbyUnits, angular.bind(this, function(unit) {
      if (unit.team != this.team) {
        console.log('Found target', this.team, unit.team);
        this.target = unit;
      }
    }))
  }

  if (this.target) {
    if (this.dockedUnits > 0) {
      // Deploy units.
      this.dockedUnits--;
      var unit = new Unit(this.team, this.mesh.position, this.move.targetPosition);
      // TODO some randomness to units?
      this.game.addObject(unit);
    }
    if (this.target.health <= 0) {
      this.target = null;
    }
  } else {
    this.move.update();
  }
}

var MoveAction = function(unit, position) {
  this.targetPosition = position;
  this.mesh = unit.mesh;

  this.velocity = new THREE.Vector3();
  // TODO should do this each time target position changes.
  this.velocity.subVectors(this.targetPosition, this.mesh.position).setLength(0.1);
}

MoveAction.prototype.update = function() {
  this.mesh.lookAt(this.targetPosition);
  this.mesh.position.add(this.velocity);
}

var Unit = function(team, position, targetPosition) {
  this.game = team.game;
  this.mesh = cube(1, team.color);
  this.team = team;
  this.health = 100;
  this.mesh.position.copy(position);

  this.move = new MoveAction(this, targetPosition);
}
Unit.prototype.update = function() {
  var colorScale = 1 - this.health / 100;
  this.mesh.material.color.copy(this.team.color);
  this.mesh.material.color.lerp(colors.BLACK, colorScale);
  this.mesh.material.needsUpdate = true;

  if (!this.target) {
    // Look for enemy.
    // TODO use sight for range.
    var nearbyUnits = this.game.getNearby(this.mesh.position, 10);
    angular.forEach(nearbyUnits, angular.bind(this, function(unit) {
      if (unit.team != this.team) {
        console.log('Found target', this.team, unit.team);
        this.target = unit;
      }
    }))
  }
  if (this.target) {
    // Fight the target, chasing it down.
    this.target.health--;
    if (this.target.health <= 0) {
      this.target = null;
    }
  } else {
    this.move.update();
  }
}

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

var KeyControls = function(keySettings) {
  this.keys = keySettings;
}
KeyControls.down = {};

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
