var Grid = function(params) {
  this.width = 31;
  this.height = 21;
  this.size = 30;
  this.top = 50;
  this.left = 50;
  this.reset();
}
Grid.prototype.reset = function() {
  this.tiles = [];
  for (y = 0; y < this.height; y++) {
    for (x = 0; x < this.width; x++) {
      tile = new Tile(this, x, y);
      this.tiles.push(tile);
      if (x == 0 || y == 0 || y == this.height - 1 || x == this.width - 1 || (x % 2 == 0 && y % 2 == 0)) {
        tile.color = 'white';
        // Can't walk through this.
        tile.solid = true;
        // And can't destroy it either.
        tile.destructable = false;
      } else if (x + y < 4) {
        // Leave a gap in the start corner.
      } else {
        // Default to dirt tiles.
        tile.solid = true;
        tile.color = 'brown';
        if (Math.random() < .1) {
          if (Math.random() < .5) {
            tile.powerup = 'explodeSize';
          } else {
            tile.powerup = 'numBombs';
          }
        }
      }
    }
  }
}
Grid.prototype.getTile = function(x, y) {
  if (x < 0 || y < 0 || x > this.width || y > this.height) {
    return null;
  }
  return this.tiles[y * this.width + x];
}

Grid.prototype.render = function(ctx) {
  // TODO support rendering a window of a map to allow for larger maps.
  var size = this.size;
  ctx.strokeStyle = 'green';
  for (y = 0; y < this.height; y++) {
    for (x = 0; x < this.width; x++) {
      var t = this.getTile(x, y);
      t.draw(ctx);
    }
  }
}

Grid.prototype.drawPlayer = function(ctx, player) {
  var half = this.size / 2;
  ctx.beginPath();
  ctx.arc(this.left + half + player.x * this.size, this.top + half + player.y * this.size, half * .8, 0, 2 * Math.PI, false);
  ctx.fillStyle = player.color;
  ctx.fill();  
}

Grid.prototype.drawFlame = function(ctx, x, y) {
  t = this.getTile(x, y);
  if (t == null) {
    return true;
  }
  if (t.solid && !t.destructable) {
    // No flame rendered for solid blocks;
    return true;
  }
  var half = this.size / 2;
  ctx.beginPath();
  ctx.arc(this.left + half + x * this.size, this.top + half + y * this.size, half, 0, 2 * Math.PI, false);
  ctx.fillStyle = 'yellow';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(this.left + half + x * this.size, this.top + half + y * this.size, half * .9, 0, 2 * Math.PI, false);
  ctx.fillStyle = 'orange';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(this.left + half + x * this.size, this.top + half + y * this.size, half * .7, 0, 2 * Math.PI, false);
  ctx.fillStyle = 'red';
  ctx.fill();
}

var Tile = function(grid, x, y) {
  this.grid = grid;
  this.x = x;
  this.y = y;
  this.color = 'black'
  this.solid = false;
  this.destructable = true;
  this.flameTime = 0;
};

Tile.prototype.addBomb = function(bomb) {
  if (this.bomb) {
    throw new Error('bomb already set' + bomb.x + ',' + bomb.y + ' and ' + this.bomb.x + ',' + this.bomb.y);
  }
  this.bomb = bomb;
}

Tile.prototype.explodeBomb = function() {
  // Unset the bomb
  this.addFlame();
  // Add explosions instead
  for (i = 1; i <= this.bomb.explodeSize; i++) {
    t = this.grid.getTile(this.bomb.x + i, this.bomb.y);
    if (!t.addFlame()) {
      // If we reach a tile which we can't add a flame too, then we stop.
      break;
    }
  }
  for (i = 1; i <= this.bomb.explodeSize; i++) {
    t = this.grid.getTile(this.bomb.x - i, this.bomb.y);
    if (!t.addFlame()) {
      // If we reach a tile which we can't add a flame too, then we stop.
      break;
    }
  }
  for (i = 1; i <= this.bomb.explodeSize; i++) {
    t = this.grid.getTile(this.bomb.x, this.bomb.y + i);
    if (!t.addFlame()) {
      // If we reach a tile which we can't add a flame too, then we stop.
      break;
    }
  }
  for (i = 1; i <= this.bomb.explodeSize; i++) {
    t = this.grid.getTile(this.bomb.x, this.bomb.y - i);
    if (!t.addFlame()) {
      // If we reach a tile which we can't add a flame too, then we stop.
      break;
    }
  }
  this.bomb = null;
}

Tile.prototype.addFlame = function() {
  if (!this.destructable) {
    // Tiles which can't be broken will stop the flame immediately.
    return false;
  }
  if (this.bomb) {
    // Drop the time down to 0 so it will explode in the next update.
    // TODO ensure this doesn't affect bombs immediately.
    this.bomb.time = 0;
  }
  if (this.powerup && !this.solid) {
    // If there is a powerup and the tile has already been destroyed the powerup will be destroyed.
    this.powerup = null;
  }
  this.color = 'black';
  this.flameTime = 30;
  if (this.solid) {
    // If this tile was solid then unset that, but stop the flame from progressing.
    this.solid = false;
    return false;
  }
  return true;
}

Tile.prototype.draw = function(ctx) {
  var size = this.grid.size;
  ctx.fillStyle = this.color;
  ctx.fillRect(this.grid.left + this.x * size, this.grid.top + this.y * size, size, size);
  if (!this.solid && this.powerup == 'explodeSize') {
    ctx.fillStyle = 'red';
    ctx.fillRect(this.grid.left + size / 2 - 3 + this.x * size, this.grid.top + size / 2 - 3 + this.y * size, 6, 6);
  } else if (!this.solid && this.powerup == 'numBombs') {
    ctx.fillStyle = 'green';
    ctx.fillRect(this.grid.left + size / 2 - 3 + this.x * size, this.grid.top + size / 2 - 3 + this.y * size, 6, 6);
  }

  if (this.bomb) {
    this.bomb.draw(ctx, this.grid);
  } else if (this.flameTime) {
    this.flameTime--;
    this.grid.drawFlame(ctx, this.x, this.y);
  }
}


var Bomb = function(player, tile) {
  this.x = player.x;
  this.y = player.y;
  this.tile = tile;
  this.time = 125;
  this.explodeSize = player.powers.explodeSize;
}

Bomb.prototype.update = function() {
  // Update the bomb.
  this.time--;
  if (this.time < 0) {
    // Exploding time.
    this.tile.explodeBomb();
    return false;
  }
  return true;
}

Bomb.prototype.draw = function(ctx, grid) {
  var bomb = this;

  var half = grid.size / 2;
  ctx.beginPath();
  ctx.arc(grid.left + half + bomb.x * grid.size, grid.top + half + bomb.y * grid.size, half, 0, 2 * Math.PI, false);
  ctx.fillStyle = 'blue';
  // TODO handle a fuse/timer for the bomb?
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.font = "16px";
  ctx.fillText("" + Math.ceil(bomb.time / 25), grid.left + half - 3 + bomb.x * grid.size, grid.top + half + 3 + bomb.y * grid.size);
}

Flame = function() {

}
Flame.prototype.draw = function() {
}

var Player = function(game, controls) {
  this.game = game;
  this.grid = game.grid;
  this.controls = controls;
  this.color = 'red';
  this.reset();
}

Player.prototype.reset = function() {
  this.x = 1;
  this.y = 1;
  this.powers = {
    'numBombs': 1,
    'explodeSize': 1
  }
}

Player.prototype.update = function() {
  var playerTile = this.grid.getTile(this.x, this.y);

  keys = this.controls.update();

  if (playerTile.flameTime > 0) {
    this.dead = true;
    // For now reset the game and pause?
    this.game.reset();
    this.game.pause = true;
    this.game.pauseMessage = "A bomb got you";
    return;
  }
  if (keys.action1) {
    // Queue up a bomb but don't drop it yet.
    this.dropbomb = true;
  }
  if (this.inactionCount > 0) {
    this.inactionCount--;
    return;
  }
  dx = 0
  dy = 0
  if (keys.up && this.y > 0) {
    dy = -1;
  }
  if (keys.down && this.y < this.grid.height) {
    dy = 1;
  }
  if (keys.left && this.x > 0) {
    dx = -1
  }
  if (keys.right && this.x < this.grid.width) {
    dx = 1
  }
  // Only doing this after inaction means that it takes a little while to drop a bomb?
  if (keys.action1) {
    // TODO check for player bombs, not all bombs.
    // Also exploded bombs shouldn't count.
    // Need to move flames to a seperate list?
    var bombCount = this.game.bombs.length;
    if (bombCount < this.powers.numBombs) {
      if (!playerTile.bomb) {
        // Can't add a bomb where one already exists;
        var bomb = new Bomb(this, playerTile);
        this.game.addBomb(bomb);
        playerTile.addBomb(bomb);
      }
    }
  }
  var t = this.grid.getTile(this.x + dx, this.y + dy);
  if (dx || dy) {
    if (t.solid || t.bomb) {
      // No movement happens
      return;
    }
    if (t.flameTime > 0) {
      // Stepped on a flame, you die.
      this.dead = true;
      // For now reset the game and pause?
      this.game.reset();
      this.game.pause = true;
      this.game.pauseMessage = "Oh no you walked into a flame"
      return;
    }
    this.x += dx;
    this.y += dy;
    this.inactionCount = 8;
    if (t.powerup == 'explodeSize') {
      console.log('explodeSize++');
      this.powers.explodeSize++;
    } else if (t.powerup == 'numBombs') {
      console.log('numBombs++');
      this.powers.numBombs++;
    }
    t.powerup = null;
  }
}

var KeyControls = function(keySettings) {
  this.keys = keySettings;
}

KeyControls.prototype.setTeam = function(team) {
  this.team = team;
  this.player = team.players[0];
}
KeyControls.down = {};

KeyControls.prototype.update = function() {
  var arrows = {
    'up': KeyControls.down[this.keys.up],
    'down': KeyControls.down[this.keys.down],
    'left': KeyControls.down[this.keys.left],
    'right': KeyControls.down[this.keys.right],
    'action1': KeyControls.down[this.keys.action1]
  };
  return arrows;
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

var BombermanGame = function(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');

  this.grid = new Grid();
  this.players = [];
  this.bombs = [];

  this.player1 = new Player(this, new KeyControls({
    left: 37,
    up: 38,
    right: 39,
    down: 40,
    action1: 32,
  }));
  this.players.push(this.player1);
};

BombermanGame.prototype.updateOptions = function(options) {
  this.option = options;
}

BombermanGame.prototype.addBomb = function(b) {
  this.bombs.push(b);
}

BombermanGame.prototype.reset = function() {
  this.bombs = [];
  this.player1.reset();
  this.grid.reset();
}

BombermanGame.prototype.run = function() {
  // Update the game.

  // Using filter means we can remove expired bombs?
  // TODO not optimized as it creates a new list each iteration;
  this.bombs = this.bombs.filter(function(bomb) {
    return bomb.update();
  }, this);

  // Update the players, and also check if any got exploded.
  this.players.forEach(function(player) {
    player.update();
  }, this);

  // Render the game.
  this.ctx.fillStyle = 'black';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  this.ctx.beginPath();
  this.grid.render(this.ctx);
  this.ctx.closePath();

  // Draw players after the bombs.
  this.players.forEach(function(player) {
    this.grid.drawPlayer(this.ctx, player);
  }, this);

  // this.ctx.fillStyle = 'white';
  // this.ctx.font = "30px Arial";
  // this.ctx.fillText(this.leftScore + " - " + this.rightScore, 10, 50);

  if (!this.pause) {
    window.requestAnimationFrame(angular.bind(this, this.run));
  } else {
    this.stopped = true;
    console.log('stopped game');
    if (this.$scope) {
      this.$scope.$apply();
    }
  }
}

function init() {
  // does the shit it has to.
  var canvas = document.createElement('canvas');
  var resizeCanvas = function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, false);

  document.body.appendChild(canvas);
  var game = new BombermanGame(canvas);
  // Start the game pause, but call run once to do an initial render.
  game.pause = true;
  game.run();
  return game;
};


var PauseController = function(game, $scope) {
  this.game = game;
  this.game.$scope = $scope;
  $scope.game = game;
  this.options = {
    acceleration: Player.ACCELERATION,
    friction: Player.FRICTION,
    bounce: Player.BOUNCE_BACK,
    kick_speed: Player.KICK_SPEED,
    ai: true,
  }
  window.addEventListener('blur', function() {
    game.pause = true;
    $scope.$apply();
     //not running full
  }, false);
}

PauseController.prototype.start = function() {
  // game.start???
  this.game.updateOptions(this.options);
  this.game.pause = false;
  this.game.stopped = false;
  // Unset any message.
  this.game.pauseMessage = null;
  this.game.run();
}

angular.module('bomberman', [
  'config',
  'ngRoute'
])
.controller('PauseController', PauseController)
.factory('game', function() {
  return init();
})
.config(function($routeProvider, config) {
  $routeProvider
    .otherwise({
      templateUrl: '/static/bomberman/bomberman.tpl.html',
    });
});

