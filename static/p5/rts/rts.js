function include(source) {
  console.log("Should load", source);
}

include("static/p5/rts/units.js");
include("static/p5/rts/buildings.js");
include("static/p5/rts/actions.js");
include("static/p5/rts/game.js");

function setup() {
  view = new MapView(40);
  c = view.createCanvas();
  // Disable right click on the canvas so we can use it for the game.
  c.canvas.oncontextmenu = function() {
    return false;
  }

  game = new Game(view);
  window.onblur = function() {
    game.paused = true;
    noLoop();
  }
  window.onfocus = function() {
    game.paused = false;
    loop();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  view.setScreen(windowWidth, windowHeight - 18);
}

function keyPressed() {
  if (game.paused) {
    game.paused = false;
    loop();
  }
  view.keys();
}

function keyReleased() {
  view.keys();
}

function mouseDragged(event) {
  if (game.paused) {
    return;
  }
  game.controls.mouseDrag();
}

function mouseMoved() {
  if (game.paused) {
    return;
  }
  game.controls.mouseMove();
}

function mousePressed(event) {
  if (game.paused) {
    return;
  }
  game.controls.mouseDown();
  return false;
}

function mouseReleased() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  if (view.click()) {
    return;
  }
  game.controls.click();
}

function mouseWheel(event) {
  if (game.paused) {
    return;
  }
  view.scale(event.delta);
}

function draw() {
  background(0);

  game.show();
}
