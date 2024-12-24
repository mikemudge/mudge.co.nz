class Point {
  constructor(pos) {
    this.pos = pos;
    this.lerpControl = p5.Vector.random2D().mult(random(100) + 50);
  }
}

class Line {
  constructor(to, from) {
    this.to = to;
    this.from = from;
    this.debug = false;
  }

  show() {
    let a = this.from.pos.copy().add(this.from.lerpControl);
    let b = this.to.pos.copy().sub(this.to.lerpControl);

    // TODO these should get recalculated only when the points change?
    let lastPoint = null;
    for (let i = 0; i < 1; i += step) {
      let p1 = p5.Vector.lerp(this.from.pos, a, i);
      let p2 = p5.Vector.lerp(a, b, i);
      let p3 = p5.Vector.lerp(b, this.to.pos, i);

      let p4 = p5.Vector.lerp(p1, p2, i);
      let p5a = p5.Vector.lerp(p2, p3, i);

      let p6 = p5.Vector.lerp(p4, p5a, i);

      if (this.debug) {
        circle(p1.x, p1.y, 2);
        circle(p2.x, p2.y, 2);
        circle(p3.x, p3.y, 2);

        circle(p4.x, p4.y, 2);
        circle(p5a.x, p5a.y, 2);
      }
      // circle(p6.x, p6.y, 2);

      // Keep track of the last point so we can draw small segments to make the larger curved line.
      if (lastPoint) {
        // calculate a perpendicular vector.
        let c = p5.Vector.sub(p6, lastPoint);
        // Rotate 90 degrees to get perpendicular.
        c.rotate(HALF_PI);
        c.setMag(5);
        stroke('yellow');
        line(p6.x - c.x, p6.y - c.y, p6.x + c.x, p6.y +c.y);
      }
      lastPoint = p6;
    }
  }

  drawBezier() {
    let a = this.from.pos.copy().add(this.from.lerpControl);
    let b = this.to.pos.copy().sub(this.to.lerpControl);
    bezier(this.from.pos.x, this.from.pos.y, a.x, a.y, b.x, b.y, this.to.pos.x, this.to.pos.y);
  }
}

class Path {
  constructor() {
    this.points = [];
    this.lines = [];
    this.debug = false;
  }

  initRandom(length) {
    var lastPoint = new Point(createVector(random(500), random(500)));
    this.points.push(lastPoint);
    for (let i = 0; i < length; i++) {
      let p = new Point(createVector(random(500), random(500)));
      this.lines.push(new Line(p, lastPoint));
      this.points.push(p);
      lastPoint = p;
    }
  }

  drawBezier() {
  }

  show() {
    noStroke();
    strokeWeight(1);
    for (let l of this.lines) {
      l.show();
    }

    // A bezier curve is what we are manual drawing above.
    // We can also draw it here to confirm the implementation works.
    stroke('orange');
    strokeWeight(5);
    noFill();
    for (let l of this.lines) {
      l.drawBezier();
    }

    // draw the points last.
    noStroke();
    for (let p of this.points) {
      // Use white squares for the actual points.
      fill('white');
      rect(p.pos.x - 3, p.pos.y - 3, 6);

      // Use yellow and grey squares for the control lerp points.
      fill('grey');
      rect(p.pos.x + p.lerpControl.x - 3, p.pos.y + p.lerpControl.y - 3, 6);
      fill('yellow');
      rect(p.pos.x - p.lerpControl.x - 3, p.pos.y - p.lerpControl.y - 3, 6);
    }
  }
}

let step = 0.02;
let mousePos = null;
function setup() {
  let c = createCanvas(windowWidth, windowHeight - 18);

  mousePos = createVector(0, 0);

  path = new Path();
  path.initRandom(7);
  c.canvas.oncontextmenu = function() {
    return false;
  }
  window.onblur = function() {
    noLoop();
  }
  window.onfocus = function() {
    loop();
  }
}

let time = 0;
let train = 0;
let lastTrain = null;
let rotation = 0;
function drawTrain() {

  let totalPos = Math.round((path.points.length - 1) / step);
  // increment train
  time++;
  if (time % 4 === 0) {
    train = (train + 1) % totalPos;
  }

  let carrage = calculatePos((train + totalPos - 5) % totalPos);
  let p6 = calculatePos(train);

  push()
  translate(p6.x, p6.y);
  rotate(rotation);
  if (!lastTrain || p6.dist(lastTrain) > 1) {
    rotation = p6.copy().sub(lastTrain).heading();
    lastTrain = p6;
  }
  noStroke();
  fill('blue');
  triangle(-10, -5, -10, 5, 10, 0);
  pop();

  push()
  translate(carrage.x, carrage.y);
  rotate(carrage.copy().sub(lastTrain).heading());
  noStroke();
  fill('blue');
  rect(-10, -5, 20, 10);
  pop();
}

function calculatePos(train) {
  // Calculate the point and step index of the train.
  let pIndex = Math.floor(train * step);
  let sIndex = train % (1 / step);

  // Find the step
  let from = path.points[pIndex];
  let to = path.points[pIndex + 1];
  let ps = [
    from.pos,
    from.pos.copy().add(from.lerpControl),
    to.pos.copy().sub(to.lerpControl),
    to.pos
  ];

  let p1 = p5.Vector.lerp(ps[0], ps[1], sIndex * step);
  let p2 = p5.Vector.lerp(ps[1], ps[2], sIndex * step);
  let p3 = p5.Vector.lerp(ps[2], ps[3], sIndex * step);

  let p4 = p5.Vector.lerp(p1, p2, sIndex * step);
  let p5a = p5.Vector.lerp(p2, p3, sIndex * step);

  let p6 = p5.Vector.lerp(p4, p5a, sIndex * step);

  return p6;
}

function draw() {
  background(0);
  path.show();

  // draw train last so its on top of everything else.
  drawTrain();
}

let clicked = null;
let lerpPoint = null;
function mousePressed() {
  // select a point based on click.
  mousePos.set(mouseX, mouseY);
  for (let p of path.points) {
    if (mousePos.dist(p.lerpControl.copy().add(p.pos)) < 10) {
      clicked = p.lerpControl;
      lerpPoint = p;
      break;
    }
    if (mousePos.dist(p.pos) < 10) {
      clicked = p.pos;
      break;
    }
  }
}
function mouseDragged() {
  if (clicked) {
    clicked.set(mouseX, mouseY);
    if (lerpPoint) {
      clicked.sub(lerpPoint.pos);
    }
  }
}

function mouseReleased() {
  if (clicked) {
    clicked.set(mouseX, mouseY);
    if (lerpPoint) {
      clicked.sub(lerpPoint.pos);
    }
    clicked = null;
    lerpPoint = null;
  }
}
