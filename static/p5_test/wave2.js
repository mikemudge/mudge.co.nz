
let angle = 0;
let angleV = 0;

function setup() {
  createCanvas(600, 600);
  angleV = TWO_PI / 300;
}

function draw() {
  background(0);

  translate(300, 300);
  fill(252, 238, 33);
  stroke(252, 238, 33);
  strokeWeight(2);

  let r = 4;
  let x = 0;
  // let x = sin(2 * angle) * 200;
  // let y = 0;
  for (x=-300; x < width; x += 10) {
    let y = sin(angle + x / width * TWO_PI) * 200;
    ellipse(x, y, r * 2);
    line(x, 0, x, y);
  }

  angle += angleV;
  // angleV += 0.0001
}
