class Player {
  static BOUNCE_BACK = 0.5;
  static KICK_SPEED = 2;

  constructor(team) {
    this.team = team;
    this.game = team.getGame();
    this.radius = 10;
    this.mass = 1;
    this.reset();
  }

  reset() {
    let x = Math.random() * this.game.field.width / 2 + this.game.field.left;
    if (this.team.dir === -1) {
      x += this.game.field.width / 2;
    }
    let y = Math.random() * this.game.field.height + this.game.field.top;
    this.setPosition(createVector(x, y));
  }
  setPosition(pos) {
    this.startPos = pos.copy();
    this.pos = pos.copy();
    // Set velocity to 0 when position is updated.
    this.vel = createVector(0, 0);
  }
  updatePosition() {
    this.pos.add(this.vel);

    // Surface friction will be proportional to mass.
    // Drag friction is proportional to velocity squared, but much less.
    let mag = Math.min(this.vel.mag(), this.game.options.friction * this.mass + this.game.options.friction2 * this.vel.magSq());
    // friction is in the opposite direction to velocity.
    let friction = this.vel.copy().normalize().mult(-1);
    friction.setMag(mag);
    this.vel.add(friction);
  }

  update() {
    // crash?
    if (this.pos.x - this.radius < 0 && this.vel.x < 0) {
      this.vel.x *= -Player.BOUNCE_BACK;
    }
    if (this.pos.x + this.radius > this.game.field.left * 2 + this.game.field.width && this.vel.x > 0) {
      this.vel.x *= -Player.BOUNCE_BACK;
    }
    if (this.pos.y - this.radius < 0 && this.vel.y < 0) {
      this.vel.y *= -Player.BOUNCE_BACK;
    }
    if (this.pos.y + this.radius > this.game.field.top * 2 + this.game.field.height && this.vel.y > 0) {
      this.vel.y *= -Player.BOUNCE_BACK;
    }

    if (this.pos.x - this.game.ball.pos.x < this.radius + this.game.ball.radius &&
      this.pos.x - this.game.ball.pos.x > -this.radius - this.game.ball.radius &&
      this.pos.y - this.game.ball.pos.y < this.radius + this.game.ball.radius &&
      this.pos.y - this.game.ball.pos.y > -this.radius - this.game.ball.radius) {
      // Kick physics?
      this.game.ball.vel.mult(0.8);
      let kick = this.game.ball.pos.copy().sub(this.pos).mult(.25)
      // let kick = this.vel.copy().mult(Player.KICK_SPEED)
      this.game.ball.vel.add(kick);

      // slow down when you kick the ball.
      this.vel.add(this.vel.copy().mult(-Player.BOUNCE_BACK));
    }

    this.updatePosition();
  }

  draw() {
    fill(this.team.color);
    circle(this.pos.x, this.pos.y, this.radius * 2);
  }
}

class Team {

  constructor(color, game, numPlayers, dir) {
    this.color = color;
    this.dir = dir;
    this.game = game;
    this.formation = [1,1,1,1,1,1,1,1,1,1];
    this.formation = [4,1,4,1];

    this.players = [];
    for (let i = 0; i < numPlayers; i++) {
      this.players.push(new Player(this, game));
    }
  }

  getGame() {
    return this.game;
  }

  draw() {
    for (let player of this.players) {
      player.draw();
    }
  };

  reset() {
    for (let player of this.players) {
      player.reset();
    }
  };

  update() {
    for (let player of this.players) {
      player.update();
    }
  }

  setupFormation() {
    let form = this.formation;
    let middle = this.game.field.top + this.game.field.height / 2;
    let goal = this.game.field.left;
    if (this.dir === -1) {
      goal += this.game.field.width;
    }
    this.players[0].setPosition(createVector(goal, middle));

    let p = 1;
    for (let i = 0; i < form.length; i++) {
      let num = form[i];
      let x = (i + 1) * this.game.field.width / 2.1 / (form.length) + this.game.field.left;
      if (this.dir === -1) {
        x = this.game.field.width - x + this.game.field.left * 2;
      }
      let spacer = this.game.field.height / num;
      for (let ii = 0; ii < num; ii++) {
        let y = ii * spacer + this.game.field.top + spacer / 2;
        this.players[p++].setPosition(createVector(x, y));
      }
    }
  }
}

class Field {
  constructor(params) {
    this.lineColor = '#FFFFFF';
    this.width = params.width;
    this.height = params.height;
    this.left = params.left;
    this.top = params.top;

    this.halfGoalWidth = params.halfGoalWidth || 64;
    this.goalTop = this.top + this.height / 2 - this.halfGoalWidth;
    this.goalBottom = this.top + this.height / 2 + this.halfGoalWidth;
  }


  draw() {
    // Draw Field
    stroke(255)
    noFill();
    var goalDepth = this.halfGoalWidth;
    rect(this.left, this.top, this.width, this.height);
    rect(this.left - goalDepth, this.goalTop, goalDepth, this.halfGoalWidth * 2);
    rect(this.left + this.width, this.goalTop, goalDepth, this.halfGoalWidth * 2);
  }

  collide(obj) {
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

  inGoal(x, y) {
    if (y < this.goalTop || y > this.goalBottom) {
      return false;
    }
    if (x < this.left || x > this.left + this.width) {
      return true;
    }
  }

}

class Ball {
  static BOUNCE_BACK = 0.8;

  constructor(field) {
    this.field = field;
    this.pos = createVector(this.field.left + this.field.width / 2, this.field.top + this.field.height / 2);
    this.vel = createVector(0, 0);
    this.radius = 20;
    this.mass = 0.2;
  }


  update() {
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

  draw() {
    fill(color(0, 128, 0));
    noStroke();
    circle(this.pos.x, this.pos.y, this.radius * 2);
  }

}

class HumanControls {
  constructor(controls, game, team) {
    this.controls = controls;
    this.game = game;
    this.team = team;
    this.player = team.players[0];
    this.player.noAI = true;
    this.moveTypes = [
      new CarMove(game.options),
      new IceMove(game.options)
    ]
    this.moveTypeIndex = 1;
    this.moveControl = this.moveTypes[this.moveTypeIndex];
  }

  update() {
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

  draw() {

  }
}

class IceMove {
  constructor(options) {
    this.options = options
  }

  move(player, keys) {
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
  }
}

class CarMove {
  constructor(options) {
    this.options = options;
  }

  move(player, keys) {
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
}

class AIControls {
  constructor(game, team) {
    this.game = game;
    this.team = team;
    // TODO assign "roles" to players so they don't all do exactly the same AI.
    this.players = team.players;
    this.maxSpeed = 5;
    this.maxForce = 0.5;
  }

  update() {
    if (this.game.options.ai) {
      for (let player of this.players) {
        if (player.noAI) {
          continue;
        }
        this.updatePlayer(player);
      }
    }
  }

  calculateGoalwards() {
    // Simple goalwards is just left or right.
    // return createVector(this.team.dir, 0).setMag(this.game.ball.radius);

    let goaly = this.game.field.top + this.game.field.height / 2;
    let goalx = this.game.field.left;
    if (this.team.dir === 1) {
      goalx += this.game.field.width;
    }
    // towards the goal from the ball.
    let goalwards = createVector(goalx, goaly).sub(this.game.ball.pos);
    // On the edge of the ball.
    goalwards.setMag(this.game.ball.radius * 0.75);
    return goalwards;
  }

  calculateForce(loc) {
    let goalwards = this.calculateGoalwards();
    return this.ballMagnetForce(loc, goalwards);
  }

  ballMagnetForce(loc, direction) {
    // This is where the ball will be in a few frames.
    // Based on how far away the player is from the ball.
    let dis = p5.Vector.dist(loc, this.game.ball.pos);
    dis = constrain(dis / 5, 0, 5);
    var ballPos = this.game.ball.vel.copy().mult(dis).add(this.game.ball.pos);

    // force away from goalwards of the ball
    let force2 = p5.Vector.sub(loc, ballPos).sub(direction);
    force2.mult(1000 / force2.magSq());

    // force towards the ball
    let force = p5.Vector.sub(ballPos, loc).sub(direction);
    force.mult(1000 / force.magSq());

    force.add(force2)
    return force;
  }

  draw() {
    stroke(this.team.color);

    let goalwards = this.calculateGoalwards();
    line(this.game.ball.pos.x, this.game.ball.pos.y, this.game.ball.pos.x + goalwards.x, this.game.ball.pos.y + goalwards.y);

    let field = this.game.field;
    for (let y = field.top + 15; y < field.top + field.height; y += 20) {
      for (let x = field.left + 20; x < field.top + field.width; x += 20) {
        let f = this.calculateForce(createVector(x, y));
        // For rendering purpose don't show larger than 20 pixels.
        if (f.magSq() < 400) {
          line(x, y, x + f.x, y + f.y);
        }
      }
    }
  }

  seek(player, target) {
    let force = p5.Vector.sub(target, player.pos);
    force.limit(this.maxSpeed);
    force.sub(player.vel)
    force.limit(this.maxForce)
    return force
  }

  updatePlayer(player) {
    // TODO use goalwards for attackers, but away from own goal for defence?
    let direction = this.calculateGoalwards();
    let force = this.ballMagnetForce(player.pos, direction);

    let attackFraction = (this.game.ball.pos.x - this.game.field.left) / this.game.field.width;
    let target = player.startPos.copy();
    if (this.team.dir === -1) {
      target.sub(createVector(this.game.field.width))
      // attack fraction is reversed for the team in the other direction.
      target.mult(createVector((1 - attackFraction) * 3, 1))
      target.add(createVector(this.game.field.width))
    } else {
      target.mult(createVector(attackFraction * 3, 1));
    }
    let returnToStart = target.sub(player.pos).mult(.01);
    force.add(returnToStart);
    // Keep things interesting by adding some noise.
    // limit first to ensure the noise is at least 20% of current objective.
    // force.limit(5);
    // force.add(p5.Vector.random2D());
    force.setMag(this.maxSpeed);

    // Now force is set to the desired velocity, subtract our current velocity to get the delta (acceleration to apply).
    force.sub(player.vel);

    // Limit the force to the maximum force, then apply it.
    // Assumes 1 second per frame, and 1 mass (a = F / m) and (v = a * t)
    force.limit(this.maxForce);
    player.vel.add(force);
    player.vel.limit(this.maxSpeed)
  }
}

class SoccerGame {
  constructor(canvas) {
    this.canvas = canvas;

    // TODO instead of these we should be able to use mass + air resistance constants.
    // Ball mass being low will mean heavier players will transfer more speed.
    // Ball air resistance being low will mean the ball can move faster than players.
    this.options = {
      turn_speed: 0.08,
      acceleration: 0.25,
      friction: 0.25 * 0,
      friction2: 0.02,
      bounce: Player.BOUNCE_BACK,
      kick_speed: Player.KICK_SPEED,
      ai: true,
    };
    this.field = new Field({
      left: width / 20,
      width: width * 18 / 20,
      top: height / 20,
      height: height * 18 / 20,
      halfGoalWidth: height * 4.5 / 20
    });

    this.ball = new Ball(this.field);

    // Init the score to 0 - 0
    this.leftScore = 0;
    this.rightScore = 0;

    let red = 'pink';
    let blue = 'lightskyblue';
    this.leftTeam = new Team(red, this, 11, -1);
    this.rightTeam = new Team(blue, this, 11, 1);
    this.rightTeam.formation = [4, 2, 3, 1];

    this.leftTeam.reset();
    this.rightTeam.setupFormation();

    this.gameControls = new GameControls({
      // 'debug': true,
      // TODO need a deadzone for gamepad controller?
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

    // The plays on each team can be controlled by AI.
    this.controls.push(new AIControls(this, this.leftTeam));
    this.controls.push(new AIControls(this, this.rightTeam));
  }

  play() {
    loop();
  }
  pause() {
    noLoop();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  update() {
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

      this.leftTeam.setupFormation();
      this.rightTeam.setupFormation();
    }
  }

  draw() {
    this.field.draw();
    this.ball.draw();
    this.leftTeam.draw();
    this.rightTeam.draw();

    for (let control of this.controls) {
      control.draw();
    }

    fill(255);
    textSize(32);
    text(this.leftScore + " - " + this.rightScore, 10, 50);
  }
}

var game;

function setup() {
  createCanvas(windowWidth, windowHeight);
  // TODO share a game with angular?
  game = new SoccerGame({
    width: windowWidth,
    height: windowHeight
  });
}

function draw() {
  background(0);

  game.update();

  game.draw();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  game.resize(windowWidth, windowHeight);
}

class PauseController {
  constructor(game, $scope) {
    this.game = game;
    this.$scope = $scope;
    this.start();
    window.addEventListener('blur', this.pause.bind(this), false);
  }

  pause() {
    this.running = false;
    this.game.pause();
    this.options = game.options;
    this.$scope.$apply();
  }

  start() {
    // game.start???
    this.running = true;
    this.game.play();
  }
}

angular.module('soccer', [
  'config',
  'ngRoute'
])
.factory('game', function() {
  return game;
})
.controller('PauseController', function(game, $scope) {
  return new PauseController(game, $scope);
})
.config(function($routeProvider, config) {
  $routeProvider
      .otherwise({
        templateUrl: '/static/soccer/soccer.tpl.html',
      });
});

