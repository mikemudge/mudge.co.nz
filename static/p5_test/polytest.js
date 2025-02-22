
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
