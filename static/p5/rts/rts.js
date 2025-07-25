function setup() {
  view = new MapView(10);
  c = view.createCanvas();
  // Disable right click on the canvas so we can use it for the game.
  c.canvas.oncontextmenu = function() {
    return false;
  }

  let gamemap = new GameMap(1000, 1000);
  game = new Game(view, gamemap);
  controls = game.humanControls;
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
  controls.mouseDrag();
}

function mouseMoved() {
  if (game.paused) {
    return;
  }
  controls.mouseMove();
}

function mousePressed(event) {
  if (game.paused) {
    return;
  }
  controls.mouseDown();
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
  controls.click();
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
