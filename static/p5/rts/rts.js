import {GameMap} from './map.js'
import {Game} from './game.js'
import {MapView} from "../jslib/view.js";

let view;
let game;
let controls;
export function setup() {
  view = new MapView(10);
  var c = view.createCanvas();
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

export function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  view.setScreen(windowWidth, windowHeight);
}

export function keyPressed() {
  if (game.paused) {
    game.paused = false;
    loop();
  }
  view.keys();
}

export function keyReleased() {
  view.keys();
}

export function mouseDragged(event) {
  if (game.paused) {
    return;
  }
  controls.mouseDrag();
}

export function mouseMoved() {
  if (game.paused) {
    return;
  }
  controls.mouseMove();
}

export function mousePressed(event) {
  if (game.paused) {
    return;
  }
  controls.mouseDown();
  return false;
}

export function mouseReleased() {
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

export function mouseWheel(event) {
  if (game.paused) {
    return;
  }
  view.scale(event.delta);
}

export function draw() {
  background(0);

  game.show();
}
