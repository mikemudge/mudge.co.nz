
class Wave {
  constructor(amplitude, period, phase) {
    this.amplitude = amplitude;
    this.period = period;
    this.phase = phase;
  }

  update() {
    this.phase += 0.05;
  }

  calculate(x) {
    return sin(this.phase + TWO_PI * x / this.period) * this.amplitude;
  }

  show() {

  }
}

function setup() {
  createCanvas(600, 400);
  waves = [];
  for (i = 0; i < 5; i++) {
    waves.push(new Wave(random(20, 80), random(100, 600), random(0, TWO_PI)));
  }
}

function draw() {
  background(0);

  for (let wave of waves) {
    wave.update();
  }

  fill(255);
  noStroke();

  let r = 6;
  let x = 0;
  // let x = sin(2 * angle) * 200;
  // let y = 0;
  for (x=0; x < width; x += 10) {
    let y = height / 2;
    for (let wave of waves) {
      y += wave.calculate(x);
    }

    ellipse(x, y, r * 2);
  }
}
