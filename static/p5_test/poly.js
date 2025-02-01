class Path {
  constructor() {
    this.points = [];
    this.debug = false;
    this.iPoints = [];
    // A bounding box for this path.
    this.min = createVector(0, 0);
    this.max = createVector(0, 0);
  }

  initRandom(length) {
    for (let i = 0; i < length; i++) {
      let p = createVector(random(500), random(500));
      this.add(p);
    }
  }

  add(p) {
    this.points.push(p.copy());
    this.updateBoundingBox();
  }

  move(x, y) {
    for (let p of this.points) {
      p.add(x, y);
    }
    // TODO we only really need to call this once after all movement is complete.
    this.updateBoundingBox();
  }

  movePoint(p, x, y) {
    p.set(mouseX, mouseY);
    // TODO we only really need to call this once after all movement is complete.
    this.updateBoundingBox();
  }

  updateBoundingBox() {
    if (this.points.length === 0) {
      this.min.set(0, 0);
      this.max.set(0, 0);
      return;
    }

    this.min.set(this.points[0]);
    this.max.set(this.points[0]);
    for (let p of this.points) {
      this.min.x = min(this.min.x, p.x);
      this.min.y = min(this.min.y, p.y);
      this.max.x = max(this.max.x, p.x);
      this.max.y = max(this.max.y, p.y);
    }
  }

  isInside(p) {
    if (p.x < this.min.x || p.x > this.max.x) {
      return false;
    }
    if (p.y < this.min.y || p.y > this.max.y) {
      return false;
    }

    // p is within the bounding box.
    let p2 = createVector(999999, p.y);
    // p2 is outside the polygon.

    let numIntersects = 0;
    this.iPoints = [];
    for(let i = 0; i < this.points.length; i++){
      let j = (i + 1) % this.points.length;

      let tmp = intersect_point(p, p2, this.points[i], this.points[j]);
      if (tmp) {
        this.iPoints.push(tmp);
        numIntersects++;
      }
    }
    console.log("Clicked with", numIntersects, "intersects to outside");
    return numIntersects % 2 === 1;
  }

  click(mousePos) {
    for (let p of this.points) {
      if (mousePos.dist(p) < 10) {
        return p;
      }
    }
  }
  showInProgress() {
    strokeWeight(16);
    stroke('darkgrey');
    for (let i = 0; i < this.points.length - 1; i++) {
      line(this.points[i].x, this.points[i].y, this.points[i + 1].x, this.points[i + 1].y);
    }

    strokeWeight(14);
    stroke('lightgrey');
    for (let i = 0; i < this.points.length - 1; i++) {
      line(this.points[i].x, this.points[i].y, this.points[i + 1].x, this.points[i + 1].y);
    }

    let stripeLength = 10;
    // TODO add some variance of length or spacing to make the start and end align nicely.
    strokeWeight(1);
    stroke('yellow');
    for (let i = 0; i < this.points.length - 1; i++) {
      let stripe = p5.Vector.sub(this.points[i + 1], this.points[i]);
      for (let d = stripeLength; d < stripe.mag() - stripeLength; d += stripeLength * 3) {
        let a = stripe.copy().setMag(d);
        let b = stripe.copy().setMag(d + stripeLength);
        a.add(this.points[i]);
        b.add(this.points[i]);
        line(a.x, a.y, b.x, b.y);
      }
    }
    this.showPoints();
  }

  connectTo(other) {
    let point = other.findCenter();

    let best = null;
    let bestDis = Number.MAX_SAFE_INTEGER;
    // find an intersection on each polygon with the min distance.
    for (let i = 0; i < this.points.length; i++) {
      // TODO find a point on the line points[i] -> points[i+1] which is closest to point.
      let ip = this.findCenter();

      let dis = p5.Vector.dist(point, ip);
      if (dis < bestDis) {
        best = [point, ip];
      }
    }

    // We don't actually need to go all the way to point?
    // Intersect with the edges of other instead?
    return best;
  }

  highlight() {
    strokeWeight(1);
    stroke('cyan');
    fill('red');

    beginShape();
    for (let p of this.points) {
      vertex(p.x, p.y);
    }
    endShape(CLOSE);
  }

  showComplete() {
    strokeWeight(1);
    stroke('cyan');
    fill(color(10, 10, 255, 128));

    beginShape();
    for (let p of this.points) {
      vertex(p.x, p.y);
    }
    endShape(CLOSE);
    this.showPoints();
  }

  showPoints() {
    // draw the points after.
    noStroke();
    fill('white');
    for (let p of this.points) {
      // Use white squares for the actual points.
      rect(p.x - 3, p.y - 3, 6);
    }

    for (let p of this.iPoints) {
      fill('orange');
      rect(p.x - 3, p.y - 3, 6);
    }

    let midPoint = this.findCenter();
    fill('green');
    rect(midPoint.x - 3, midPoint.y - 3, 6);
  }

  calculateArea() {
    var area = 0;
    for (let i = 0; i < this.points.length; i++) {
      // Using the Trapezoid formula from wikipedia.
      // https://en.wikipedia.org/wiki/Shoelace_formula#Trapezoid_formula_2
      let p = this.points[i];
      let p2 = this.points[(i + 1) % this.points.length];
      // Add the average height multiplied by the width.
      // Note this is negative in one direction, and positive in the other.
      area += (p.y + p2.y) / 2 * (p.x - p2.x);
    }
    return abs(area);
  }

  findCenter() {
    let center = createVector(0, 0);
    for (let p of this.points) {
      center.add(p);
    }
    center.mult(1 / this.points.length);
    return center;
  }
}

function intersect_point(point1, point2, point3, point4) {
  // Calculate the gradient vectors for the lines starting at point 1 and point 3.
  line1 = point2.copy().sub(point1);
  line2 = point4.copy().sub(point3);

  // The offset between where the lines start.
  let offset = point1.copy().sub(point3);
  let denominator = line2.y * line1.x - line2.x * line1.y;
  if (denominator === 0) {
    // The lines must be parallel, and therefore have no intersection point.
    return null;
  }

  let numA = line2.x * offset.y - line2.y * offset.x;
  let numB = line1.x * offset.y - line1.y * offset.x;
  let uA = numA / denominator;
  let uB = numB / denominator;

  // These values indicate where on the line the intersection occurs.
  // values between 0-1 are on the line between the points.
  // It is possible that the point falls on one line but not both.
  // This will cause a uA between 0-1 but a uB which is not.
  if (uA <= 0 || uA > 1 || uB <= 0 || uB > 1) {
    // The lines do not have an intersection between the points provided.
    return null;
  }

  // Using line1 with a magnitude from uA offset by the starting point of this line we can determine the intersection point.
  return line1.mult(uA).add(point1);
}

let polys = [];
let mousePos = null;
let hoverPoly = null
let hoverPoint = null;
function setup() {
  let c = createCanvas(windowWidth, windowHeight - 18);

  mousePos = createVector(0, 0);

  let path = new Path();
  path.initRandom(4);
  polys.push(path);
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

function draw() {
  background(0);
  for (path of polys) {
    path.showComplete();
  }
  if (buildPoly) {
    buildPoly.showInProgress();

    stroke('green');
    for (path of polys) {
      connector = buildPoly.connectTo(path);
      line(connector[0].x, connector[0].y, connector[1].x, connector[1].y);
    }
  }

  if (hoverPoly) {
    hoverPoly.highlight();

    noStroke();
    text("Area: " + hoverPoly.calculateArea(), 5, 15);
  }
  if (hoverPoint) {
    fill('red');
    rect(hoverPoint.x - 3, hoverPoint.y - 3, 6);
  }
}

let clicked = null;
let clickedPoly = null;
let buildPoly = null
function mousePressed() {
  // select a point based on click.
  mousePos.set(mouseX, mouseY);
  console.log("Click ", mousePos);
  if (buildPoly) {
    let checkFinish = buildPoly.click(mousePos);
    if (checkFinish) {
      polys.push(buildPoly);
      buildPoly = null;
    } else {
      // Add a new point to the in progress poly.
      buildPoly.add(mousePos);
    }
    return;
  }

  // If there is no poly being built we check to see if any existing one is clicked on.
  for (path of polys.reverse()) {
    // Check if a point was clicked.
    clicked = path.click(mousePos);
    if (clicked) {
      clickedPoly = path;
      break;
    }
    // Or if the entire polygon was clicked.
    if (path.isInside(mousePos)) {
      // This is a click on an existing polygon.
      clickedPoly = path;
      break;
    }
  }

  if (!clicked && !clickedPoly) {
    console.log("No poly clicked");
    // This will start a new poly.
    console.log("Starting a new poly");
    buildPoly = new Path();
    buildPoly.add(mousePos);
  }
}

function mouseMoved() {
  hoverPoint = null;
  hoverPoly = null;
  mousePos.set(mouseX, mouseY);
  for (path of polys) {
    hoverPoint = path.click(mousePos);
    if (path.isInside(mousePos)) {
      // This is a click on an existing polygon.
      hoverPoly = path;
      break;
    }
  }
}

function mouseDragged() {
  if (clicked) {
    // TODO need to update the poly here as well.
    // Otherwise min/max are not updated.
    clickedPoly.movePoint(clicked, mouseX, mouseY);
  } else if (clickedPoly) {
    // mousePos is where the mouse was previously.
    clickedPoly.move(mouseX - mousePos.x, mouseY - mousePos.y);
    mousePos.set(mouseX, mouseY);
  }
}

function mouseReleased() {
  if (clicked) {
    clicked.set(mouseX, mouseY);
    clicked = null;
  }
  clickedPoly = null;
}
