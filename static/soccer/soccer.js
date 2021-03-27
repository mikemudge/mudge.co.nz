// TODO's
/*
  Crash into other players?
  Set game win condition with rematch/pausing at the end.
  Change sizes/mass/bounciness/friction etc.
  Allow different movement controls.
  Add support for touch/mobile devices.
*/

var Player = function(team, game) {
  this.team = team;
  this.game = game;
  this.radius = 10;
  this.line_length = this.radius * 1.8;
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

var MoveController = {};
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

MoveController.TURN_SPEED = 0.08;

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
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(this.x, this.y);
  ctx.lineTo(this.x + Math.sin(this.ang) * this.line_length, this.y - Math.cos(this.ang) * this.line_length);
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

  this.halfGoalWidth = params.halfGoalWidth || 64;
  this.goalTop = this.top + this.height / 2 - this.halfGoalWidth;
  this.goalBottom = this.top + this.height / 2 + this.halfGoalWidth;
}

Field.prototype.draw = function(ctx) {
  // Draw Field
  ctx.strokeStyle = this.lineColor;
  ctx.lineWidth = 1;
  goalDepth = this.halfGoalWidth;
  ctx.rect(this.left, this.top, this.width, this.height);
  ctx.rect(this.left - goalDepth, this.goalTop, goalDepth, this.halfGoalWidth * 2);
  ctx.rect(this.left + this.width, this.goalTop, goalDepth, this.halfGoalWidth * 2);
  ctx.stroke();
}

Field.prototype.collide = function(obj) {
  if (obj.y - obj.radius < this.top && obj.vy < 0) {
    obj.vy *= -Ball.BOUNCE_BACK;
  }
  if (obj.y + obj.radius > this.top + this.height && obj.vy > 0) {
    obj.vy *= -Ball.BOUNCE_BACK;
  }
  if (obj.y > this.goalTop && obj.y < this.goalBottom) {
    // No bouncing happens if the ball is in the goal space.
    // TODO should radius be used for this?
    return;
  }
  if (obj.x - obj.radius < this.left && obj.vx < 0) {
    obj.vx *= -Ball.BOUNCE_BACK;
  }
  if (obj.x + obj.radius > this.left + this.width && obj.vx > 0) {
    obj.vx *= -Ball.BOUNCE_BACK;
  }
}

Field.prototype.inGoal = function(x, y) {
  if (y < this.goalTop || y > this.goalBottom) {
    return false;
  }
  if (x < this.left || x > this.left + this.width) {
    return true;
  }
}

var Ball = function(field, params) {
  this.field = field;
  this.x = params.x || 50;
  this.y = params.y || 50;
  this.vx = 0;
  this.vy = 0;
  this.radius = params.radius || 20;
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
  this.field.collide(this);
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
  var arrows = {
    'up': KeyControls.down[this.keys.up],
    'down': KeyControls.down[this.keys.down],
    'left': KeyControls.down[this.keys.left],
    'right': KeyControls.down[this.keys.right]
  };
  MoveController.move(this.player, arrows);
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

var AIControls = function(game) {
  this.game = game;
}

AIControls.prototype.setTeam = function(team) {
  this.team = team;
  this.player = team.players[0];
}

AIControls.prototype.update = function() {
  if (!AIControls.enabled) {
    return;
  }
  var b = this.game.ball;
  dx = b.x - this.player.x;
  dy = b.y - this.player.y;
  // Speed is a fraction of the distance remaining?
  // TODO this is made up, probably can be calculated (PID)?
  // Currently does make the player chase the ball around quite nicely.
  // However vx and vy are too independent, which means the ball is always hit at 90 degrees.
  dvx = .8 * dx;
  dvy = .8 * dy;
  if (this.player.vx < dvx) {
    this.player.vx += Player.ACCELERATION;
  } else if (this.player.vx > dvx) {
    this.player.vx -= Player.ACCELERATION;
  }
  if (this.player.vy < dvy) {
    this.player.vy += Player.ACCELERATION;
  } else if (this.player.vy > dvy) {
    this.player.vy -= Player.ACCELERATION;
  }
}

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

  // Init the score to 0 - 0
  this.leftScore = 0;
  this.rightScore = 0;

  this.leftTeam = new Team('red', this);
  this.leftTeam.setControl(new KeyControls({
    left: 37,
    up: 38,
    right: 39,
    down: 40
  }));
  this.rightTeam = new Team('#8080FF', this);
  // this.rightTeam.setControl(new KeyControls({
  //   left: 65,
  //   up: 87,
  //   right: 68,
  //   down: 83
  // }));
  this.rightTeam.setControl(new AIControls(this));
  // Add controls for each team??
};

SoccerGame.prototype.updateOptions = function(options) {
  this.option = options;
  // This is bad.
  Player.ACCELERATION = options.acceleration;
  Player.FRICTION = options.friction;
  Player.BOUNCE_BACK = options.bounce;
  Player.KICK_SPEED = options.kick_speed;
  AIControls.enabled = options.ai;
}

SoccerGame.prototype.run = function() {
  // Update the game.
  this.leftTeam.update();
  this.rightTeam.update();
  this.ball.update();

  if (this.field.inGoal(this.ball.x, this.ball.y)) {
    if (this.ball.x <= this.field.left) {
      this.rightScore += 1;
    } else {
      this.leftScore += 1;
    }
    // Reset ball to the center.
    this.ball = new Ball(this.field, {
      x: this.canvas.width / 2,
      y: this.canvas.height / 2
    });
  }


  // Render the game.
  this.ctx.fillStyle = 'black';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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

  this.ctx.fillStyle = 'white';
  this.ctx.font = "30px Arial";
  this.ctx.fillText(this.leftScore + " - " + this.rightScore, 10, 50);

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
  game.pause = true;
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
  this.game.run();
}

angular.module('soccer', [
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
      templateUrl: '/static/soccer/soccer.tpl.html',
    });
});

