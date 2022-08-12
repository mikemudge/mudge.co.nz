class Car {
  constructor(pos) {
    this.pos = pos;
    this.desiredSpeed = random(1,3);
    this.vel = createVector(this.desiredSpeed, 0);
    this.acc = createVector(0, 0);
    this.maxForce = 0.3
    this.r = 16;
    this.color = 'green';
    this.preferredFollowingDistance = 64;
  }

  update() {
    if (this.target && this.target.finished()) {
      this.target = null;
    }
    // Default to accelerating up to desiredSpeed.
    var brakes = false;
    if (this.target) {
      let d = p5.Vector.dist(this.target.pos, this.pos);
      if (d < this.preferredFollowingDistance) {
        // Brake when you get too close to the car in front.
        brakes = true;
      }
    }

    // set force to take you to the desired speed.
    let force = createVector(this.desiredSpeed, 0);
    force.sub(this.vel)
    force.limit(this.maxForce)

    // When braking use max force in reverse.
    if (brakes) {
        force = this.vel.copy().mult(-1);
        force.limit(this.maxForce);
        this.color = 'red'
    } else {
      this.color = 'green'
    }
    this.applyForce(force);

    this.vel.add(this.acc);
    if (this.vel.x < 0) {
      // No reversing.
      this.vel.x = 0;
    }
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  applyForce(force) {
    this.acc.add(force);
  }
  
  finished() {
    if (!this.f) {
      this.f = this.pos.x - this.r > width;
    }
    return this.f;
  }

  show() {
    fill(this.color);

    push();
    translate(this.pos.x, this.pos.y);
    rectMode(CENTER);
    rect(0, 0, this.r * 2, this.r);
    pop();
  }
}

function setup() {
  createCanvas(1000, 400);
  lastCar = new Car(createVector(-20, 200));
  cars = [lastCar];
}

function draw() {
  background(0);

  if (lastCar.pos.x > lastCar.r * 4) {
    car = new Car(createVector(-20, 200));
    car.target = lastCar;
    cars.push(car);
    lastCar = car;
  }

  for (let car of cars) {
    car.update();
    car.show();
  }

  for (let i = cars.length - 1; i >= 0; i--) {
    if (cars[i].finished()) {
      cars.splice(i, 1);
    }
  }

}
