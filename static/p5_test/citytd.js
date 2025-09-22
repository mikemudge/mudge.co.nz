import {Grid} from "../p5/jslib/grid.js";
import {Button, MapView} from "../p5/jslib/view.js";


// City TD is a city builder combined with a tower defence.

// Waves of enemies will periodically attack your city.
// Strength will be based on how wealthy your city is (Variable difficulty).
// To stop them you need towers, but to power those towers you need population.
// population requires feeding, as well as other resources to help expand and grow your city.

// building resources - stones, wood -> concrete, steel.
// basic resources - food (meat, fruit, vege), clothing, tools etc.
// luxury resources - gold, jewels, beer/wine, cigars, coffee etc.
// enemy resources? - primarily obtained from defeating enemies?

// Logistics, enemies will follow paths, but workers also follow paths.
// Longer paths (mazes) will slow down enemies, but also make longer supply chains routes.
// shipment sizes are variable, but it takes population to run each shipment.
// Road type affects speed of enemies and suppliers on it. Bigger bonuses for suppliers?


// Towers consume goods to shoot at enemies, and defeating enemies provides other goods.
// Population is needed to produce, transform and supply goods.
// Population consumes goods, requires housing (bigger cities).
// Factories transform basic goods into advanced goods.

// Should there be phases? Day/Night? enemies come at night, supply runs at day?
// Avoids the path conflicts between enemies and suppliers.

// TODO buildings (rectangles) which occupy a number of grid squares? (add and remove).
// these will require a connection to a road.

// Buildings will be supply and demand points, will need a prioritisation system for logistics.
// Vehicles will make trips between locations.
// Houses will add workers.
// Workers are required to run factories, use towers, and run supply lines (from producing facilities?).

// Enemy waves come from multiple directions, and will steal resources if they are successful.
// TODO the spawn point for these should move further away as the city expands.
// We don't want a long delay before waves can be attacked, but also don't want waves which spawn within city limits?
// Use the max distance at which a significant (non road/path) building has been placed?

class WaveSpawner {
  constructor(game, townsquare) {
    // Randomly pick a direction to come from each wave.
    this.attackVec = p5.Vector.random2D();
    this.game = game;
    this.target = new MazeRouter(this.game.grid, townsquare);
  }

  update(time) {
    if (time % 5000 === 0) {
      let pos = this.attackVec.mult(this.game.getCityRange())
      this.game.addUnit(new Enemy(this.game, pos.copy(), this.target));
      // Calculate where the next wave is coming from so it can be displayed.
      this.attackVec = p5.Vector.random2D();
    }
  }

  show() {
    // TODO figure out how to display an icon at the edge of the screen to show an offscreen location?
    this.attackVec.setMag(this.game.getCityRange());
    this.attackVec.limit(windowHeight / 2 - 100);
    fill('red');
    circle(windowWidth / 2 - this.attackVec.x, windowHeight / 2 - this.attackVec.y, 10);
  }
}
class CommonUnit {
  constructor(game, pos, target) {
    this.game = game;
    this.pos = pos;
    this.vel = createVector(0, 0);
    this.maxSpeed = 2;
    this.maxForce = 0.3;
    this.size = 4;
    this.target = target;
  }

  update() {
    let pos = this.target.getTarget(this);
    if (pos) {
      // Make the unit move to the pos.
      this.applyForce(this.seek(pos));
    }

    this.pos.add(this.vel);
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
}

class Enemy extends CommonUnit {
  constructor(game, pos, target) {
    super(game, pos, target);
    this.size = 4;
    this.color = 'red';
  }

  show(size) {
    let r = this.size * size;
    fill(this.color);
    rect(-r, -r, r * 2, r * 2);
  }
}

class Car extends CommonUnit {
  constructor(game, pos) {
    super(game, pos);
    this.size = 8;
    this.color = 'green';
  }

  update() {
    super.update();

    // Cars can collide with each other (and cause traffic);
    // TODO better intersection logic for this to avoid deadlock?
    let next = this.game.grid.getTileAtPosWithSize(this.pos, this.game.size);
    if (next.getData().car && next.getData().car !== this) {
      // Can't move forward as there is already a car there.
      this.pos.sub(this.vel);
    }
  }

  finished() {
    return !this.target.getTarget(this);
  }

  show(size) {
    let r = this.size * size;
    rectMode(CENTER);
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

  clear() {
    this.directions = [];
    this.road = false;
  }

  clearDirections() {
    this.directions = [];
  }

  show(size) {
    if (!this.road) {
      // Show the grid.
      stroke('#666');
      noFill();
      rect(0, 0, size, size);
      return;
    }

    noStroke();
    fill('grey');
    rect(0, 0, size, size);

    // TODO show directions nicer?
    if (this.directions) {
      stroke('#FFFFFF');
      strokeWeight(1);
      fill('#FFFFFF');
      for (let d of this.directions) {
        this.drawArrow(d, size);
      }
    }
  }

  drawArrow(d, size) {
    let vec = p5.Vector.fromAngle(-Math.PI / 2 + Math.PI / 2 * d, size / 3);
    push();
    translate(size / 2, size / 2);
    line(0, 0, vec.x, vec.y);
    rotate(vec.heading());
    let arrowSize = size / 6;
    translate(vec.mag() - arrowSize, 0);
    triangle(0, arrowSize / 2, 0, -arrowSize / 2, arrowSize, 0);
    pop();
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

class CarSpawn {
  constructor(game, pos, direction, destinations) {
    this.game = game;
    this.pos = pos;
    this.direction = direction;
    this.destinations = destinations;
  }

  createNewCar() {
    let car = new Car(this.game, this.pos.copy());
    let dest = random(this.destinations);
    car.target = dest;
    car.color = dest.color;
    return car;
  }

  show(size) {
    textSize(size * 20);
    text("S", -6 * size, size * 7);
  }
}

class CityTdGame {
  constructor(view) {
    const params = new URLSearchParams(window.location.search);
    this.view = view;
    this.size = view.getMapSize();
    this.time = 0;
    this.spawnRate = params.get("spawnRate") || 100;
    this.cars = [];

    this.view.topMenu.addButton(new Button("restart", this.restart.bind(this)));

    this.setupGrid(100, 100);
    let townsquare = this.grid.getTile(50, 50);
    this.enemySpawn = new WaveSpawner(this, townsquare);
  }

  getCityRange() {
    // TODO this should grow as the city does.
    return 50 * this.size;
  }

  setupGrid(width, height) {
    this.grid = new Grid(width, height);
    this.grid.initWithData(Square);
    // Move the center of the view to the center of the grid its looking at.
    this.view.setGridCenter(this.grid);

    this.spawners = [];
    this.destinations = [];
    this.time = 0;
    this.cars = [];
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

  addSpawner(pos, direction, destinations) {
    let location = createVector(pos.x + 0.5, pos.y + 0.5).mult(this.size);
    this.spawners.push(new CarSpawn(this, location, direction, destinations));
    // TODO extend to the edge of the screen, need a maximum map range to extend to.
    pos.getData().road = true;
  }

  addDestination(color, target) {
    // TODO these may need to be keyed on where they are going.
    let router = new MazeRouter(this.grid, target);
    router.color = color;
    target.getData().road = true;
    this.destinations.push(router);
  }

  getTile(pos) {
    return this.grid.getTile(Math.floor(pos.x / this.size), Math.floor(pos.y / this.size));
  }

  update() {
    this.time++;
    // Add new cars when appropriate
    if (this.time % this.spawnRate === 1) {
      for (let spawn of this.spawners) {
        this.cars.push(spawn.createNewCar());
      }
    }
    this.enemySpawn.update(this.time);

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

    let t = this.clicked.getData();
    if (!t) {
      // outside of the grid.
      return;
    }
    if (mouseButton === "right") {
      this.arrowMode = false;
      if (t.directions.length > 0) {
        // remove arrows.
        t.clearDirections();
      } else {
        // remove road.
        t.clear();
      }
    } else {
      this.arrowMode = t.road;
      if (!t.road) {
        t.road = true;
      }
    }
  }
  mouseDrag(pos) {
    if (this.paused) {
      return;
    }
    this.mouse2 = pos;
    let t = this.grid.getTileAtPos(this.view.toGameGrid(pos)).getData();
    if (!t) {
      // outside of grid.
      return;
    }
    if (mouseButton === "right") {
      t.clear();
    } else if (this.arrowMode) {
      // No specific action needed for this?
      // We could determine the direction here?
    } else {
      // If the mouse is within the grid, set the tiles to be roads.
      t.road = true;
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
      // If the mouse is within the grid, set this tile to be road.
      let t = this.clicked.getData();
      // Apply change.
      let direction = this.getDirection(this.mouse2.copy().sub(this.mouse1));
      if (direction !== null) {
        t.addDirection(direction);
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
      let square = this.clicked.getData();
      if (square && direction !== null) {
        // show addition of direction to this.clicked
        this.view.showAtGridLoc(this.clicked, square.drawArrow.bind(square, direction));
      }
    }

    noStroke();
    fill('#FFFFFF');

    this.enemySpawn.show();

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

  game = new CityTdGame(view);

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
