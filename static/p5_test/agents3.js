class Agent {
  constructor(x, y, r, col) {
    this.r = r;
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    this.vel.mult(random(0.5, 2));
    this.acc = createVector(0, 0);
    this.maxSpeed = 4;
    this.maxForce = 0.1
    this.wanderTheta = 0;
    this.color= col;
    if (!this.color) {
      this.color = color(255);
    }
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  show() {
    noStroke();
    fill(this.color, 100);

    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    triangle(-this.r, -this.r / 2, -this.r, this.r / 2, this.r, 0);
    pop();
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

  follow(path) {
    let future = this.vel.copy();
    future.mult(20);
    future.add(this.pos);

    fill(255, 0, 0)
    circle(future.x, future.y, 16)

    // Calculate the distance to path
    let target = vectorProjection(path.start, future, path.end);

    fill(0, 255, 0)
    circle(target.x, target.y, 16)

    let d = p5.Vector.dist(future, target);

    if (d < path.radius) {
      // This is good. No change
      return createVector(0, 0)
    } else {
      return this.seek(target);
    }
  }
}

function vectorProjection(pos, a, b) {
  let v1 = p5.Vector.sub(a, pos)
  let v2 = p5.Vector.sub(b, pos)
  v2.normalize();
  let sp = v1.dot(v2);
  v2.mult(sp);
  v2.add(pos)
  return v2;
}

class Path {
  constructor(x1, y1, x2, y2) {
    this.start = createVector(x1, y1);
    this.end = createVector(x2, y2);
    this.radius = 20;
  }

  show() {
    stroke(255);
    strokeWeight(2);
    line(this.start.x, this.start.y, this.end.x, this.end.y);

    stroke(255, 100);
    strokeWeight(this.radius * 2);
    line(this.start.x, this.start.y, this.end.x, this.end.y);
  }
}

let agents;
let vehicle;
let path;

export function setup() {
  createCanvas(400, 400);
  agents = [];
  vehicle = new Agent(100, 100, 16)
  vehicle.vel = createVector(1, 0);
  agents.push(vehicle);

  path = new Path(0, 200, 400, 200)
}

export function draw() {
  background(0);

  // path.end.x = mouseX;
  path.end.y = mouseY;

  let force = vehicle.follow(path);
  vehicle.applyForce(force);

  path.show();

  for (let agent of agents) {
    agent.edges();
    agent.update();
    agent.show();
  }
}
