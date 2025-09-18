import {Grid} from "../p5/jslib/grid.js";
import {Button, MapView} from "../p5/jslib/view.js";

class Car {
  constructor(game, pos) {
    this.game = game;
    this.pos = pos;
    this.vel = createVector(0, 0);
    this.maxSpeed = 2;
    this.maxForce = 0.3;
    this.r = 8;
    this.color = 'green';
  }

  update() {
    // Get the map location where you are currently.
    // Get the map location you want to move to.
    // Check how much space there is for you to proceed.
    // Use this space to decide how fast to proceed.

    let pos = this.target.getTarget(this);
    // TODO collisions.
    if (pos) {
      // Make the unit move to the pos.
      this.applyForce(this.seek(pos));
    }

    this.pos.add(this.vel);
    let next = this.game.grid.getTileAtPosWithSize(this.pos, this.game.size);
    if (next.getData().car && next.getData().car !== this) {
      // Can't move forward as there is already a car there.
      this.pos.sub(this.vel);
    }
  }


  seek(target) {
    let force = p5.Vector.sub(target, this.pos);
    force.limit(this.maxSpeed);
    force.sub(this.vel);
    force.limit(this.maxForce);
    return force
  }

  applyForce(force) {
    this.vel.add(force);
  }
  
  finished() {
    return !this.target.getTarget(this);
  }

  show(size) {
    let r = this.r * size;
    rectMode(CENTER);
    rotate(this.vel.heading());
    fill(color(255,255,150,50));
    noStroke();
    // d is how far from center the light comes from.
    let d = r / 3;
    arc(r / 2, d, r * 10, r * 10, -.1, .15);
    arc(r / 2, -d, r * 10, r * 10, -.15, .1);

    // draw the car on top of the light.
    fill(this.color);
    rect(0, 0, r * 2, r);
  }
}

class Square {
  constructor() {
    this.directions = [];
  }

  addDirection(direction) {
    if (this.directions.includes(direction)) {
      return;
    }
    this.directions.push(direction);
  }
  clearDirections() {
    this.directions = [];
  }

  show(size) {
    if (this.road) {
      noStroke();
      fill('grey');
      rect(0, 0, size, size);
    }

    // TODO show directions nicer?
    if (this.directions) {
      textSize(size / 2);
      fill('white')
      text(this.directions, size / 4, size * 0.85);
    }
  }
}

class MazeRouter {
  constructor(map, target) {
    this.map = map;
    this.grid = new Grid(map.getWidth(), map.getHeight());
    this.target = target;
    this.calculate();
  }

  calculate() {
    this.grid.reset();

    this.grid.getTile(this.target.x, this.target.y).setData({"end": true});
    // Start at the target and explore the map.
    let explore = [this.target];
    while (explore.length > 0) {
      let next = [];
      for (let e of explore) {
        if (!e.getData() || !e.getData().road) {
          // Can't walk over OOB or non road tiles.
          continue;
        }
        // We know e can get to the target by following "next".
        // Now we want to consider what can reach e by iterating through its neighbours.
        for (let [d, t] of e.getCardinalTiles().entries()) {
          if (this.grid.getTile(t.x, t.y).getData()) {
            continue;
          }
          let opp = (d + 2) % 4;
          if (t.getData() && t.getData().directions.length > 0) {
            if (!t.getData().directions.includes(opp)) {
              // The square has directions, and opp is not one of them.
              continue;
            }
          }
          this.grid.getTile(t.x, t.y).setData({"next": e});
          next.push(t);
        }
      }
      explore = next;
    }
  }

  getTarget(unit) {
    let size = 20;
    let t = this.grid.getTileAtPosWithSize(unit.pos, size);
    if (!t.getData() || !t.getData().next) {
      return null;
    }
    let t2 = t.getData().next;
    // Scale up by size, and then offset to the center of the square.
    return createVector(t2.x, t2.y).mult(size).add(size / 2, size / 2);
  }
}

class CongestionGame {
  constructor(view) {
    const params = new URLSearchParams(window.location.search);
    this.view = view;
    this.size = view.getMapSize();
    this.time = 0;
    this.spawnRate = params.get("spawnRate") || 100;
    this.cars = [];

    this.grid = new Grid(45, 28);
    // Move the center of the view to the center of the grid its looking at.
    this.view.setGridCenter(this.grid);

    this.view.topMenu.addButton(new Button("restart", this.restart.bind(this)));

    this.spawners = [];
    // Init road tiles.
    for (let y = 0; y < this.grid.getHeight(); y++) {
      for (let x = 0; x < this.grid.getWidth(); x++) {
        let square = new Square();
        this.grid.setTileData(x, y, square);
        if (x % 15 === 7 || y % 15 === 7 || x % 15 === 8 || y % 15 === 8) {
          square.road = true;
          if (x % 15 === 7) {
            square.directions.push(0);
          }
          if (x % 15 === 8) {
            square.directions.push(2);
          }
          if (y % 15 === 7) {
            square.directions.push(1);
          }
          if (y % 15 === 8) {
            square.directions.push(3);
          }
        }
        if (y === 0 && x % 15 === 8) {
          this.spawners.push(this.grid.getTile(x, y));
        }
        if (y === this.grid.getHeight() - 1 && x % 15 === 7) {
          this.spawners.push(this.grid.getTile(x, y));
        }
        if (x === 0 && y % 15 === 7) {
          this.spawners.push(this.grid.getTile(x, y));
        }
        if (x === this.grid.getWidth() - 1 && y % 15 === 8) {
          this.spawners.push(this.grid.getTile(x, y));
        }
      }
    }

    // Now setup some destinations with routes.
    this.destinations = [];
    this.addDestination('#FF0000', this.grid.getTile(this.grid.getWidth() - 1, 7));
    this.addDestination('#FF8000', this.grid.getTile(this.grid.getWidth() - 1, 22));
    this.addDestination('#FFFF00', this.grid.getTile(0, 8));
    this.addDestination('#00FF00', this.grid.getTile(0, 23));

    this.addDestination('#00FFFF', this.grid.getTile(8, this.grid.getHeight() - 1));
    this.addDestination('#0080FF', this.grid.getTile(23, this.grid.getHeight() - 1));
    this.addDestination('#0000FF', this.grid.getTile(38, this.grid.getHeight() - 1));
    this.addDestination('#8000FF', this.grid.getTile(7, 0));
    this.addDestination('#FF00FF', this.grid.getTile(22, 0));
    this.addDestination('#FF0080', this.grid.getTile(37, 0));
  }

  restart() {
    // Clear all cars.
    for (let car of this.cars) {
      let b4 = this.grid.getTileAtPosWithSize(car.pos, this.size);
      b4.getData().car = null;
    }
    this.cars = [];

    // Recalculate routes.
    for (let dest of this.destinations) {
      dest.calculate();
    }

    // TODO should validate that all routes are possible before starting?
  }

  addDestination(color, target) {
    // TODO these may need to be keyed on where they are going.
    let router = new MazeRouter(this.grid, target);
    router.color = color;
    this.destinations.push(router);
  }
  getTile(pos) {
    return this.grid.getTile(Math.floor(pos.x / this.size), Math.floor(pos.y / this.size));
  }

  createNewCar(gridLoc) {
    let car = new Car(this, createVector(gridLoc.x + 0.5, gridLoc.y + 0.5).mult(this.size));
    let dest = random(this.destinations);
    car.target = dest;
    car.color = dest.color;
    this.cars.push(car);
  }

  update() {
    this.time++;
    // Add new cars when appropriate
    if (this.time % this.spawnRate === 1) {
      for (let spawn of this.spawners) {
        this.createNewCar(spawn);
      }
    }

    for (let car of this.cars) {
      let b4 = this.grid.getTileAtPosWithSize(car.pos, this.size);
      car.update();
      let after = this.grid.getTileAtPosWithSize(car.pos, this.size);
      // Update the tile which the car is associated with.
      b4.getData().car = null;
      after.getData().car = car;
    }

    // Remove cars once they leave the playing area.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (this.cars[i].finished()) {
        this.grid.getTileAtPosWithSize(this.cars[i].pos, this.size).getData().car = null;
        this.cars.splice(i, 1);
      }
    }
  }

  mouseStart(pos) {
    if (this.paused) {
      return;
    }
    this.mouse1 = pos.copy();
    this.mouse2 = pos;
    this.clicked = this.grid.getTileAtPos(this.view.toGameGrid(pos));

    if (!this.clicked.getData()) {
      // outside of the grid.
      return;
    }
    // TODO set clickMode?
    // Either directional (when tile was already a road), or road painting.
    this.arrowMode = this.clicked.getData().road;
  }

  mouseDrag(pos) {
    if (this.paused) {
      return;
    }
    this.mouse2 = pos;
    if (!this.arrowMode) {
      let t = this.grid.getTileAtPos(this.view.toGameGrid(pos));
      // If the mouse is within the grid, set the tiles to be roads.
      if (t.getData()) {
        t.getData().road = true;
      }
    }
  }

  mouseEnd(pos) {
    if (this.paused) {
      return;
    }
    if (this.view.click()) {
      // click was handled by a menu.
      return;
    }

    this.mouse2 = pos;

    if (this.arrowMode) {
      if (mouseButton === "right") {
        this.clicked.getData().clearDirections();
      } else {
        // Apply change.
        let direction = this.getDirection(this.mouse2.copy().sub(this.mouse1));
        if (direction !== null) {
          this.clicked.getData().addDirection(direction);
        }
      }
    }

    this.mouse1 = null;
    this.clicked = null;
    this.mouse2 = null;
  }


  show() {
    textAlign(LEFT);
    this.view.drawMap(this.grid);
    for (let car of this.cars) {
      this.view.show(car);
    }

    // Draw mouse actions, highlight clicked.
    if (this.arrowMode && this.clicked) {
      noFill();
      stroke('#CFCFCF')
      this.view.showAtGridLoc(this.clicked, this.view.showHighlight.bind(this.view));
      // TODO draw on "clicked" based on its current state + the direction the mouse is.
      let direction = this.getDirection(this.mouse2.copy().sub(this.mouse1));
      if (direction !== null) {
        // show addition of direction to this.clicked
        this.view.showAtGridLoc(this.clicked, function(size) {
          let dir = p5.Vector.fromAngle(- Math.PI / 2 + Math.PI / 2 * direction, size / 3);
          line(size / 2, size / 2, size / 2 + dir.x, size / 2 + dir.y);
        });
      }
    }

    noStroke();
    fill('#FFFFFF');

    textSize(this.view.getSize() * 20);
    for (let spawn of this.spawners) {
      this.view.showAtGridLoc(spawn, function(size) {
        text("S", size / 4, size * .85);
      });
    }
    for (let dest of this.destinations) {
      this.view.showAtGridLoc(dest.target, function(size) {
        fill(dest.color);
        text("F", size / 4, size * .85);
      });
    }

    this.view.coverEdges();

    // TODO can this become part of a common game class?
    if (this.paused) {
      textAlign(CENTER);
      textSize(20);
      fill('#FFFFFF');
      text("Paused!", windowWidth / 2, windowHeight / 2);
      textSize(10)
      text("Click to resume", windowWidth / 2, windowHeight / 2 + 20);
    }
  }

  getDirection(direction) {
    if (direction.mag() <= 5) {
      // ignore small directions.
      return null;
    }
    if (Math.abs(direction.x) > Math.abs(direction.y)) {
      // direction is horizontal.
      if (direction.x < 0) {
        // left
        return 3;
      } else {
        // right
        return 1;
      }
    } else {
      // direction is vertical
      if (direction.y < 0) {
        // up
        return 0;
      } else {
        // down
        return 2;
      }
    }
  }
}

let game;
let view;
let mousePos;
export function setup() {
  view = new MapView(20);
  let c = view.createCanvas();

  mousePos = createVector(0, 0);

  game = new CongestionGame(view);

  c.canvas.oncontextmenu = function() {
    return false;
  }

  window.onblur = function() {
    game.paused = true;
    noLoop();
  }
}

export function draw() {
  background(0);

  game.update();
  game.show();
}

export function mousePressed() {
  mousePos.set(mouseX, mouseY);
  game.mouseStart(mousePos);
}
export function mouseDragged() {
  mousePos.set(mouseX, mouseY);
  game.mouseDrag(mousePos);
}
export function mouseReleased() {
  mousePos.set(mouseX, mouseY);
  game.mouseEnd(mousePos);
}

export function mouseClicked() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
}

export function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  view.setScreen(windowWidth, windowHeight);
}

export function mouseWheel(event) {
  view.scale(event.delta);
}
