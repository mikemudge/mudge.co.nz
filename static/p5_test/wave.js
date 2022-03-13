
let angle = 0;
let angleV = 0;

function setup() {
  createCanvas(400, 400);
  angleV = TWO_PI / 180;
}

function draw() {
  background(0);

  translate(200, 200);
  fill(252, 238, 33);

  // let r = 32;
  let r = 100 + sin(5 * angle) * 50;
  // let y = 0;
  let x = sin(2 * angle) * 200;
  let y = sin(3 * angle + PI) * 200;

  ellipse(x, y, r * 2);

  angle += angleV;
  // angleV += 0.0001
}
