class ClickControl {
  constructor(game, controllable) {
    this.game = game;
    this.view = game.view;
    this.controlled = controllable;
    this.speed = 5;
  }

  end(mousePos) {
    this.game.moveToTarget(this.controlled, this.view.toGame(mousePos));
  }

  update() {

  }

  draw() {
    // Also display the hero's targeting?
    // TODO should this be part of action?
    if (this.controlled.action) {
      // Also show the targetPos for this hero.
      let v = this.view.toScreen(this.controlled.pos);
      let v2 = this.view.toScreen(this.controlled.action.pos);
      strokeWeight(2);
      stroke("green");
      line(v.x, v.y, v2.x, v2.y);
    }
  }
}

var mousePos;
var humanControls;
function setup() {
  view = new MapView(10);
  // 18px is the top div showing nav items.
  view.setScreen(windowWidth, windowHeight);
  view.createCanvas();

  logger = new Logger();
  gamemap = new GameMap(1000, 1000);
  game = new MobaGame(view, gamemap);
  window.onblur = function() {
    game.paused = true;
    noLoop();
  }

  game.init();

  humanControls = new SwipeJoystick(game, game.hero);
  humanControls.speed = game.hero.maxSpeed;
  gamemap.addControls(humanControls);

  clickControl = new ClickControl(game, game.hero);
  clickControl.speed = game.hero.maxSpeed;
  gamemap.addControls(clickControl);

  mousePos = createVector(0, 0);
  touchPos = createVector(0, 0);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  view.setScreen(windowWidth, windowHeight);
}

// Disable key controls because the view follows the hero unit.
// TODO could use keys to move the unit instead?
// function keyPressed() {
//   view.keys();
// }
//
// function keyReleased() {
//   view.keys();
// }

// TODO move this setup into the swipecontrol.js class?
// TODO handle multiple touches? Would need touchStarted, touchMoved and touchedEnded.
function mousePressed() {
  mousePos.set(mouseX, mouseY);
  logger.debug("Mouse Pressed " + mousePos.x.toFixed(2) + "," + mousePos.y.toFixed(2));
  // humanControls.start(mousePos);
}

function touchStarted() {
  touchPos.set(touches[0].x, touches[0].y);
  logger.debug("Touch Started " + numberFormat(touchPos.x) + "," + numberFormat(touchPos.y));
  humanControls.start(touchPos);
  // Avoid a mousePressed/mouseClicked event from following this.
  return false;
}

function numberFormat(num) {
  return "" + Math.round(num * 100) / 100;
}

function touchMoved() {
  touchPos.set(touches[0].x, touches[0].y);
  logger.debug("Touch Moved " + numberFormat(touchPos.x) + "," + numberFormat(touchPos.y));
  humanControls.move(touchPos);
}

function mouseDragged() {
  mousePos.set(mouseX, mouseY);
  logger.debug("Mouse Drag " + numberFormat(mousePos.x) + "," + numberFormat(mousePos.y));
  // humanControls.move(mousePos);
}

function touchEnded() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  // touches is empty/not set here, so just use the previous touchPos for "end"
  logger.debug("Touch Ended " + numberFormat(touchPos.x) + "," + numberFormat(touchPos.y));
  humanControls.end(touchPos);
}

function mouseReleased() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  // For a mouse we want to use mouse controls.
  // A "touch" which doesn't move (touchMoved) can appear just like a mouse click (pressed/released).
  mousePos.set(mouseX, mouseY);
  // logger.debug("Mouse Release " + numberFormat(mousePos.x) + "," + numberFormat(mousePos.y));
  clickControl.end(mousePos);

}

function mouseWheel(event) {
  view.scale(event.delta);
}

function draw() {
  background(0);

  game.show();

  logger.draw(windowWidth / 2 - 150, windowHeight - 160);
}
