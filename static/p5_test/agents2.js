class Agent {
  constructor(x, y, r, col) {
    this.r = r;
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    this.vel.mult(random(0.5, 2));
    this.acc = createVector(0, 0);
    this.maxSpeed = 6;
    this.maxForce = 0.4
    this.wanderTheta = 0;
    this.color= col;
    if (!this.color) {
      this.color = color(255);
    }
    this.path = [];
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);

    this.path.push(this.pos.copy());
  }

  show() {
    stroke(this.color);
    fill(this.color, 100);

    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    triangle(-this.r, -this.r / 2, -this.r, this.r / 2, this.r, 0);
    pop();

    beginShape();
    stroke(255);
    noFill()
    let lpos = null;
    for (let p of this.path) {
      if (lpos) {
        if (p5.Vector.dist(p, lpos) > this.maxSpeed * 2) {
          endShape();
          beginShape();
        }
      }
      vertex(p.x, p.y)
      lpos = p;
    }
    endShape();
  }

  edges() {
    let hitEdge = false;
    if (this.pos.x > width) {
      this.pos.x -= width;
      hitEdge = true;
    }
    if (this.pos.x < 0) {
      this.pos.x += width;
      hitEdge = true;
    }
    if (this.pos.y > height) {
      this.pos.y -= height;
      hitEdge = true;
    }
    if (this.pos.y < 0) {
      this.pos.y += height;
      hitEdge = true;
    }
  }

  applyForce(force) {
    this.acc.add(force);
  }

  pursue(agent) {
    let prediction = agent.vel.copy()
    prediction.mult(10);
    prediction.add(agent.pos)

    // fill(0,255,0)
    // circle(prediction.x, prediction.y, 10)

    return this.seek(prediction);
  }

  evade(agent) {
    return this.pursue(agent).mult(-1);
  }

  flee(target) {
    let force = this.seek(target).mult(-1);
  }

  seek(target, arrival = false) {
    let force = p5.Vector.sub(target, this.pos);
    let desiredSpeed = this.maxSpeed;
    if (arrival) {
      let slowRadius = 100;
      let dis = force.mag();
      if (dis < slowRadius) {
        desiredSpeed = map(dis, 0, slowRadius, 0, this.maxSpeed);
      }
    }
    force.setMag(desiredSpeed);
    force.sub(this.vel)
    force.limit(this.maxForce)
    return force
  }

  arrive(target) {
    return this.seek(target, true)
  }

  wander() {
    let wanderPoint = this.vel.copy()
    wanderPoint.setMag(50)
    wanderPoint.add(this.pos)

    // Changing this affects impacts the maximum turning angle.
    // This combines with the magnitude above, it should be lower to avoid 180 turns.
    let wanderRadius = 49;
    let theta = this.wanderTheta + this.vel.heading();

    let x = wanderRadius * cos(theta);
    let y = wanderRadius * sin(theta);
    wanderPoint.add(x, y);

    // change the angle around the wander circle.
    // This controls how quickly you change directions.
    this.wanderTheta += random(-.5, .5);

    let steer = wanderPoint.sub(this.pos);
    steer.setMag(this.maxForce);
    this.applyForce(steer);
  }
}

let agents;
let pursuer;
let target;
export function setup() {
  createCanvas(400, 400);
  agents = [];
  // for (let i = 0; i < 1; i++) {
  //   agents.push(new Agent(200, 200, 16));
  // }
  pursuer = new Agent(100, 100, 16)
  agents.push(pursuer);

  target = new Agent(200, 100, 16, color("#F063A4"))
  target.vel = createVector(0,0)
  // agents.push(target);
}

export function draw() {
  background(0);

  pursuer.wander();

  target.edges();
  pursuer.edges();

  for (let agent of agents) {
    agent.update();
    agent.show();
  }
}
