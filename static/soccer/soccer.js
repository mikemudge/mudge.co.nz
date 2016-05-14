var Player = function(team, game) {
  this.team = team;
  this.game = game;
  this.radius = 5;
  this.x = (Math.random() * 18 + 1) * game.canvas.width / 20;
  this.y = (Math.random() * 18 + 1) * game.canvas.height / 20;
  this.ang = 0;
  this.vx = 0;
  this.vy = 0;
};
Player.ACCELERATION = 0.25;
Player.FRICTION = 0.25;
Player.BOUNCE_BACK = 0.5;
Player.KICK_SPEED = 2;

MoveController = {};
// Move like you are on ice.
MoveController.move = function(player, keys) {
  if (keys.left) {
    player.vx -= Player.ACCELERATION;
  }
  if (keys.up) {
    player.vy -= Player.ACCELERATION;
  }
  if (keys.right) {
    player.vx += Player.ACCELERATION;
  }
  if (keys.down) {
    player.vy += Player.ACCELERATION;
  }
};
MoveController.TURN_SPEED = 0.04;
// Move like a car.
MoveController.carMove = function(player, keys) {
  if (keys.left) {
    player.ang -= MoveController.TURN_SPEED;
  }
  if (keys.right) {
    player.ang += MoveController.TURN_SPEED;
  }
  if (keys.up) {
    player.vx += Math.sin(player.ang) * Player.ACCELERATION;
    player.vy -= Math.cos(player.ang) * Player.ACCELERATION;
  }
  if (keys.down) {
    player.vx -= Math.sin(player.ang) * Player.ACCELERATION;
    player.vy += Math.cos(player.ang) * Player.ACCELERATION;
  }
};

Player.prototype.updatePosition = function() {
  this.x += this.vx;
  this.y += this.vy;

  // Slow down;
  this.vx *= (1 - 0.2 * Player.FRICTION);
  this.vy *= (1 - 0.2 * Player.FRICTION);
  if (this.vx < 0.01 && this.vx > -0.01) {
    this.vx = 0;
  }
  if (this.vy < 0.01 && this.vy > -0.01) {
    this.vy = 0;
  }
}

Player.prototype.update = function() {
  this.updatePosition();

  // crash?
  if (this.x - this.radius < this.game.field.left && this.vx < 0) {
    this.vx *= -Player.BOUNCE_BACK;
  }
  if (this.x + this.radius > this.game.field.left + this.game.field.width && this.vx > 0) {
    this.vx *= -Player.BOUNCE_BACK;
  }
  if (this.y - this.radius < this.game.field.top && this.vy < 0) {
    this.vy *= -Player.BOUNCE_BACK;
  }
  if (this.y + this.radius > this.game.field.top + this.game.field.height && this.vy > 0) {
    this.vy *= -Player.BOUNCE_BACK;
  }

  if (this.x - this.game.ball.x < this.radius + this.game.ball.radius &&
      this.x - this.game.ball.x > -this.radius - this.game.ball.radius &&
      this.y - this.game.ball.y < this.radius + this.game.ball.radius &&
      this.y - this.game.ball.y > -this.radius - this.game.ball.radius) {
    // Kick physics?
    this.game.ball.vx *= 0.8;
    this.game.ball.vy *= 0.8;
    this.game.ball.vx += this.vx * Player.KICK_SPEED;
    this.game.ball.vy += this.vy * Player.KICK_SPEED;

    // slow down when you kick the ball.
    this.vx *= -Player.BOUNCE_BACK;
    this.vy *= -Player.BOUNCE_BACK;
  }
}

Player.prototype.draw = function(ctx) {
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = this.team.color;
  ctx.fill();
  ctx.lineWidth = 0;
  ctx.beginPath();
  ctx.moveTo(this.x, this.y);
  ctx.lineTo(this.x + Math.sin(this.ang) * 10, this.y - Math.cos(this.ang) * 10);
  ctx.strokeStyle = this.team.color;
  ctx.stroke();
}

var Team = function(color, game) {
  this.color = color;

  this.players = [];
  this.players.push(new Player(this, game));
};

Team.prototype.setControl = function(control) {
  this.control = control;
  control.setTeam(this);
}

Team.prototype.update = function() {
  if (this.control) {
    this.control.update();
  }
  this.players.forEach(function(player) {
    player.update();
  });
}

var Field = function(params) {
  this.lineColor = '#FFFFFF';
  this.width = params.width;
  this.height = params.height;
  this.left = params.left;
  this.top = params.top;
}

Field.prototype.draw = function(ctx) {
  // Draw Field
  ctx.strokeStyle = this.lineColor;
  ctx.lineWidth = 1;
  ctx.rect(this.left, this.top, this.width, this.height);
  ctx.stroke();
}

var Ball = function(field, params) {
  this.field = field;
  this.x = params.x || 50;
  this.y = params.y || 50;
  this.vx = 0;
  this.vy = 0;
  this.radius = params.radius || 10;
}
Ball.BOUNCE_BACK = 0.8;
Ball.FRICTION = 0.1;

Ball.prototype.update = function() {
  this.x += this.vx;
  this.y += this.vy;

  // Slow down;
  this.vx *= (1 - 0.2 * Ball.FRICTION);
  this.vy *= (1 - 0.2 * Ball.FRICTION);
  if (this.vx < 0.01 && this.vx > -0.01) {
    this.vx = 0;
  }
  if (this.vy < 0.01 && this.vy > -0.01) {
    this.vy = 0;
  }

  // crash?
  if (this.x - this.radius < this.field.left && this.vx < 0) {
    this.vx *= -Ball.BOUNCE_BACK;
  }
  if (this.x + this.radius > this.field.left + this.field.width && this.vx > 0) {
    this.vx *= -Ball.BOUNCE_BACK;
  }
  if (this.y - this.radius < this.field.top && this.vy < 0) {
    this.vy *= -Ball.BOUNCE_BACK;
  }
  if (this.y + this.radius > this.field.top + this.field.height && this.vy > 0) {
    this.vy *= -Ball.BOUNCE_BACK;
  }
}

Ball.prototype.draw = function(ctx) {
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = 'green';
  ctx.fill();
  ctx.lineWidth = 0;
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
  if (!this.player) {
    console.log('no play selected for key controls');
  }
  arrows = {
    'up': KeyControls.down[this.keys.up],
    'down': KeyControls.down[this.keys.down],
    'left': KeyControls.down[this.keys.left],
    'right': KeyControls.down[this.keys.right]
  };
  MoveController.carMove(this.player, arrows);
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

var SoccerGame = function(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');

  this.field = new Field({
    left: this.canvas.width / 20,
    width: this.canvas.width * 18 / 20,
    top: this.canvas.height / 20,
    height: this.canvas.height * 18 / 20
  });

  this.ball = new Ball(this.field, {
    x: canvas.width / 2,
    y: canvas.height / 2
  });

  this.leftTeam = new Team('red', this);
  this.leftTeam.setControl(new KeyControls({
    left: 37,
    up: 38,
    right: 39,
    down: 40
  }));
  this.rightTeam = new Team('#8080FF', this);
  this.rightTeam.setControl(new KeyControls({
    left: 65,
    up: 87,
    right: 68,
    down: 83
  }));
  // Add controls for each team??
};

SoccerGame.prototype.run = function() {
  // Update the game.
  this.leftTeam.update();
  this.rightTeam.update();
  this.ball.update();

  // Render the game.
  this.ctx.clearColour = '#000000';
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  this.ctx.beginPath();
  this.field.draw(this.ctx);
  this.ctx.closePath();

  this.ctx.beginPath();
  this.ball.draw(this.ctx);
  this.ctx.closePath();

  this.leftTeam.players.forEach(function(player) {
    player.draw(this.ctx);
  }, this);
  this.rightTeam.players.forEach(function(player) {
    player.draw(this.ctx);
  }, this);

  if (!this.pause) {
    window.requestAnimationFrame(angular.bind(this, this.run));
  } else {
    this.stopped = true;
    console.log('stopped game');
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
  var game = new SoccerGame(canvas);
  game.run();
  return game;
};


var PauseController = function(game, $scope) {
  this.game = game;
  $scope.game = game;
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

angular.module('soccer', ['config', 'ngRoute'])
    .controller('PauseController', PauseController)
    .factory('game', function() {
      return init();
    })
    .config(function($routeProvider, config) {
      $routeProvider
        .otherwise({
          templateUrl: config.basePath + 'soccer/soccer.html',
        });
    })