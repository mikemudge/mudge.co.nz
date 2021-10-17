
var World = function(params) {
  this.lineColor = '#FFFFFF';
  this.width = params.width;
  this.height = params.height;
  this.left = params.left;
  this.top = params.top;
}

World.prototype.draw = function(ctx) {
  // Draw Field
  ctx.strokeStyle = this.lineColor;
  ctx.lineWidth = 1;
  ctx.rect(this.left, this.top, this.width, this.height);
  ctx.stroke();
}

var Car = function(world, params) {
  this.world = world;
  this.x = params.x || 50;
  this.y = params.y || 50;
  this.vx = 0;
  this.vy = 0;
  this.radius = params.radius || 12;
  this.speed = Math.random() * 2 + 1;
}
Car.FRICTION = 0.1;

Car.prototype.update = function() {
  this.x += this.vx;
  this.y += this.vy;

  if (this.vx < this.speed * .95) {
    this.vx += Math.random();
  } else if (this.vx > this.speed * 1.05) {
    this.vx -= Math.random();
  }

  // Slow down;
  this.vx *= (1 - Car.FRICTION);
  this.vy *= (1 - Car.FRICTION);
  if (this.vx < 0.01 && this.vx > -0.01) {
    this.vx = 0;
  }
  if (this.vy < 0.01 && this.vy > -0.01) {
    this.vy = 0;
  }

  // TODO slow down if there is a car too close in front?

  this.followingDistance = null;
  this.world.cars.forEach(function(c) {
    if (c == this) {
      // Skip interactions with yourself.
      return;
    }
    disy = Math.abs(c.y - this.y);
    if (disy < 12) {
      dis = c.x - this.x;
      if (dis > 0 && dis < 50) {
        // You are considered to be following if you are within 50 pixels of a car.
        this.followingDistance = dis
        // Figure out my speed delta to theirs.
        if (this.vx > c.vx) {
          // I'm faster than them, so need to slow.
          // This is a very drastic braking to 50% of your speed.
          this.vx *= 0.5
        }
      }
    }
  }.bind(this));
}

Car.prototype.draw = function(ctx) {
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false);
  if (this.followingDistance) {
    // Show red to indicate braking.
    ctx.fillStyle = 'red';
  } else {
    ctx.fillStyle = 'green';
  }
  ctx.fill();
  ctx.lineWidth = 0;
}

var CarSpawn = function(world, y) {
  this.world = world;
  this.spawnRate = 100;
  this.y = y;
  // Start with a new car ready to go.
  this.time = this.spawnRate;
}

CarSpawn.prototype.update = function() {
  this.time++
  if (this.time > this.spawnRate) {
    this.time = 0;
    console.log("Spawn");
    this.world.cars.push(new Car(this.world, {
      x: this.world.left, 
      y: this.y
    }));
  }
}

CarSpawn.prototype.draw = function() {
}

var Game = function(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.stopped = false;
  this.pause = false;

  this.world = new World({
    left: this.canvas.width / 20,
    width: this.canvas.width * 18 / 20,
    top: this.canvas.height / 20,
    height: this.canvas.height * 18 / 20,
  });
  this.world.cars = [];

  this.world.cars.push(new CarSpawn(this.world, 100));
  this.world.cars.push(new CarSpawn(this.world, 200));
  this.world.cars.push(new CarSpawn(this.world, 300));
};

Game.prototype.update = function() {
  this.world.cars.forEach(function(c) {
    c.update();
  });

  // Remove cars which reach the far edge.
  this.world.cars = this.world.cars.filter(function(c) {
    return !c.x || c.x < this.world.left + this.world.width;
  }.bind(this));
};

Game.prototype.draw = function() {
  // Render the game.
  this.ctx.fillStyle = 'black';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  this.ctx.beginPath();

  this.world.draw(this.ctx);
  this.ctx.closePath();

  this.ctx.beginPath();
  this.world.cars.forEach(function(c) {
    c.draw(this.ctx);
  }.bind(this));
  this.ctx.closePath();

  // Overlay
  this.ctx.beginPath();
  this.ctx.font = 'normal 16px serif';
  this.ctx.fillStyle = 'white';
  this.ctx.fillText("Num players: " + this.world.cars.length, 5, 15);
  this.ctx.closePath();
}

Game.prototype.run = function() {
  // Update the game.
  this.update();

  this.draw();

  if (!this.pause) {
    window.requestAnimationFrame(this.run.bind(this));
  } else {
    this.stopped = true;
    console.log('stopped game');
  }
}

var PauseController = function(game, $scope) {
  this.game = game;
  $scope.game = game;
  // game.pause = true;
  window.addEventListener('blur', function() {
    game.pause = true;
    $scope.$apply();
     //not running full
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
  var resizeCanvas = function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, false);

  document.body.appendChild(canvas);
  var game = new Game(canvas);
  game.run();
  return game;
};

angular.module('congestion', [
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
      templateUrl: '/static/congestion/congestion.tpl.html',
    });
});

