class Path {
  constructor() {
    this.points = [];
    this.debug = false;
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
    this.min.x = min(this.min.x, p.x);
    this.min.y = min(this.min.y, p.x);
    this.max.x = max(this.max.x, p.x);
    this.max.y = max(this.max.y, p.x);
  }

  move(x, y) {
    for (let p of this.points) {
      p.add(x, y);
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
    for(let i = 0; i < this.points.length; i++){
      let j = (i + 1) % this.points.length;

      if (intersect(p, p2, this.points[i], this.points[j])) {
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
  show2() {
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
  }

  show(inProgress) {
    if (inProgress) {
      this.show2();
      return;
    }
    strokeWeight(1);
    stroke('cyan');
    if (inProgress) {
      noFill();
    } else {
      fill('blue');
    }

    beginShape();
    for (let p of this.points) {
      vertex(p.x, p.y);
    }
    if (inProgress) {
      endShape(OPEN)
    } else {
      endShape(CLOSE)
    }

    // draw the points after.
    noStroke();
    fill('white');
    for (let p of this.points) {
      // Use white squares for the actual points.
      rect(p.x - 3, p.y - 3, 6);
    }
  }
}

function intersect(line0p0, line0p1, line1p0, line1p1){
  let line0dir0 = isClockwiseFromLine(line0p0, line0p1, line1p0);
  let line0dir1 = isClockwiseFromLine(line0p0, line0p1, line1p1);

  if(line0dir0 !== line0dir1){
    let line1dir0 = isClockwiseFromLine(line1p0, line1p1, line0p0);
    let line1dir1 = isClockwiseFromLine(line1p0, line1p1, line0p1);
    return line1dir0 !== line1dir1;
  }
  else{
    return false;
  }
}
function isClockwiseFromLine(linep0, linep1, p){
  let vec1 = p5.Vector.sub(linep0, linep1);
  let vec2 = p5.Vector.sub(p, linep1);

  let a = vec1.angleBetween(vec2);

  return a < 0;
}

let polys = [];
let mousePos = null;
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
    path.show();
  }
  if (buildPoly) {
    buildPoly.show(true);
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
    clicked = buildPoly.click(mousePos);
  }
  if (!clicked && !buildPoly) {
    // Check for clicks on existing completed polygons.
    for (path of polys) {
      clicked = path.click(mousePos);
      if (clicked) {
        break;
      }
      if (path.isInside(mousePos)) {
        // This is a click on an existing polygon.
        clickedPoly = path;
        return;
      }
    }
  }

  if (clicked) {
    if (buildPoly) {
      // Close the loop, add the poly to the completed set.
      // TODO should check if the clicked point was the start of the loop.
      polys.push(buildPoly);
      buildPoly = null;
    } else {
      // clicked can be moved by dragging, nothing to do here.
    }
  } else {
    if (!buildPoly) {
      console.log("Starting a new poly");
      buildPoly = new Path();
    }
    buildPoly.add(mousePos);
  }
}
function mouseDragged() {
  if (clicked) {
    clicked.set(mouseX, mouseY);
  }
  if (clickedPoly) {
    // mousePos is where the mouse originally clicked.
    clickedPoly.move(mouseX - mousePos.x, mouseY - mousePos.y);
    mousePos.set(mouseX, mouseY);
  }
}

function mouseReleased() {
  if (clicked) {
    clicked.set(mouseX, mouseY);
    clicked = null;
  }
}
