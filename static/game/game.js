var Creature = function(game, spawner, params) {
  this.game = game;
  this.health = params.health || 100;
  this.maxHealth = this.health;
  this.x = params.x || 50;
  this.y = params.y || 50;
  this.vx = 0;
  this.vy = 0;
  this.radius = params.radius || 10;
  this.speed = params.speed || Math.random() + 0.5;
  this.spawner = spawner;
  this.currentTarget = 1;
  this.target = this.spawner.target[this.currentTarget];
}

Creature.prototype.update = function() {
  x = Math.floor(this.x / this.game.gridSize);
  y = Math.floor(this.y / this.game.gridSize);
  dir = this.spawner.grid[this.currentTarget][y][x];

  if (dir == "U") {
    this.y -= this.speed;
  } else if (dir == "D") {
    this.y += this.speed;
  } else if (dir == "L") {
    this.x -= this.speed;
  } else if (dir == "R") {
    this.x += this.speed;
  }

  var disSqr = Math.pow(this.target.x - this.x, 2) + Math.pow(this.target.y - this.y, 2);
  if (disSqr < 400) {
    this.currentTarget++;
    if (this.currentTarget >= this.spawner.target.length) {
      // This is finished.
      // Need to remove from the map and cost a life.
      this.health = 0;
    } else {
      this.target = this.spawner.target[this.currentTarget];
    }
  }
}

Creature.prototype.draw = function(ctx) {
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false);
  str = 255 * this.health / this.maxHealth;
  ctx.fillStyle = 'rgb(0, ' + Math.floor(str) + ',0)';
  ctx.fill();
}

var AutoSpawn = function(game) {
  this.game = game;
  this.health = 1;
  this.counter = 0;
  this.x = 100;
  this.y = 100;
  this.radius = 20;

  // The default game size is 600x1000 so these are in 5 * 20 from each edge.
  this.target = [
    {x: 100, y: 100},
    {x: 100, y: 500},
    {x: 900, y: 500},
    {x: 900, y: 100}
  ];
  // this.showPath = true;
  this.waves = [];
  this.waves.push({
    count: 10,
    spawnRate: 100,
    params: {health: 100, armour: 0}
  });
  // A quick wave with less but stonger units.
  this.waves.push({
    count: 5,
    spawnRate: 5,
    params: {health: 100, armour: 2, speed: 3}
  });
  this.setWave(0);
}

AutoSpawn.prototype.setWave = function(wave) {

  // This does infinite play looping through the waves.
  wave = wave % this.waves.length;

  console.log("Starting wave", this.currentWave);
  this.currentWave = wave;
  this.currentWaveProgress = 0;
  this.spawnCount = 0;
  this.wave = this.waves[this.currentWave];
}

AutoSpawn.prototype.updateWave = function() {
  if (this.spawnCount < this.wave.count) {
    this.currentWaveProgress++;
    if (this.currentWaveProgress % this.wave.spawnRate == 0) {
      var spawn = new Creature(this.game, this, this.wave.params);
      spawn.x = this.x - this.radius + 2 * this.radius * Math.random(); 
      spawn.y = this.y - this.radius + 2 * this.radius * Math.random(); 
      this.game.creatures.push(spawn);
      this.spawnCount++;
    }
  } else {
    // Check if wave is complete before moving to the next one?
    this.currentWaveProgress++;
    waveSpawnTime = this.wave.spawnRate * this.wave.count;
    if (this.currentWaveProgress >= waveSpawnTime + 600) {
      this.setWave(this.currentWave + 1);
    }
  }
}

AutoSpawn.prototype.update = function() {
  this.updateWave();

  if (!this.grid || this.game.mapVersion > this.pathVersion) {
    console.log("Updated paths");
    this.recalculatePaths();
    this.pathVersion = this.game.mapVersion;
  }
}

AutoSpawn.prototype.recalculatePaths = function() {
  this.grid = [[]];
  for (var i = 1; i < this.target.length; i++) {
      this.grid.push([]);
    for (var y = 0; y < 30; y++) {
      this.grid[i].push([]);
      for (var x = 0; x < 50; x++) {
        this.grid[i][y].push(0);
      }
    }

    // How to get to the target from everywhere?
    var tx = Math.floor(this.target[i].x / this.game.gridSize);
    var ty = Math.floor(this.target[i].y / this.game.gridSize);

    var reachable  = [{x: tx, y: ty, dis: 0}];
    for(var ii = 0; ii < reachable.length; ii++) {
      var next = reachable[ii];
      this.consider(next.x, next.y - 1, next.dis + 1, reachable, this.grid[i], "D");
      this.consider(next.x + 1, next.y, next.dis + 1, reachable, this.grid[i], "L");
      this.consider(next.x, next.y + 1, next.dis + 1, reachable, this.grid[i], "U");
      this.consider(next.x - 1, next.y, next.dis + 1, reachable, this.grid[i], "R");
    }
  }

  // This is the number of grid locations which can reach the target.
  console.log("Number of locations which can get home", reachable.length);
}

AutoSpawn.prototype.consider = function(x, y, dis, reachable, grid, dir) {
  if (x < 0 || y < 0) {
    return;
  }
  if (x >= 50 || y >= 30) {
    return;
  }
  if (this.game.map[y][x]) {
    // This square is already occupied.
    return;
  }
  if (grid[y][x] != 0) {
    // Can be reached already.
    return;
  }
  // Add it.
  grid[y][x] = dir;
  reachable.push({x: x, y: y, dis: dis});
}

AutoSpawn.prototype.draw = function(ctx) {
  ctx.beginPath();
  ctx.strokeStyle = 'rgb(255, 0, 0)';
  ctx.rect(this.x - this.radius + 1, this.y - this.radius + 1, this.radius * 2 - 2, this.radius * 2 - 2);
  ctx.stroke();

  if (this.showPath) {
    for (i = 0; i < this.target.length; i++) {
      x = this.target[i].x;
      y = this.target[i].y;
      ctx.beginPath();
      ctx.strokeStyle = 'rgb(255, 0, 0)';
      ctx.rect(x - this.radius + 1, y - this.radius + 1, this.radius * 2 - 2, this.radius * 2 - 2);
      // And number it.
      ctx.stroke();
      ctx.font = 'normal 36px serif';
      ctx.fillStyle = 'white';
      ctx.fillText("" + i, x - 9, y + 12);
    }

    ctx.font = 'normal 16px serif';
    ctx.fillStyle = 'grey';
    var currentTarget = 1;
    for (var y = 0; y < 30; y++) {
      for (var x = 0; x < 50; x++) {
        ctx.fillText("" + this.grid[currentTarget][y][x], x * this.game.gridSize + 6, y * this.game.gridSize + 15);
      }
    }
  }
}

var Shot = function(game, target, tower) {
  this.game = game;
  this.tower = tower;
  this.x = tower.x;
  this.y = tower.y;
  this.damage = tower.damage || 5;
  this.radius = 2;
  this.speed = Math.random() * 3 + 4;
  this.target = target;
}

Shot.prototype.update = function() {
  var dx = this.target.x - this.x;
  var dy = this.target.y - this.y;
  var dis = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));

  this.x += dx * this.speed / dis
  this.y += dy * this.speed / dis

  if (this.target.health <= 0) {
    // Target is already dead. Just remove the shot?
    this.health = 0;
  } else if (dis < 5) {
    this.health = 0;
    var damage = this.damage - (this.target.armour || 0)
    // Will always do 1 damage.
    damage = Math.max(damage, 1);
    this.target.health -= damage;
    if (this.target.health <= 0) {
      // Got a kill
      this.tower.player.money += 5;
    }
    // This is finished.
    // Need to remove from the map and cost a life.
  }
}

Shot.prototype.draw = function(ctx) {
  ctx.beginPath();
  str = 255 * this.health / 100;
  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false);
  ctx.fill();
}

var Tower = function(game, player) {
  this.game = game;
  this.player = player;
  this.x = 100;
  this.y = 100;
  this.health = 1;
  this.damage = 5;
  this.radius = 20;
  this.range = 100;
  // this.showRange = true;
  this.opacity = 0.5;
  this.cooldown = 10;
}

Tower.prototype.update = function() {
  if (this.cooldown > 0) {
    this.cooldown--;
  }

  // TODO shoot something.
  if (this.target) {
    // Check still in range?
    if (this.target.health <= 0) {
      this.target = null;
    } else if (this.target.x > this.x + 100) {
      this.target = null;
    } else if (this.target.y > this.y + 100) {
      this.target = null;
    }
  }
  if (this.cooldown == 0 && !this.target) {
    // TODO find a new target better.
    this.game.creatures.find(function(c) {
      if (c.constructor == Creature) {
        var dx = c.x - this.x;
        var dy = c.y - this.y;
        var dis = Math.pow(dx, 2) + Math.pow(dy, 2);
        if (dis < this.range * this.range) {
          this.target = c;
          return true;
        }
      }
    }.bind(this));
  }

  if (this.cooldown == 0 && this.target) {
    // Shoot at the target
    this.game.creatures.push(new Shot(this.game, this.target, this));
    this.cooldown = 50;
  }
}

Tower.prototype.draw = function(ctx) {
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255, 0, 0, ' + this.opacity + ')';
  ctx.rect(this.x + 2, this.y + 2, this.radius * 2 - 4, this.radius * 2 - 4);
  ctx.fill();

  if (this.showRange) {
    ctx.beginPath();
    ctx.strokeStyle = 'orange';
    ctx.arc(this.x + this.radius, this.y + this.radius, this.range, 0, 2 * Math.PI, false);
    ctx.stroke();
  }
}

var TowerPlayer = function(game) {
  this.game = game;
  this.health = 200;
  this.money = 150;
  this.debug = true;
  this.towerPlacer = new Tower(game, this);
  this.setupMouseListeners();
}
TowerPlayer.prototype.placeTower = function(event) {
  if (this.money >= 10) {
    this.money -= 10;
  } else {
    this.game.warn("Can't afford that");
    return false;
  }
  this.towerPlacer.opacity = 1;
  x = this.towerPlacer.x / this.game.gridSize;
  y = this.towerPlacer.y / this.game.gridSize;

  // Make sure the map knows these places are occupied.
  this.game.map[y][x] = this.towerPlacer;
  this.game.map[y][x + 1] = this.towerPlacer;
  this.game.map[y + 1][x] = this.towerPlacer;
  this.game.map[y + 1][x + 1] = this.towerPlacer;

  this.game.creatures.push(this.towerPlacer);
  this.game.mapVersion++;

  // TODO this should probably happen elsewhere.
  this.towerPlacer = new Tower(this.game, this);
  this.towerPlacer.x = this.mX;
  this.towerPlacer.y = this.my;
}

TowerPlayer.prototype.mouseUp = function(event) {
  this.mouseDown = false;
  this.mX = event.clientX;
  this.mY = event.clientY;
  this.placeTower();
}

TowerPlayer.prototype.mouseDown = function(event) {
  this.mouseDown = true;
  this.mX = event.clientX;
  this.mY = event.clientY;
}

TowerPlayer.prototype.mouseMove = function(event) {
  this.mX = event.clientX;
  this.mY = event.clientY;
  if (this.towerPlacer) {
    this.towerPlacer.x = (Math.round(this.mX / this.game.gridSize) - 1) * this.game.gridSize;
    this.towerPlacer.y = (Math.round(this.mY / this.game.gridSize) - 1) * this.game.gridSize;
  }
}


TowerPlayer.prototype.setupMouseListeners = function() {
  window.addEventListener('mouseup', this.mouseUp.bind(this));
  window.addEventListener('mousedown', this.mouseDown.bind(this));
  window.addEventListener('mousemove', this.mouseMove.bind(this));
}

TowerPlayer.prototype.update = function() {
  // Apply any actions, check mouse/key commands.
}

TowerPlayer.prototype.draw = function(ctx) {
  if (this.debug) {
    ctx.font = 'normal 16px serif';
    ctx.fillStyle = 'white';
    ctx.fillText("TowerPlayer $" + this.money, 5, 15);
    // TODO print debug info?
    // Display overlay stuff?
  }

  if (this.towerPlacer) {
    // Draw the tower which is currently being placed.
    // TODO can we modify the color to show this is placem
    this.towerPlacer.draw(ctx);
  }
}

var TDGame = function(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.stopped = false;
  this.pause = false;
  this.gridSize = 20;
  this.mapVersion = 0;

  this.map = [];
  for (var y = 0; y < 30; y++) {
    this.map.push([]);
    for (var x = 0; x < 50; x++) {
      this.map[y].push(null);
    }
  }

  this.creatures = [];

  this.creatures.push(new AutoSpawn(this));
  this.creatures.push(new TowerPlayer(this));
};

TDGame.prototype.warn = function(msg) {
  // TODO add some in game messaging.
  console.log(msg);
}

TDGame.prototype.run = function() {
  // Update the game.
  this.creatures.forEach(function(c) {
    c.update();
  });
  this.creatures = this.creatures.filter(function(c) {
    if (c.health === 0 || c.health < 0) {
      return false;
    }
    return true;
  });
  
  this.ctx.beginPath();

  // Render the game.
  this.ctx.fillStyle = 'black';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  this.ctx.closePath();

  this.ctx.beginPath();
  this.ctx.strokeStyle = 'white';
  for (y = 0; y < 30; y++) {
    for (x = 0; x < 50; x++) {
      this.ctx.rect(x * this.gridSize, y * this.gridSize, this.gridSize, this.gridSize);
    }
  }
  this.ctx.stroke();

  this.creatures.forEach(function(c) {
    c.draw(this.ctx);
  }.bind(this));

  if (!this.pause) {
    window.requestAnimationFrame(this.run.bind(this));
  } else {
    this.stopped = true;
    console.log('stopped game');
  }
}

TDGame.prototype.resize = function() {
  // TODO the bounds of the game just changed?
  // This should just be a window into the game, and not update the game size if resize happens.
  this.width = this.canvas.width;
  this.height = this.canvas.height;
}

var PauseController = function(game, $scope) {
  this.game = game;
  $scope.game = game;
  window.addEventListener('blur', function() {
    game.pause = true;
    $scope.$apply();
    // not running full
  }, false);
}

PauseController.prototype.start = function() {
  // game.start???
  this.game.pause = false;
  this.game.stopped = false;
  this.game.run();
}

function init() {
  var canvas = document.createElement('canvas');

  document.body.appendChild(canvas);
  var game = new TDGame(canvas);
  var resizeCanvas = function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    game.resize();
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, false);
  game.run();
  return game;
};

angular.module('game', [
  'config',
  'ngRoute'
])
.factory('game', function() {
  return init();
})
.controller('PauseController', PauseController)
.config(function($routeProvider, config) {
  $routeProvider
    .otherwise({
      templateUrl: '/static/game/game.tpl.html',
    });
});

