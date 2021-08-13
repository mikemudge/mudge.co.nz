
var MouseControls = function(game) {
  this.game = game;
  this.map = game.map;
  this.enable();
}

MouseControls.prototype.update = function () {
  // Any math or anything this needs to do?
}

MouseControls.prototype.draw = function (ctx) {
  // Check validity of road location, I.E no placement when the location is occupied.
}

MouseControls.prototype.enable = function () {
  document.addEventListener('mousedown', this.onMouseDown.bind(this));
  document.addEventListener('mouseup', this.onMouseUp.bind(this));
  document.addEventListener('mousemove', this.onMouseMove.bind(this));
  document.addEventListener('mouseout', this.onMouseOut.bind(this));
}

MouseControls.prototype.onMouseOut = function(event) {
}

MouseControls.prototype.onMouseDown = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  this.down = true;
}

MouseControls.prototype.onMouseMove = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  if (event.buttons) {
    // Dragging the mouse.
  }
}

MouseControls.prototype.onMouseUp = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  // Indicates that this was a left click?
  if (event.button === 0) {
  }
}

var GridMap = function(loader) {
  this.gridSize = 40;
  this.width = Math.floor(1000 / this.gridSize);
  this.height = Math.floor(600 / this.gridSize);
  this.map = [];
  for (var y = 0; y < this.height; y++) {
    this.map.push([]);
    for (var x = 0; x < this.width; x++) {
      this.map[y].push(loader(x, y));
    }
  }
}

GridMap.prototype.draw = function(ctx) {
  // Draw a grid.
  ctx.beginPath();
  ctx.strokeStyle = 'white';
  for (y = 0; y < this.height; y++) {
    for (x = 0; x < this.width; x++) {
      ctx.rect(x * this.gridSize, y * this.gridSize, this.gridSize, this.gridSize);
    }
  }
  ctx.stroke();
  ctx.closePath();

  for (y = 0; y < this.height; y++) {
    for (x = 0; x < this.width; x++) {
      this.map[y][x].draw(ctx, x * this.gridSize, y * this.gridSize, this.gridSize);
    }
  }
}

GridMap.prototype.getAt = function(x, y) {
  x = Math.floor(x / this.gridSize);
  y = Math.floor(y / this.gridSize);
  if (y < 0 || y >= this.map.length) {
    return null;
  }
  if (x < 0 || x >= this.map[y].length) {
    return null;
  }
  return this.map[y][x];
}

GridMap.prototype.isEmpty = function(x, y) {
  var loc = this.getAt(x, y);
  if (loc == null) {
    return true;
  }
}

GridMap.prototype.find = function(x, y, condition) {
  // TODO need navigation methods?
  possibles = [
    this.getAt(x + this.gridSize, y),
    this.getAt(x - this.gridSize, y),
    this.getAt(x, y + this.gridSize),
    this.getAt(x, y - this.gridSize),
  ];
  // TODO retain the from location for each searched location for path building?
  visited = new Set();
  while (possibles.length > 0) {
    nextSteps = [];
    for (i=0;i<possibles.length;i++) {
      loc = possibles[i];
      if (visited.has(loc)) {
        // Skip things we've seen before.
        continue;
      }
      visited.add(loc);
      // Check condition.
      res = condition(loc);
      if (res === true) {
        // Win condition, need to return the path to here.
        return loc;
      }
      if (res) {
        // If res is truthy then we can expand through n.
        nextSteps.push(this.getAt(loc.x + this.gridSize, loc.y))
        nextSteps.push(this.getAt(loc.x - this.gridSize, loc.y))
        nextSteps.push(this.getAt(loc.x, loc.y + this.gridSize))
        nextSteps.push(this.getAt(loc.x, loc.y - this.gridSize))
      }
    }
    possibles = nextSteps;
  }
  return null;
}

var Square = function() {
  this.strength = 0;
  this.team = 0;
}

Square.prototype.draw = function(ctx, x, y, size) {
  if (!this.team) {
    return;
  }
  cx = x + size / 2;
  cy = y + size / 2;
  strengthSize =  size / 2 * this.strength / 256;
  ctx.fillStyle = this.team.color;
  ctx.fillRect(cx - strengthSize, cy - strengthSize, strengthSize * 2, strengthSize * 2);
}

var Game = function(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.stopped = false;
  this.pause = false;

  this.map = new GridMap(function(x, y) {
    return new Square();
  });

  this.controls = new MouseControls(this);

  this.loadScenario();
};

Game.prototype.loadScenario = function() {
  home = this.map.getAt(100, 100);
  home.strength = 255;
  home.team = {'color': '#FF0000'};

  home = this.map.getAt(800, 100);
  home.strength = 255;
  home.team = {'color': '#00FF00'};
}

Game.prototype.draw = function() {
  // Clear the screen.
  this.ctx.fillStyle = 'black';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

  this.map.draw(this.ctx);

  this.controls.draw(this.ctx);
}

Game.prototype.update = function() {
  for (y = 0; y < this.map.height; y++) {
    for (x = 0; x < this.map.width; x++) {
      gridSize = this.map.gridSize;
      loc = this.map.getAt(x * gridSize, y * gridSize);
      neighbours = [
        this.map.getAt(x * gridSize - gridSize, y * gridSize),
        this.map.getAt(x * gridSize + gridSize, y * gridSize),
        this.map.getAt(x * gridSize, y * gridSize - gridSize),
        this.map.getAt(x * gridSize, y * gridSize + gridSize),
      ];
      loc.delta = 0;
      if (loc.strength > 0) {
        // Natural growth, so there is always increase in the game (Avoid stalemate situations)
        loc.delta += 1;
      }
      neighbours.forEach(function(n) {
        if (n && n.strength > 127) {
          if (!loc.team || loc.strength < 2) {
            loc.team = n.team;
          }
          if (n.team == loc.team) {
            // With very small chance overflow into a neighbour cell.
            if (Math.random() < .01) {
              loc.delta += n.strength / 10;
            }
          } else {
            // Competing teams, lose strength.
            loc.delta -= n.strength / 500;
          }
        }
      });
    }
  }

  // Delta's are applied after all deltas have been calculated.
  // This avoids the order of updates above impacting the outcome.
  for (y = 0; y < this.map.height; y++) {
    for (x = 0; x < this.map.width; x++) {
      gridSize = this.map.gridSize;
      loc = this.map.getAt(x * gridSize, y * gridSize);
      loc.strength = Math.max(0, Math.min(255, loc.strength + loc.delta));
    }
  }
}

Game.prototype.run = function(time) {
  // Update the game.
  this.controls.update();

  // Update the entire map.
  // TODO this could probably be optimized to track changed tiles only.
  this.update();

  // Render the game.
  this.draw();

  if (!this.pause) {
    window.requestAnimationFrame(this.run.bind(this));
  } else {
    this.stopped = true;
    console.log('stopped game');
  }
}

Game.prototype.resize = function() {
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
  var game = new Game(canvas);
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

angular.module('color_war', [
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
      templateUrl: '/static/shared/game.tpl.html',
    });
});

