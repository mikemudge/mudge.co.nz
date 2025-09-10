import {NeuralNet, NeuralNetRender} from "./jslib/nn.js"

class Track {
  constructor(image) {
    this.image = image;
    this.image.loadPixels();
    this.pos = createVector(0, 0);
  }

  setPos(pos) {
    this.pos.set(pos);
  }

  getPixel(loc) {
    // scale up by 2 because the image is rendered at 50%;
    let x = (loc.x - this.pos.x) * 2;
    let y = (loc.y - this.pos.y) * 2;
    return this.image.get(x, y);
  }

  getRayDistances(car) {
    // Check angles of 45 degrees left, straight, and 45 degrees right
    let angle_offsets = [- Math.PI / 4, 0, Math.PI / 4];
    var inputs = [200, 200, 200];
    for (let [i, angle_offset] of angle_offsets.entries()) {
      for (var d = 1; d < 200; d += 5) {
        var imageData = this.getPixel(p5.Vector.fromAngle(car.angle + angle_offset, d).add(car.pos));
        if (imageData[0] > 192) {
          inputs[i] = d;
          break;
        }
      }
    }

    return inputs;
  }

  draw() {
    image(this.image, this.pos.x, this.pos.y, this.image.width / 2, this.image.height / 2);
  }
}

class Car {
  constructor(track) {
    this.track = track;
    this.enabled = true;
    this.speed = 2;
    this.angle = 0;
    this.distanceTravelled = 0;
    this.crashed = false;
    this.verbose = false;
    this.pos = createVector(0, 0);
    this.raytraceDistances = [200, 200, 200];
    this.nn = new NeuralNet(3, 5, 2);
  };

  reset(pos, angle) {
    this.crashed = false;
    this.distanceTravelled = 0;
    this.pos = pos;
    this.angle = angle;
    this.raytraceDistances = [200, 200, 200];
  }

  update() {
    if (this.crashed) {
      return;
    }

    this.raytraceDistances = this.track.getRayDistances(this);

    // This is the pixel color for that location px, pz.
    let pixel = this.track.getPixel(this.pos);
    if (pixel[0] > 192) {
      this.crashed = true;
      return;
    }

    let turnSignals = this.nn.play(this.raytraceDistances);

    if (this.verbose) {
      console.log("AI has", turnSignals);
    }

    if (turnSignals[0] > 0.5 && turnSignals[0] > turnSignals[1]) {
      // Must be more than 0.5 and more than the signal to turn right.
      this.angle -= 0.05;
    } else if (turnSignals[1] > 0.5) {
      this.angle += 0.05;
    } else {
      // Not turning
    }

    // Move forward in the direction of angle, by an amount of speed.
    this.pos.add(p5.Vector.fromAngle(this.angle, this.speed));

    this.distanceTravelled += this.speed;
  }

  draw() {

    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);

    fill(255, 0, 0);
    rect(-10, -5, 20, 10);
    pop();

    strokeWeight(1);
    stroke(0, 255, 0);
    let angle_offsets = [- Math.PI / 4, 0, Math.PI / 4];
    for (let [i, angle_offset] of angle_offsets.entries()) {
      let collide = p5.Vector.fromAngle(this.angle + angle_offset, this.raytraceDistances[i]).add(this.pos);
      line(this.pos.x, this.pos.y, collide.x, collide.y);
    }
  }
}

class CarAISim {
  constructor(track) {
    this.cars = [];
    this.track = track;
    this.track.setPos(createVector(100, 50));
    this.nnRender = new NeuralNetRender();

    var numCars = 20;
    for (let i = 0; i < numCars; i++) {
      let car = new Car(this.track);
      this.cars.push(car);
      // Put cars on the start line, with a little variation.
      car.reset(createVector(175, 280).add(p5.Vector.random2D().mult(2)), Math.PI / 2);
    }

    this.params = new URLSearchParams(window.location.search);
    this.debug = this.params.get("debug");
    this.autoplay = this.params.get("autoplay");

    if (this.debug) {
      this.cars[0].verbose = true;
    }

    this.generation = 1;
  }

  next() {
    this.generation++;

    // TODO we should have a better reward function than just distance travelled.
    this.winner = this.cars[0];
    for (let car of this.cars) {
      if (car.distanceTravelled > this.winner.distanceTravelled) {
        this.winner = car;
      }
    }

    if (this.debug) {
      console.log(this.winner, "was the best performer with distance", this.winner.distanceTravelled);
    }

    for (let car of this.cars) {
      // Restart cars to the start line, with a little variation.
      car.reset(createVector(175, 280).add(p5.Vector.random2D().mult(2)), Math.PI / 2);

      if (car !== this.winner) {
        // Copy the entire winner, or just a single feature of it.
        if (random() < 0.3) {
          car.nn.copyAll(this.winner.nn);
        } else {
          car.nn.randomCopy(this.winner.nn);
        }

        // Small chance of mutation.
        if (random() < 0.3) {
          car.nn.randomMutation();
        }
      }
    }
    // TODO NN breeding?
    // TODO modify architecture of the NN?
  }

  click(x, y) {
    if (x > 100 && y > 0 && x < 200 && y < 25) {
      // Clicked on the Next Gen button;
      this.next();
    }
  }

  draw() {
    this.track.draw();

    let allFinished = true;
    // Have the cars drive, updating their angle and position as the NN directs them.
    for (let car of this.cars) {
      car.update();
      allFinished &= car.crashed;
    }
    if (this.autoplay && allFinished) {
      this.next();
    }

    for (let car of this.cars) {
      car.draw();
    }

    fill(255);
    noStroke();
    text("Generation " + this.generation, 5, 15);

    text("Start Next Gen", 105, 15);
    noFill();
    stroke(255);
    rect(100, 0, 100, 25);

    // Display the current NN weights.
    for (var i = 0; i < 5; i++) {
      let car = this.cars[i];
      let x = 0;
      let y = 50 + 100 * i;
      stroke(255);
      noFill();
      rect(x, y, 100, 100);
      if (car.crashed) {
        noStroke();
        fill(255);
        text('Crashed ' + car.distanceTravelled, x + 5, y + 14);
      }

      this.nnRender.draw(x, y, this.cars[i].nn);
    }

  }
}

let track;
export function preload() {
  track = new Track(loadImage("/static/img/Track.jpg?v=1"));
}

let game;
export function setup() {
  createCanvas(1024, 1024);
  game = new CarAISim(track);
}

export function draw() {
  background(0);

  game.draw();
}

export function mouseClicked() {
  game.click(mouseX, mouseY);
}
