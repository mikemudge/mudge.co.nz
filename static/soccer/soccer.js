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
  this.mass = 1;
  this.line_length = this.radius * 1.8;
  this.pos = createVector(
    (Math.random() * 18 + 1) * game.canvas.width / 20,
    (Math.random() * 18 + 1) * game.canvas.height / 20);

  this.vel = createVector(0, 0);

  // Use heading instead of ang.
  // rotate(this.vel.heading());
  this.ang = 0;
};
Player.ACCELERATION = 0.25;
Player.FRICTION = 0.25;
Player.BOUNCE_BACK = 0.5;
Player.KICK_SPEED = 2;

Player.prototype.updatePosition = function() {
  this.pos.add(this.vel);

  // Surface friction will be proportional to mass.
  let friction = this.vel.copy().normalize().mult(-1);
  friction.setMag(0.1 * this.mass)

  // Drag friction is proportional to velocity squared, but much less.
  // This constraint results in players having a max speed.
  let drag = this.vel.copy().normalize().mult(-1);
  drag.setMag(.02 * this.vel.magSq());
  this.vel.add(drag);
}

Player.prototype.update = function() {
  this.updatePosition();

  // crash?
  if (this.pos.x - this.radius < this.game.field.left && this.vel.x < 0) {
    this.vel.x *= -Player.BOUNCE_BACK;
  }
  if (this.pos.x + this.radius > this.game.field.left + this.game.field.width && this.vel.x > 0) {
    this.vel.x *= -Player.BOUNCE_BACK;
  }
  if (this.pos.y - this.radius < this.game.field.top && this.vel.y < 0) {
    this.vel.y *= -Player.BOUNCE_BACK;
  }
  if (this.pos.y + this.radius > this.game.field.top + this.game.field.height && this.vel.y > 0) {
    this.vel.y *= -Player.BOUNCE_BACK;
  }

  if (this.pos.x - this.game.ball.pos.x < this.radius + this.game.ball.radius &&
      this.pos.x - this.game.ball.pos.x > -this.radius - this.game.ball.radius &&
      this.pos.y - this.game.ball.pos.y < this.radius + this.game.ball.radius &&
      this.pos.y - this.game.ball.pos.y > -this.radius - this.game.ball.radius) {
    // Kick physics?
    this.game.ball.vel.mult(0.8);
    kick = this.vel.copy().mult(Player.KICK_SPEED)
    this.game.ball.vel.add(kick);

    // slow down when you kick the ball.
    this.vel.add(this.vel.copy().mult(-Player.BOUNCE_BACK));
  }
}

Player.prototype.draw = function(ctx) {
  fill(this.team.color);
  circle(this.pos.x, this.pos.y, this.radius * 2);

  // TODO show the direction with a line?
  // Need a vector for this.
  // ctx.lineWidth = 4;
  // ctx.beginPath();
  // ctx.moveTo(this.x, this.y);
  // ctx.lineTo(this.x + Math.sin(this.ang) * this.line_length, this.y - Math.cos(this.ang) * this.line_length);
  // ctx.strokeStyle = this.team.color;
  // ctx.stroke();
}

var Team = function(color, game, numPlayers) {
  this.color = color;

  this.players = [];
  for (i = 0; i < numPlayers; i++) {
    this.players.push(new Player(this, game));
  }
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
  stroke(255)
  noFill();
  var goalDepth = this.halfGoalWidth;
  rect(this.left, this.top, this.width, this.height);
  rect(this.left - goalDepth, this.goalTop, goalDepth, this.halfGoalWidth * 2);
  rect(this.left + this.width, this.goalTop, goalDepth, this.halfGoalWidth * 2);
}

Field.prototype.collide = function(obj) {
  if (obj.pos.y - obj.radius < this.top && obj.vel.y < 0) {
    obj.vel.y *= -Ball.BOUNCE_BACK;
  }
  if (obj.pos.y + obj.radius > this.top + this.height && obj.vel.y > 0) {
    obj.vel.y *= -Ball.BOUNCE_BACK;
  }
  if (obj.pos.y > this.goalTop && obj.pos.y < this.goalBottom) {
    // No bouncing happens if the ball is in the goal space.
    // TODO should radius be used for this?
    return;
  }
  if (obj.pos.x - obj.radius < this.left && obj.vel.x < 0) {
    obj.vel.x *= -Ball.BOUNCE_BACK;
  }
  if (obj.pos.x + obj.radius > this.left + this.width && obj.vel.x > 0) {
    obj.vel.x *= -Ball.BOUNCE_BACK;
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

var Ball = function(field) {
  this.field = field;
  this.pos = createVector(this.field.width / 2, this.field.height / 2);
  this.vel = createVector(0, 0);
  this.radius = 20;
  this.mass = 0.2;
}
Ball.BOUNCE_BACK = 0.8;

Ball.prototype.update = function() {
  this.vel.add(this.acc);
  this.vel.limit(this.maxSpeed);

  this.pos.add(this.vel);


  // Surface friction will be proportional to mass.
  let friction = this.vel.copy().normalize().mult(-1);
  friction.setMag(0.1 * this.mass)

  // Drag friction is proportional to velocity squared, but much less.
  // This constraint results in the balls max speed.
  let drag = this.vel.copy().normalize().mult(-1);
  drag.setMag(.005 * this.vel.magSq());
  this.vel.add(drag);

  // crash into walls
  this.field.collide(this);
}

Ball.prototype.draw = function(ctx) {
  fill(color(0, 128, 0));
  noStroke();
  circle(this.pos.x, this.pos.y, this.radius * 2);
}

var HumanControls = function(controls, game, team) {
  this.controls = controls;
  this.game = game;
  this.team = team;
  this.player = team.players[0];
  this.moveTypes = [
    new CarMove(game.options),
    new IceMove(game.options)
  ]
  this.moveTypeIndex = 1;
  this.moveControl = this.moveTypes[this.moveTypeIndex];
}

HumanControls.prototype.update = function() {
  var arrows = this.controls.get();

  // TODO implement named actions so this can work.
  if (arrows.switchControls) {
    this.moveTypeIndex = (this.moveTypeIndex + 1) % 2;
    this.moveControl = this.moveTypes[this.moveTypeIndex];
  }

  if (arrows.pause) {
    // TODO doesn't show the popup? Probably needs a function with a scope apply.
    // Can't pause from within the game currently, no access to scope, nothing watching.
  }

  this.moveControl.move(this.player, arrows);
}

var IceMove = function(options) {
  this.options = options
};

// Move like you are on ice.
IceMove.prototype.move = function(player, keys) {
  if (keys.left) {
    player.vel.x -= keys.left * this.options.acceleration;
  }
  if (keys.up) {
    player.vel.y -= keys.up * this.options.acceleration;
  }
  if (keys.right) {
    player.vel.x += keys.right * this.options.acceleration;
  }
  if (keys.down) {
    player.vel.y += keys.down * this.options.acceleration;
  }
};

var CarMove = function(options) {
  this.options = options;
}
// Move like a car.
CarMove.prototype.move = function(player, keys) {
  if (keys.left) {
    player.ang -= keys.left * this.options.turn_speed;
  }
  if (keys.right) {
    player.ang += keys.right * this.options.turn_speed;
  }
  if (keys.up) {
    player.vel.x += Math.sin(player.ang) * keys.up * this.options.acceleration;
    player.vel.y -= Math.cos(player.ang) * keys.up * this.options.acceleration;
  }
  if (keys.down) {
    player.vel.x -= Math.sin(player.ang) * keys.down * this.options.acceleration;
    player.vel.y += Math.cos(player.ang) * keys.down * this.options.acceleration;
  }
};

var AIControls = function(game, team) {
  this.game = game;
  this.team = team;
  // TODO assign "roles" to players so they don't all do exactly the same AI.
  this.players = team.players;
  this.maxSpeed = 5;
  this.maxForce = 0.2
}

AIControls.prototype.update = function() {
  for (player of this.players) {
    this.updatePlayer(player);
    // this.updateSimple(player);
  }
}

AIControls.prototype.seek = function(player, target) {
  let force = p5.Vector.sub(target, player.pos);
  force.limit(this.maxSpeed);
  force.sub(player.vel)
  force.limit(this.maxForce)
  return force
}

AIControls.prototype.updateSimple = function(player) {
  var b = this.game.ball;

  // Very simple go to the ball logic with some noise to make it more interesting.
  force = this.seek(player, b.pos);
  force.add(p5.Vector.random2D().mult(.2));
  force.limit(this.maxForce);
  player.vel.add(force);
}

AIControls.prototype.updatePlayer = function(player) {
  var b = this.game.ball;

  // Towards the ball from the player.
  let force = p5.Vector.sub(b.pos, player.pos);
  force.limit(this.maxSpeed);

  // Keep things interesting by adding some noise.
  force.add(p5.Vector.random2D());

  // Towards the "goal" from the ball.
  // TODO this could be improved to be more directional than just "right"
  goalwards = createVector(1, 0);
  goalwards.setMag(this.maxSpeed);
  // TODO use this to determine the "wrong side" of the ball?

  if (force.x < b.radius) {
    // On the wrong side of the ball, need to go around it.
    if (force.y < 0) {
      // below the ball, go around the bottom of it.
      around = createVector(force.y, force.x * -1);
      around.setMag(this.maxSpeed);
      force.add(around);
    } else {
      // above the ball, go around the top of it.
      around = createVector(force.y * -1, force.x);
      around.setMag(this.maxSpeed);
      force.add(around);
    }
  }

  // Now force is set to the desired velocity, subtract our current velocity to get the delta (accelerationo to apply).

  force.sub(player.vel);

  // Limit the force to the maximum force, then apply it.
  // Assumes 1 second per frame, and 1 mass (a = F / m) and (v = a * t)
  force.limit(this.maxForce);
  player.vel.add(force);
}

var SoccerGame = function(canvas) {
  this.canvas = canvas;

  // TODO instead of these we should be able to use mass + air resistance constants.
  // Ball mass being low will mean heavier players will transfer more speed.
  // Ball air resistance being low will mean the ball can move faster than players.
  this.options = {
    turn_speed: 0.08,
    acceleration: Player.ACCELERATION,
    friction: Player.FRICTION,
    bounce: Player.BOUNCE_BACK,
    kick_speed: Player.KICK_SPEED,
    ai: true,
  };
  this.field = new Field({
    left: width / 20,
    width: width * 18 / 20,
    top: height / 20,
    height: height * 18 / 20
  });

  this.ball = new Ball(this.field);

  // Init the score to 0 - 0
  this.leftScore = 0;
  this.rightScore = 0;

  let red = color(255, 0, 0);
  let blue = color(128, 128, 255);
  this.leftTeam = new Team(red, this, 2);
  this.rightTeam = new Team(blue, this, 2);

  this.gameControls = new GameControls({
    // 'debug': true,
    'controller': {
      'directions': 'stick'
    },
    'keys': {
      left: 37,
      up: 38,
      right: 39,
      down: 40,
      // TODO this "action" is not currently supported.
      switchControls: 32,
    }
  });

  // There should probably be a builder for controls setup?
  // registerWASD?
  // registerDirections() keys and controller?
  // Controller can have racing directions triggers + analog steering.
  // Controller can have regular directions using analog stick.
  // addAction('switchControls')

  this.gameControls.init();
  // TODO need to support 2 player.

  this.controls = [];
  // Push a wrapper which can convert control inputs to the game.
  this.controls.push(new HumanControls(this.gameControls, this, this.leftTeam));

  // The right team is controlled by AI.
  this.controls.push(new AIControls(this, this.rightTeam));
};

SoccerGame.prototype.update = function() {
  // Update the game.
  for (let control of this.controls) {
    control.update();
  }

  this.leftTeam.update();
  this.rightTeam.update();
  this.ball.update();

  if (this.field.inGoal(this.ball.pos.x, this.ball.pos.y)) {
    if (this.ball.pos.x <= this.field.left) {
      this.rightScore += 1;
    } else {
      this.leftScore += 1;
    }
    // Reset ball to the center.
    this.ball = new Ball(this.field);
  }
}

SoccerGame.prototype.draw = function() {
  this.field.draw();
  this.ball.draw();

  for (let player of this.leftTeam.players) {
    player.draw();
  }
  for (let player of this.rightTeam.players) {
    player.draw();
  }

  fill(255);
  textSize(32);
  text(this.leftScore + " - " + this.rightScore, 10, 50);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  // TODO share a game with angular?
  game = new SoccerGame({
    width: windowWidth,
    height: windowHeight
  });

  game.options = {};
}

function draw() {
  background(0);

  game.update();

  game.draw();
}

angular.module('soccer', [
  'config',
])

