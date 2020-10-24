
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

var Creature = function(world, params) {
  this.world = world;
  this.health = 100;
  this.x = params.x || 50;
  this.y = params.y || 50;
  this.vx = 0;
  this.vy = 0;
  this.radius = params.radius || 20;
  this.speed = Math.random() + 0.5;
}
Creature.BOUNCE_BACK = 0.8;
Creature.FRICTION = 0.1;

Creature.prototype.update = function() {
  this.x += this.vx;
  this.y += this.vy;
  this.vx += this.speed * (Math.random() - 0.5);
  this.vy += this.speed * (Math.random() - 0.5);

  // Slow down;
  this.vx *= (1 - 0.2 * Creature.FRICTION);
  this.vy *= (1 - 0.2 * Creature.FRICTION);
  if (this.vx < 0.01 && this.vx > -0.01) {
    this.vx = 0;
  }
  if (this.vy < 0.01 && this.vy > -0.01) {
    this.vy = 0;
  }

  // crash?
  if (this.x - this.radius < this.world.left && this.vx < 0) {
    this.vx *= -Creature.BOUNCE_BACK;
  }
  if (this.x + this.radius > this.world.left + this.world.width && this.vx > 0) {
    this.vx *= -Creature.BOUNCE_BACK;
  }
  if (this.y - this.radius < this.world.top && this.vy < 0) {
    this.vy *= -Creature.BOUNCE_BACK;
  }
  if (this.y + this.radius > this.world.top + this.world.height && this.vy > 0) {
    this.vy *= -Creature.BOUNCE_BACK;
  }

  this.world.creatures.forEach(function(c) {
    if (c == this) {
      // Skip interactions with yourself.
      return;
    }
    disSqr = Math.pow(c.x - this.x, 2) + Math.pow(c.y - this.y, 2);
    // instead of calculating the sqrt, just use 50 * 50 here.
    if (disSqr < 2500) {
      // TODO interact with creatures near you.
      c.health -= 10;
      if (c.health == 0) {
        // I killed it.
        // Full heal.
        this.health = 100;
        this.foodLevel = 100;
      }
      // Change velocity based on where the close creature is.
      this.vx = 0.1 * (this.x - c.x)
      this.vy = 0.1 * (this.y - c.y)
    }
  }.bind(this));
}

Creature.prototype.draw = function(ctx) {
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false);
  str = 255 * this.health / 100;
  ctx.fillStyle = 'rgb(0, ' + Math.floor(str) + ',0)';
  ctx.fill();
  ctx.lineWidth = 0;
}

var SoccerGame = function(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.stopped = false;
  this.pause = false;

  this.creatures = [];
  this.world = new World({
    left: this.canvas.width / 20,
    width: this.canvas.width * 18 / 20,
    top: this.canvas.height / 20,
    height: this.canvas.height * 18 / 20,
  });
  this.world.creatures = this.creatures;

  for (var i=0;i<10;i++) {
    this.creatures.push(new Creature(this.world, {
      x: canvas.width * Math.random(),
      y: canvas.height * Math.random()
    }));
  }
};

SoccerGame.prototype.run = function() {
  // Update the game.
  this.creatures.forEach(function(c) {
    c.update();
  });

  // Remove dead creatures.
  this.creatures = this.creatures.filter(function(c) {
    return c.health > 0;
  });
  this.world.creatures = this.creatures;

  // Render the game.
  this.ctx.fillStyle = 'black';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  this.ctx.beginPath();
  this.world.draw(this.ctx);
  this.ctx.closePath();

  this.ctx.beginPath();
  this.creatures.forEach(function(c) {
    c.draw(this.ctx);
  }.bind(this));

  this.ctx.font = 'normal 16px serif';
  this.ctx.fillStyle = 'white';
  this.ctx.fillText("Num players: " + this.creatures.length, 5, 15);

  this.ctx.closePath();

  if (!this.pause) {
    window.requestAnimationFrame(angular.bind(this, this.run));
  } else {
    this.stopped = true;
    console.log('stopped game');
  }
}

var PauseController = function(game, $scope) {
  this.game = game;
  $scope.game = game;
  game.pause = true;
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
  var game = new SoccerGame(canvas);
  game.run();
  return game;
};

angular.module('predator', [
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
      templateUrl: '/static/predator/predator.tpl.html',
    });
});

