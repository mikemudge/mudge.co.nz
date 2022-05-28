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
    if (this.pos.x - this.size < 0 || this.pos.x + this.size > width) {
      this.vel.x *= -1;
    }
    if (this.pos.y - this.size < 0 || this.pos.y + this.size > height) {
      this.vel.y *= -1;
    }
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
        // TODO improve bounce here.
        let diff = p5.Vector.sub(this.pos, ball.pos);
        if (Math.abs(diff.x) > Math.abs(diff.y) * 2) {
          // The x distance is more than double the y, bounce x;
          // TODO a small margin where both bounce?
          ball.vel.x *= -1;
        } else {
          ball.vel.y *= -1;
        }
      }
    }
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

class Paddle {
  constructor() {
    this.width = 40;
    this.pos = createVector(width / 2, height - 10);
  }

  update() {
    this.pos.x = Math.max(Math.min(mouseX, width - this.width), this.width);
  }

  collide(ball) {
    if (ball.pos.y > this.pos.y) {
      let d = ball.pos.x - this.pos.x;
      if (-this.width < d && d < this.width) {
        // Hits the paddle, increase x speed based on where.
        // console.log("bounce at", d, this.width);
        ball.vel.x += d / this.width;
      }
    }
  }

  show() {
    fill(color(0, 255, 0));
    rect(this.pos.x - this.width, this.pos.y, this.width * 2, 5);
  }
}

function setup() {
  createCanvas(500, 500);

  balls = [];
  for (i = 0; i < 10; i++) {
    balls.push(new Ball());
  }
  paused = false;

  bricks = [];
  for (y = 40; y <= height / 2; y += 20) {
    for (x = 40; x <= width - 40; x += 40) {
      bricks.push(new Brick(x, y));
    }
  }

  paddle = new Paddle();
}

function draw() {
  background(0);

  for (let brick of bricks) {
    brick.update();
    for (let ball of balls) {
      brick.collide(ball);
    }
    brick.show();
  }

  for (let ball of balls) {
    ball.update();
    paddle.collide(ball);
    ball.show();
  }

  paddle.update();
  paddle.show();
}
