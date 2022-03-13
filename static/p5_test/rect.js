
let angle = 0;
let angVel = .5;
function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(146, 83, 161);

  noStroke();
  fill(240, 99, 164)
  rectMode(CENTER);
  translate(200, 200);
  rotate(angle)
  rect(0,0, 128, 64);

  if (angVel > 0) {
    angVel -= .002;
  }
  angle += angVel;
}
