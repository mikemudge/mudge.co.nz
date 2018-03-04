
var colors = {
  BLACK: new THREE.Color('black'),
  GREEN: new THREE.Color('lime'),
  RED: new THREE.Color('red')
}
mmRts.colors = colors;
var units = window.mmRts.units;

var Game = function(scene) {
  console.log('New game created at ' + new Date())
  this.scene = scene;
  this.players = [];
  this.gameObjects = [];

  this.setup();
}
window.Game = Game;

Game.prototype.setup = function() {
  var team1 = new Team(this, colors.GREEN);
  this.addObject(new units.Spawner(team1, -50, -50));

  var team2 = new Team(this, colors.RED);
  this.addObject(new units.Spawner(team2, 50, 50));
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

// Human controls.
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
window.KeyControls = KeyControls;
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