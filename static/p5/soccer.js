import {SwipeControls} from "../shared/swipecontrols.js";
import {Logger} from "../shared/logger.js";
import {GameControls} from "../shared/gamecontrols.js";

class Player {

  constructor(team) {
    this.team = team;
    this.game = team.getGame();
    this.mass = 40;
    // A = pi * r^2
    // r = sqrt(A / pi), A = mass / d
    this.radius = Math.floor(Math.sqrt(this.mass * 2));
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
    let surfaceFriction = this.vel.copy().normalize().mult(-1);
    surfaceFriction.setMag(this.game.options.sliding_friction * this.mass);
    this.vel.add(surfaceFriction);

    // Drag friction is proportional to velocity squared.
    let mag = this.game.options.drag_friction * this.vel.magSq();
    // friction is in the opposite direction to velocity.
    let airFriction = this.vel.copy().normalize().mult(-1);
    airFriction.setMag(mag);
    // At very high speeds the "drag" can exceed speed.
    // Because we are sampling the force based on a discrete frame this can reverse the direction of the object.
    // Instead we will artificially limit the force to a fraction of the speed so that it quickly reduces speed.
    airFriction.limit(this.vel.mag() / 2);
    this.vel.add(airFriction);
  }

  update() {
    // crash?
    // The bounce back into walls is 50%, but only for the motion towards the wall?
    if (this.pos.x - this.radius < 0 && this.vel.x < 0) {
      this.vel.x *= -1;
      this.vel.mult(0.5);
    }
    if (this.pos.x + this.radius > this.game.field.left * 2 + this.game.field.width && this.vel.x > 0) {
      this.vel.x *= -1;
      this.vel.mult(0.5);
    }
    if (this.pos.y - this.radius < 0 && this.vel.y < 0) {
      this.vel.y *= -1;
      this.vel.mult(0.5);
    }
    if (this.pos.y + this.radius > this.game.field.top * 2 + this.game.field.height && this.vel.y > 0) {
      this.vel.y *= -1;
      this.vel.mult(0.5);
    }
    let ball = this.game.ball;

    this.collide(ball);

    this.updatePosition();
  }

  collide(obj) {
    let d = p5.Vector.dist(this.pos, obj.pos);
    if (d > this.radius + obj.radius) {
      // Not colliding
      return;
    }
    // Kick physics based on https://www.youtube.com/watch?v=dJNFPv9Mj-Y
    let impact = obj.pos.copy().sub(this.pos);
    impact.setMag(this.radius + obj.radius);
    let vDiff = obj.vel.copy().sub(this.vel);
    let mSum = this.mass + obj.mass;
    let num = 2 * vDiff.dot(impact)
    let den = mSum * impact.magSq();

    let deltaV = impact.copy();
    deltaV.mult(obj.mass * num / den);
    this.vel.add(deltaV);
    // Reverse
    let deltaV2 = impact.copy();
    deltaV2.mult(-this.mass * num / den);
    obj.vel.add(deltaV2);

    // TODO should consider the velocity of both objects to determine when impact would have occurred?
    // The point when the distance between objects is exactly equal to the sum of their radius.
    // This impact point would be more accurate.
    // For now just shift the objects slightly apart to ensure impact distance is correct.
    let overlap = impact.copy();
    overlap.setMag((d - this.radius - obj.radius) / 2);
    this.pos.add(overlap);
    obj.pos.sub(overlap);

    // Lose some kinetic energy (50%) for the obj and player.
    // TODO this should be based on ke = 1/2 m * v^2?
    obj.vel.mult(0.8);
    this.vel.mult(0.8);

  }

  draw() {
    fill(this.team.color);
    circle(this.pos.x, this.pos.y, this.radius * 2);
  }
}

class Team {

  constructor(color, game, dir) {
    this.color = color;
    this.dir = dir;
    this.game = game;
    this.formation = [1,1,1,1,1,1,1,1,1,1];
    this.formation = [4,1,4,1];

    this.players = [];
  }

  getGame() {
    return this.game;
  }

  addPlayer(player) {
    this.players.push(player);
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
    stroke(this.lineColor)
    noFill();
    var goalDepth = this.halfGoalWidth;
    rect(this.left, this.top, this.width, this.height);
    rect(this.left - goalDepth, this.goalTop, goalDepth, this.halfGoalWidth * 2);
    rect(this.left + this.width, this.goalTop, goalDepth, this.halfGoalWidth * 2);
  }

  collide(obj) {
    if (obj.pos.y - obj.radius < this.top && obj.vel.y < 0) {
      obj.vel.y *= -1;
      obj.vel.mult(0.8)
    }
    if (obj.pos.y + obj.radius > this.top + this.height && obj.vel.y > 0) {
      obj.vel.y *= -1;
      obj.vel.mult(0.8);
    }
    if (obj.pos.y > this.goalTop && obj.pos.y < this.goalBottom) {
      // No bouncing happens if the ball is in the goal space.
      // TODO should radius be used for this?
      return;
    }
    if (obj.pos.x - obj.radius < this.left && obj.vel.x < 0) {
      obj.vel.x *= -1;
      obj.vel.mult(0.8);
    }
    if (obj.pos.x + obj.radius > this.left + this.width && obj.vel.x > 0) {
      obj.vel.x *= -1;
      obj.vel.mult(0.8);
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
  constructor(game) {
    this.game = game;
    this.field = game.field;
    this.pos = createVector(this.field.left + this.field.width / 2, this.field.top + this.field.height / 2);
    this.vel = createVector(0, 0);
    this.radius = 20;
    this.mass = 10;
  }


  update() {
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);


    // Surface friction will be proportional to mass.
    let surfaceFriction = this.vel.copy().normalize().mult(-1);
    surfaceFriction.setMag(this.game.options.sliding_friction * this.mass);
    this.vel.add(surfaceFriction);

    // Drag friction is proportional to velocity squared, but much less.
    // This constraint results in the balls max speed.
    let drag = this.vel.copy().normalize().mult(-1);
    drag.setMag(this.game.options.drag_friction * this.vel.magSq());
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
    this.turn_speed = options.turn_speed || 0.08;
    this.acceleration = options.acceleration || 0.25;
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

    // TODO instead of these we should be able to use mass + friction constants.
    // Ball mass being low will mean heavier players will transfer more speed.
    // Ball air resistance being low will mean the ball can move faster than players.
    this.options = {
      sliding_friction: 0.001,
      drag_friction: 0.001,
      ai: true,
    };
    this.field = new Field({
      left: width / 20,
      width: width * 18 / 20,
      top: height / 20,
      height: height * 18 / 20,
      halfGoalWidth: height * 4.5 / 20
    });

    this.ball = new Ball(this);

    // Init the score to 0 - 0
    this.leftScore = 0;
    this.rightScore = 0;

    let red = 'pink';
    let blue = 'lightskyblue';
    let numPlayers = 11;
    this.players = [];
    this.leftTeam = new Team(red, this, -1);
    this.rightTeam = new Team(blue, this, 1);
    this.rightTeam.formation = [4, 2, 3, 1];

    for (let i = 0; i < numPlayers; i++) {
      let player = new Player(this.leftTeam, game);
      this.players.push(player);
      this.leftTeam.addPlayer(player);

      let rightPlayer = new Player(this.rightTeam, game);
      this.players.push(rightPlayer);
      this.rightTeam.addPlayer(rightPlayer);
    }

    this.leftTeam.setupFormation();
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
  }

  addControls(humanControls) {
    this.controls.push(humanControls);
  }

  applyControl(player, force) {
    // A control is requesting a force be applied to a player.
    // Simply add the force/mass to the velocity.
    // F = ma, a = dv . dt; Assuming dt = 1 frame
    // dv = F / m
    player.vel.add(force);
  }

  play() {
    this.paused = false;
    console.log("Resumed");
    loop();
  }
  pause() {
    this.paused = true;
    console.log("Paused");
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

    for (let i = 0; i <this.players.length; i++) {
      let player = this.players[i];
      // players collide with other players.
      for (let ii = i + 1; ii < this.players.length; ii++) {
        player.collide(this.players[ii]);
      }
      // And collide with the ball.
      player.collide(this.ball);

      this.field.collide(player);
    }

    // Update the players locations.
    for (let player of this.players) {
      player.update();
    }

    this.ball.update();

    if (this.field.inGoal(this.ball.pos.x, this.ball.pos.y)) {
      if (this.ball.pos.x <= this.field.left) {
        this.rightScore += 1;
      } else {
        this.leftScore += 1;
      }
      // Reset ball to the center.
      this.ball = new Ball(this);

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
    noStroke();
    text(this.leftScore + " - " + this.rightScore, 10, 50);
  }
}

var game;
var humanControls;
var mousePos;
var touchPos;
var logger;

export function setup() {
  let c = createCanvas(windowWidth, windowHeight);
  logger = new Logger();
  // TODO share a game with angular?
  game = new SoccerGame(c);

  // A list of controllable units.
  let controllable = game.leftTeam.players;
  humanControls = new SwipeControls(game, controllable);

  game.addControls(humanControls);
  // The plays on each team can be controlled by AI.
  // this.controls.push(new AIControls(game, game.leftTeam));
  // this.controls.push(new AIControls(game, game.rightTeam));


  mousePos = createVector(0, 0);
  touchPos = createVector(0, 0);
  logger.debug("Game Start");
}

export function draw() {
  background(0);

  game.update();

  game.draw();

  logger.draw(windowWidth / 2 - 160, windowHeight - 150);
}

export function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  game.resize(windowWidth, windowHeight);
}

// TODO move this setup into the swipecontrol.js class?
// TODO handle multiple touches? Would need touchStarted, touchMoved and touchedEnded.
export function mousePressed() {
  if (game.paused) {
    return;
  }
  mousePos.set(mouseX, mouseY);
  logger.debug("Mouse Pressed " + mousePos);
  humanControls.start(mousePos);
}

export function mouseDragged() {
  if (game.paused) {
    return;
  }
  mousePos.set(mouseX, mouseY);
  logger.debug("Mouse Drag " + mousePos);
  humanControls.move(mousePos);
}

export function mouseReleased() {
  if (game.paused) {
    // TODO can we access the pause controller to start the game?
    return;
  }
  mousePos.set(mouseX, mouseY);
  logger.debug("Mouse Release " + mousePos);
  humanControls.end(mousePos);
}
