class Car {
  constructor(pos) {
    this.pos = pos;
    this.desiredSpeed = random(1,2);
    this.vel = createVector(this.desiredSpeed, 0);
    this.acc = createVector(0, 0);
    this.maxForce = 0.2
    this.r = 16;
    this.color = color(255);
  }

  update() {
    if (this.target && this.target.finished()) {
      this.target = null;
    }
    if (this.target) {
      let d = p5.Vector.dist(this.target.pos, this.pos);
      if (d < this.r * 4) {
        // brake force.
        let force = this.vel.copy().normalize().mult(-1);
        force.setMag(this.maxForce);
        this.applyForce(force);
      } else {
        // set force to desired.
        let force = createVector(this.desiredSpeed, 0);
        // This take the difference from the current velocity.
        force.sub(this.vel)
        // And limit so it doesn't go in 1 frame.
        force.limit(this.maxForce)
        this.applyForce(force);
      }
    }
    this.vel.add(this.acc);
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
