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
  constructor(x, y, r, col) {
    this.size = 20;
    this.pos = createVector(x, y);
    this.color = color(random(255), random(255), random(255));
    this.health = 100;
  }

  update() {
  }

  collide(ball) {
    if (this.finished()) {
      return;
    }
    if (ball.pos.x + ball.size >= this.pos.x - this.size && ball.pos.x - ball.size <= this.pos.x + this.size) {
      if (ball.pos.y + ball.size >= this.pos.y - this.size / 2 && ball.pos.y - ball.size <= this.pos.y + this.size / 2) {
        this.health = 0;


        var x0 = ball.pos.x;
        var y0 = ball.pos.y;
        var x1 = this.pos.x - this.size
        var x2 = this.pos.x + this.size
        var y1 = this.pos.y + this.size / 2;
        var y2 = y1

        // TODO because we only have vertical and horizonal lines, this should be simplified?
        var n = (x2 - x1) * (y1 - y0) - (x1 - x0) * (y2 - y1);
        var d = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        var bottomDis = Math.abs(n) / d;

        // Check top side
        x1 = this.pos.x - this.size
        x2 = this.pos.x + this.size
        y1 = this.pos.y - this.size / 2;
        y2 = this.pos.y - this.size / 2
        n = (x2 - x1) * (y1 - y0) - (x1 - x0) * (y2 - y1);
        d = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        var topDis = Math.abs(n) / d;

        // Check left side
        x1 = this.pos.x - this.size
        x2 = x1
        y1 = this.pos.y - this.size / 2;
        y2 = this.pos.y + this.size / 2
        n = (x2 - x1) * (y1 - y0) - (x1 - x0) * (y2 - y1);
        d = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        var leftDis = Math.abs(n) / d;

        // Check right side
        x1 = this.pos.x + this.size
        x2 = x1
        y1 = this.pos.y - this.size / 2;
        y2 = this.pos.y + this.size / 2
        n = (x2 - x1) * (y1 - y0) - (x1 - x0) * (y2 - y1);
        d = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        var rightDis = Math.abs(n) / d;

        var debug = false;

        // This works ok, but it needs to consider the limits of the line as currently its assuming infinite length.
        if (ball.vel.x > 0) {
          // ball is moving right.
          if (debug) console.log("dis to left", leftDis);
          if (ball.vel.y > 0) {
            // ball is moving down
            if (debug) console.log("dis to top", topDis);
            if (topDis < leftDis) {
              ball.vel.y *= -1;
            } else {
              ball.vel.x *= -1;
            }
          } else {
            // ball is moving up
            if (debug) console.log("dis to bottom", bottomDis);
            if (bottomDis < leftDis) {
              ball.vel.y *= -1;
            } else {
              ball.vel.x *= -1;
            }
          }
        } else {
          // ball is moving left.
          if (debug) console.log("dis to right", rightDis);
          if (ball.vel.y > 0) {
            // ball is moving down
            if (debug) console.log("dis to top", topDis);
            if (topDis < rightDis) {
              ball.vel.y *= -1;
            } else {
              ball.vel.x *= -1;
            }
          } else {
            // ball is moving up
            if (debug) console.log("dis to bottom", bottomDis);
            if (bottomDis < rightDis) {
              ball.vel.y *= -1;
            } else {
              ball.vel.x *= -1;
            }
          }
        }
        // TODO improve bounce here.
        // let diff = p5.Vector.sub(this.pos, ball.pos);
        // if (Math.abs(diff.x) > Math.abs(diff.y) * 2) {
        //   // The x distance is more than double the y, bounce x;
        //   // TODO a small margin where both bounce?
        //   ball.vel.x *= -1;
        // } else {
        //   ball.vel.y *= -1;
        // }
        return true;
      }
    }
    return false;
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

  collide(paddle) {
    if (this.claimed) {
      // Already claimed this power.
      return;
    }

    if (this.pos.y + this.size > paddle.pos.y - paddle.height) {
      let d = this.pos.x - paddle.pos.x;
      if (-paddle.width < d && d < paddle.width) {
        // Hit the paddle
        this.claim();
      }
    }
  }

  claim() {
    this.claimed = true;
    if (this.type == "newball") {
      let ball = new Ball();
      ball.pos = balls[0].pos.copy();
      ball.vel = balls[0].vel.copy();
      ball.vel.add(p5.Vector.random2D());

      balls.push(ball);
    } else if (this.type == "largerpaddle") {
      // Increase paddle size.
      paddle.width += 10;
    } else if (this.type == "smallerpaddle") {
      // Decrease paddle size.
      if (paddle.width > 20) {
        paddle.width -= 10;
      }
    } else {
      console.log("unknown power", this.type);
    }
  }

  finished() {
    if (this.claimed || this.pos.y + this.size > height) {
      return true;
    }
    return false;
  }

  show() {
    push();
    translate(this.pos.x, this.pos.y);
    stroke(255);
    strokeWeight(1);
    if (this.type == "newball") {
      fill(color(200, 0, 0));
    } else if (this.type == "largerpaddle") {
      fill(color(0, 200, 0));
    } else if (this.type == "smallerpaddle") {
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

function reset() {
  paused = true;

  balls = [new Ball()];
  paddle = new Paddle();

  powerups = [];
  bricks = [];
  for (y = 40; y <= height / 2; y += 20) {
    for (x = 40; x <= width - 40; x += 40) {
      bricks.push(new Brick(x, y));
    }
  }
}

function mouseClicked() {
  paused = false;
}

function setup() {
  createCanvas(500, 500);

  args = new URLSearchParams(location.search);

  reset();
}

function draw() {
  background(0);

  for (let brick of bricks) {
    brick.update();
    for (let ball of balls) {
      if (!brick.finished() && brick.collide(ball)) {
        if (brick.finished()) {
          rnd = random(100);
          // % chance of getting a powerup.
          if (rnd < 20 || args.get("powerup")) {
            powerup = new PowerUp(brick.pos.x, brick.pos.y);
            powerups.push(powerup);
            if (args.get("powerup")) {
              powerup.type = args.get("powerup");
            }
            console.log("Add power up", powerup.type);
          }
        }
      }
    }
    brick.show();
  }
  for (let i = bricks.length - 1; i >= 0; i--) {
    if (bricks[i].finished()) {
      bricks.splice(i, 1);
    }
  }

  if (bricks.length == 0) {
    // Level complete?
    console.log("Level complete");
    reset();
    return;
  }

  for (let ball of balls) {
    if (!paused) {
      ball.update();
      paddle.collide(ball);
    }
    ball.show();
  }

  for (let i = balls.length - 1; i >= 0; i--) {
    if (balls[i].finished()) {
      balls.splice(i, 1);
    }
  }

  if (balls.length == 0) {
    // You lose
    console.log("You lose");
    reset();
    return;
  }

  for (let powerup of powerups) {
    powerup.update();
    powerup.collide(paddle);
    powerup.show();
  }
  for (let i = powerups.length - 1; i >= 0; i--) {
    powerup = powerups[i];
    if (powerup.finished()) {
      powerups.splice(i, 1);
    }
  }


  paddle.update();
  paddle.show();
}
