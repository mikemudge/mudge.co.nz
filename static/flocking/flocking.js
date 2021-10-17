
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
  this.radius = params.radius || 12;
  this.speed = Math.random() * 4 + 2;
  this.theta = Math.random() * Math.PI;
  this.thetaDelta = 0;
}

Car.prototype.update = function() {
  this.x += this.speed * Math.sin(this.theta);
  this.y += this.speed * Math.cos(this.theta);

  // TODO adjust angle to avoid collision with boundries.
  // At the moment we just randomly change our angular velocity.
  if (Math.random() > 0.5) {
    this.thetaDelta += 0.01;
  } else {
    this.thetaDelta -= 0.01;
  }
  this.theta += this.thetaDelta;

  // TODO adjust speed and angle to be more similar to things near you.
  this.followingDistance = null;
  this.world.cars.forEach(function(c) {
    if (c == this) {
      // Skip interactions with yourself.
      return;
    }
  }.bind(this));
}

Car.prototype.draw = function(ctx) {
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = 'green';
  ctx.fill();

  // Show direction by drawing a line.
  ctx.beginPath();
  ctx.moveTo(this.x, this.y);
  ctx.lineTo(this.x + Math.sin(this.theta), this.y + Math.cos(this.theta));
  ctx.stroke();

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
  for (i = 0; i < 10; i++) {
    this.world.cars.push(new Car(this.world, {
      x: Math.random() * this.world.width + this.world.left,
      y: Math.random() * this.world.height + this.world.top,
    }))
  }
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

angular.module('flocking', [
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
      templateUrl: '/static/flocking/flocking.tpl.html',
    });
});
