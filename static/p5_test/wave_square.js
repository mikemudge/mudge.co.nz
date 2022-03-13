
class Wave {
  constructor(amplitude, period, phase) {
    this.amplitude = amplitude;
    this.period = period;
    this.phase = phase;
  }

  update() {
    this.phase += 10;
  }

  calculate(x) {
    return sin(this.phase / this.period + TWO_PI * x / this.period) * this.amplitude;
  }

  show() {

  }
}

function setup() {
  createCanvas(600, 400);
  waves = [];
  for (i = 1; i < 10; i++) {
    harmonic = 2 * i - 1;
    waves.push(new Wave(200 / harmonic, 600 / harmonic, 0));
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
