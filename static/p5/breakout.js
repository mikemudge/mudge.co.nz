class Line {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    let distX = this.x1 - this.x2;
    let distY = this.y1 - this.y2;
    this.lenSq = (distX*distX) + (distY*distY);
  }

  show() {
    line(this.x1, this.y1, this.x2, this.y2);
  }

  /** Find the point on the line closest to point */
  closePoint(point) {
    let dot = ( ((point.x-this.x1)*(this.x2-this.x1)) + ((point.y-this.y1)*(this.y2-this.y1)) ) / this.lenSq;

    // Limit dot to be between 0 and 1 so the close point ends up on the line.
    dot = min(1, max(0, dot));
    let closestX = this.x1 + (dot * (this.x2-this.x1));
    let closestY = this.y1 + (dot * (this.y2-this.y1));

    return createVector(closestX, closestY);
  }

  collisionPoint(line) {

    // This value indicates how far along the line it will hit. 0-1 is based on the ends of the line used above.
    // 1.5 would indicate it hits if the line was 50% longer in that direction.
    var uA = ((x4-x3)*(y1-y3) - (y4-y3)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));

    // if uA is between 0-1, lines are colliding
    if (uA >= 0 && uA <= 1) {
      // Find where the lines meet
      var intersectionX = x1 + (uA * (x2-x1));
      var intersectionY = y1 + (uA * (y2-y1));
      fill(255,0,0);
      noStroke();
      ellipse(intersectionX, intersectionY, 8, 8);
      return true;
    }
  }
}

class Ball {
  constructor(pos, vel) {
    this.pos = createVector(width / 2, height - 50);
    this.vel = createVector(random(-3, 3), 3);
    this.size = 8;
    this.color = color(255);
  }

  update() {
    this.pos.add(this.vel);
    this.border();
  }

  border() {
    if (this.pos.x - this.size < 0 && this.vel.x < 0) {
      this.vel.x *= -1;
    }
    if (this.pos.x + this.size > width && this.vel.x > 0) {
      this.vel.x *= -1;
    }
    if (this.pos.y - this.size < 0 && this.vel.y < 0) {
      this.vel.y *= -1;
    }
    // No bottom bounce, the paddle needs to do this.
    if (args.get("nolose") && this.pos.y + this.vel.y + this.size > height) {
      this.vel.y *= -1;
    }
  }

  collideBrick(brick) {
    var bounceSpot = null;
    var bestDis = 0;
    for (let l of [brick.bottom, brick.left, brick.right, brick.top]) {
      let closePoint = l.closePoint(this.pos);
      let dis = closePoint.dist(this.pos);
      if (!bounceSpot || dis < bestDis) {
        bounceSpot = closePoint;
        bestDis = dis;
      }
    }

    if (this.pos.dist(bounceSpot) < this.size / 2) {
      // Close enough to hit this, perform bounce.

      // Calculate the vector from bounce point towards the ball to reflect on.
      let n = bounceSpot.sub(this.pos).mult(-1);
      this.vel.reflect(n);
      return true;
    }
    return false;
  }

  finished() {
    // If the ball leaves the screen off the bottom.
    return this.pos.y + this.size > height;
  }

  show() {
    fill(this.color);

    push();
    translate(this.pos.x, this.pos.y);
    ellipse(0, 0, this.size * 2);
    pop();
  }
}

class Brick {
  constructor(x, y, r) {
    this.size = r || 20;
    this.pos = createVector(x, y);
    this.color = color(random(255), random(255), random(255));
    this.health = 1;
    this.bottom = new Line(x - this.size, y + this.size / 2, x + this.size, y + this.size / 2);
    this.left = new Line(x - this.size, y - this.size / 2, x - this.size, y + this.size / 2);
    this.right = new Line(x + this.size, y - this.size / 2, x + this.size, y + this.size / 2);
    this.top = new Line(x - this.size, y - this.size / 2, x + this.size, y - this.size / 2);
  }

  update() {
  }

  hit(args) {
    // Always finish this brick off immediately.
    this.health--;
    if (this.finished()) {
      let rnd = random(100);
      // % chance of getting a powerup.
      if (rnd < 20 || args.get("powerup")) {
        let powerup = new PowerUp(this.pos.x, this.pos.y);
        if (args.get("powerup")) {
          powerup.type = args.get("powerup");
        }
        console.log("Add power up", powerup.type);
        return powerup;
      }
    }
    return null;
  }

  finished() {
    return this.health <= 0;
  }

  show() {
    if (this.finished()) {
      return;
    }
    push();
    translate(this.pos.x, this.pos.y);
    stroke(255);
    strokeWeight(1);
    fill(this.color);
    rect(-this.size, -this.size / 2, this.size * 2, this.size);
    pop();
  }
}


class PowerUp {
  constructor(x, y, r, col) {
    this.size = 10;
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    if (this.vel.y > 0) {
      this.vel.y *= -1;
    }
    this.type = random(["newball", "largerpaddle", "smallerpaddle"]);
  }

  update() {
    this.pos.add(this.vel);
    this.vel.add(createVector(0, 0.04))
  }

  collide(paddle, game) {
    if (this.claimed) {
      // Already claimed this power.
      return;
    }

    if (this.pos.x - this.size < 0 && this.vel.x < 0) {
      this.vel.x *= -1;
    }
    if (this.pos.x + this.size > width && this.vel.x > 0) {
      this.vel.x *= -1;
    }
    if (this.pos.y - this.size < 0 && this.vel.y < 0) {
      this.vel.y *= -1;
    }

    if (this.pos.y + this.size > paddle.pos.y - paddle.height) {
      let d = this.pos.x - paddle.pos.x;
      if (-paddle.width < d && d < paddle.width) {
        // Hit the paddle
        this.claim(game);
      }
    }
  }

  claim(game) {
    this.claimed = true;
    if (this.type === "newball") {
      let ball = new Ball();
      // TODO should this use a different ball to duplicate?
      // Perhaps the last one to have bounced off paddle?
      ball.pos = game.balls[0].pos.copy();
      ball.vel = game.balls[0].vel.copy();
      ball.vel.add(p5.Vector.random2D()).limit(1,5);

      game.balls.push(ball);
    } else if (this.type === "largerpaddle") {
      // Increase paddle size.
      game.paddle.width += 10;
    } else if (this.type === "smallerpaddle") {
      // Decrease paddle size.
      if (game.paddle.width > 20) {
        game.paddle.width -= 10;
      }
    } else {
      console.log("unknown power", this.type);
    }
  }

  finished() {
    return this.claimed || this.pos.y + this.size > height;
  }

  show() {
    push();
    translate(this.pos.x, this.pos.y);
    stroke(255);
    strokeWeight(1);
    if (this.type === "newball") {
      fill(color(200, 0, 0));
    } else if (this.type === "largerpaddle") {
      fill(color(0, 200, 0));
    } else if (this.type === "smallerpaddle") {
      fill(color(0, 0, 200));
    }
    rect(-this.size, -this.size, this.size * 2, this.size * 2, 3);
    pop();
  }
}

class Paddle {
  constructor() {
    this.width = 40;
    this.height = 5;
    this.pos = createVector(width / 2, height - 10);
  }

  update() {
    this.pos.x = Math.max(Math.min(mouseX, width - this.width), this.width);
  }

  collide(ball) {
    if (ball.vel.y > 0 && ball.pos.y + ball.size > this.pos.y - this.height) {
      let d = ball.pos.x - this.pos.x;
      if (-this.width < d && d < this.width) {
        // Hits the paddle, increase x speed based on where.
        // Speed is based on existing momentum + hit location on paddle.
        var paddleHitX = d / this.width;
        ball.vel.x = 0.8 * ball.vel.x + 2 * paddleHitX;
        ball.vel.y *= -1;
      }
    }
  }

  show() {
    fill(color(0, 100, 200));
    rect(this.pos.x - this.width, this.pos.y - this.height, this.width * 2, this.height * 2, 5);
  }
}

class Game {
  constructor() {

    this.reset();
  }

  reset() {
    this.paused = true;
    this.balls = [new Ball()];
    this.paddle = new Paddle();

    this.powerups = [];
    this.bricks = [];

    // for testing
    // this.bricks.push(new Brick(200, 100, 100));
    // this.bricks.push(new Brick(400, 100, 100));
    // this.bricks.push(new Brick(200, 200, 100));
    // return;

    let size = 20;
    for (let y = 40; y <= height / 2; y += size) {
      for (let x = 40; x <= width - size * 2; x += size * 2) {
        this.bricks.push(new Brick(x, y, size));
      }
    }
  }

  show() {
    for (let brick of this.bricks) {
      brick.update();
      brick.show();
      for (let ball of this.balls) {
        if (brick.finished()) {
          continue;
        }
        if (ball.collideBrick(brick)) {
            var powerup = brick.hit(args);
            if (powerup) {
              this.powerups.push(powerup);
            }
        }
      }
    }
    for (let i = this.bricks.length - 1; i >= 0; i--) {
      if (this.bricks[i].finished()) {
        this.bricks.splice(i, 1);
      }
    }

    if (this.bricks.length === 0) {
      // Level complete?
      console.log("Level complete");
      this.reset();
      return;
    }

    for (let ball of this.balls) {
      if (!this.paused) {
        ball.update();
        this.paddle.collide(ball);
      }
      ball.show();
    }

    for (let i = this.balls.length - 1; i >= 0; i--) {
      if (this.balls[i].finished()) {
        this.balls.splice(i, 1);
      }
    }

    if (this.balls.length === 0) {
      // You lose
      console.log("You lose");
      this.reset();
      return;
    }

    for (let powerup of this.powerups) {
      powerup.update();
      powerup.collide(this.paddle, this);
      powerup.show();
    }
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      if (this.powerups[i].finished()) {
        this.powerups.splice(i, 1);
      }
    }

    this.paddle.update();
    this.paddle.show();
  }
}

function mouseClicked() {
  game.paused = false;
}

function setup() {
  createCanvas(500, 500);

  args = new URLSearchParams(location.search);

  game = new Game();

  game.reset();
}

function draw() {
  background(0);

  game.show();
}
