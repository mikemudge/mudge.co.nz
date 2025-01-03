class Path {
  constructor() {
    this.points = [];
    this.debug = false;
  }

  initRandom(length) {
    for (let i = 0; i < length; i++) {
      let p = createVector(random(500), random(500));
      this.points.push(p);
    }
  }

  add(p) {
    this.points.push(p.copy());
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
}

function mouseReleased() {
  if (clicked) {
    clicked.set(mouseX, mouseY);
    clicked = null;
  }
}
