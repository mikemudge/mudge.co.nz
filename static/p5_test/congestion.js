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
    // When set (e.g. 'rock', 'tree', 'building') this square can never
    // become a road, and blocks routing like any other non-road tile.
    this.obstacle = null;
  }

  addDirection(direction) {
    if (this.directions.includes(direction)) {
      return;
    }
    this.directions.push(direction);
  }

  clear() {
    if (this.obstacle) {
      // Obstacles are permanent level geometry, not player editable.
      return;
    }
    this.directions = [];
    this.road = false;
  }

  clearDirections() {
    this.directions = [];
  }

  show(size) {
    if (this.road) {
      noStroke();
      fill('grey');
      rect(0, 0, size, size);
    } else if (!this.obstacle) {
      // A subtle grid line to help line up roads while drawing them.
      noFill();
      stroke(255, 255, 255, 30);
      strokeWeight(1);
      rect(0, 0, size, size);
    }

    if (this.obstacle) {
      this.showObstacle(size);
    }

    // TODO show directions nicer?
    if (this.directions) {
      // textSize(size / 2);
      // fill('white')
      // text(this.directions, size / 4, size * 0.85);
      let mid = createVector(size / 2, size / 2);
      stroke('#FFFFFF');
      strokeWeight(1);
      fill('#FFFFFF');
      for (let d of this.directions) {
        this.drawArrow(d, size);
      }
    }
  }

  showObstacle(size) {
    push();
    noStroke();
    rectMode(CORNER);
    ellipseMode(CENTER);
    if (this.obstacle === 'tree') {
      fill('#6B4226');
      rect(size * 0.42, size * 0.45, size * 0.16, size * 0.5);
      fill('#2E7D32');
      ellipse(size / 2, size * 0.4, size * 0.85, size * 0.85);
    } else if (this.obstacle === 'building') {
      fill('#8A8A8A');
      rect(size * 0.08, size * 0.08, size * 0.84, size * 0.84);
      fill('#4A4A4A');
      rect(size * 0.2, size * 0.24, size * 0.22, size * 0.22);
      rect(size * 0.58, size * 0.24, size * 0.22, size * 0.22);
      rect(size * 0.2, size * 0.58, size * 0.22, size * 0.22);
      rect(size * 0.58, size * 0.58, size * 0.22, size * 0.22);
    } else {
      // Default to a rock.
      fill('#8D8D8D');
      ellipse(size / 2, size * 0.55, size * 0.8, size * 0.6);
      fill('#A5A5A5');
      ellipse(size * 0.4, size * 0.45, size * 0.4, size * 0.3);
    }
    pop();
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

class CongestionGame {
  constructor(view) {
    const params = new URLSearchParams(window.location.search);
    this.view = view;
    this.size = view.getMapSize();
    this.time = 0;
    this.spawnRate = params.get("spawnRate") || 100;
    this.cars = [];

    // Start in editing mode: roads can be drawn but no cars spawn. Toggling
    // to "test" mode spawns/drives cars but disables editing, so you don't
    // accidentally redraw roads while watching traffic.
    this.editing = true;
    this.modeButton = new Button("Test", this.toggleMode.bind(this));
    this.view.topMenu.addButton(this.modeButton);
    this.view.topMenu.addButton(new Button("routes", this.toggleUnreachableRoutes.bind(this)));
    this.showUnreachable = false;

    this.setupGrid(15, 10);

    let level = params.get("level");
    if (params.get("demo")) {
      this.setupDemo();
    } else if (level === "2") {
      this.setupLevel2();
    } else if (level === "3") {
      this.setupLevel3();
    } else if (level === "4") {
      this.setupLevel4();
    } else {
      this.setupLevel1();
    }
  }

  setupGrid(width, height) {
    this.grid = new Grid(width, height);
    // Move the center of the view to the center of the grid its looking at.
    this.view.setGridCenter(this.grid);
    for (let y = 0; y < this.grid.getHeight(); y++) {
      for (let x = 0; x < this.grid.getWidth(); x++) {
        let square = new Square();
        this.grid.setTileData(x, y, square);
      }
    }

    this.spawners = [];
    this.destinations = [];
    this.time = 0;
    this.cars = [];
  }

  setupDemo() {
    this.setupGrid(45, 28);

    // Init road tiles.
    for (let y = 0; y < this.grid.getHeight(); y++) {
      for (let x = 0; x < this.grid.getWidth(); x++) {
        let square = new Square();
        this.grid.setTileData(x, y, square);
        if (x % 15 === 7 || y % 15 === 7 || x % 15 === 8 || y % 15 === 8) {
          square.road = true;
          if (x % 15 === 7 && (y % 15 === 7 || y % 15 === 8)) {
            square.directions.push(0);
          }
          if (x % 15 === 8 && (y % 15 === 7 || y % 15 === 8)) {
            square.directions.push(2);
          }
          if (y % 15 === 7 && (x % 15 === 7 || x % 15 === 8)) {
            square.directions.push(1);
          }
          if (y % 15 === 8 && (x % 15 === 7 || x % 15 === 8)) {
            square.directions.push(3);
          }
        }
      }
    }

    // Now setup some destinations with routes.
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

    // Setup spawn locations
    this.addSpawner(this.grid.getTile(this.grid.getWidth() - 1, 8), 1, this.destinations)
    this.addSpawner(this.grid.getTile(this.grid.getWidth() - 1, 23), 1, this.destinations)
    this.addSpawner(this.grid.getTile(0, 7), 3, this.destinations)
    this.addSpawner(this.grid.getTile(0, 22), 3, this.destinations)

    this.addSpawner(this.grid.getTile(7, this.grid.getHeight() - 1), 0, this.destinations);
    this.addSpawner(this.grid.getTile(22, this.grid.getHeight() - 1), 0, this.destinations);
    this.addSpawner(this.grid.getTile(37, this.grid.getHeight() - 1), 0, this.destinations);
    this.addSpawner(this.grid.getTile(8, 0), 2, this.destinations);
    this.addSpawner(this.grid.getTile(23, 0), 2, this.destinations);
    this.addSpawner(this.grid.getTile(38, 0), 2, this.destinations);

  }

  setupLevel1() {
    this.addDestination('#FF0000', this.grid.getTile(this.grid.getWidth() - 1, 1));
    this.addDestination('#FF8000', this.grid.getTile(8, this.grid.getHeight() - 1));
    this.addDestination('#FFFF00', this.grid.getTile(0, 2));

    this.addSpawner(this.grid.getTile(this.grid.getWidth() - 1,  2), 3,[this.destinations[1], this.destinations[2]]);
    this.addSpawner(this.grid.getTile(7,  this.grid.getHeight() - 1), 0, [this.destinations[0], this.destinations[2]]);
    this.addSpawner(this.grid.getTile(0,  1), 1, [this.destinations[0], this.destinations[1]]);
  }

  setupLevel2() {
    // Same size grid as level 1, but with a destination/spawner on all four
    // edges instead of three.
    let top = this.addDestination('#FF0000', this.grid.getTile(7, 0));
    let right = this.addDestination('#FF8000', this.grid.getTile(this.grid.getWidth() - 1, 4));
    let bottom = this.addDestination('#FFFF00', this.grid.getTile(7, this.grid.getHeight() - 1));
    let left = this.addDestination('#00FF00', this.grid.getTile(0, 4));

    this.addSpawner(this.grid.getTile(8, 0), 2, this.allExcept(top));
    this.addSpawner(this.grid.getTile(this.grid.getWidth() - 1, 5), 3, this.allExcept(right));
    this.addSpawner(this.grid.getTile(8, this.grid.getHeight() - 1), 0, this.allExcept(bottom));
    this.addSpawner(this.grid.getTile(0, 5), 1, this.allExcept(left));
  }

  setupLevel3() {
    // A bigger grid with 5 destinations, spread out unevenly so routes are
    // less symmetric than levels 1 and 2.
    this.setupGrid(20, 14);

    let red = this.addDestination('#FF0000', this.grid.getTile(this.grid.getWidth() - 1, 2));
    let orange = this.addDestination('#FF8000', this.grid.getTile(this.grid.getWidth() - 1, 11));
    let yellow = this.addDestination('#FFFF00', this.grid.getTile(0, 3));
    let green = this.addDestination('#00FF00', this.grid.getTile(0, 10));
    let blue = this.addDestination('#00FFFF', this.grid.getTile(10, this.grid.getHeight() - 1));

    this.addSpawner(this.grid.getTile(this.grid.getWidth() - 1, 3), 3, this.allExcept(red));
    this.addSpawner(this.grid.getTile(this.grid.getWidth() - 1, 10), 3, this.allExcept(orange));
    this.addSpawner(this.grid.getTile(0, 2), 1, this.allExcept(yellow));
    this.addSpawner(this.grid.getTile(0, 11), 1, this.allExcept(green));
    this.addSpawner(this.grid.getTile(9, this.grid.getHeight() - 1), 0, this.allExcept(blue));

    // A building blocking the middle of the map, plus some scattered scenery.
    this.addObstacleRect(8, 5, 3, 3, 'building');
    this.addObstacle(this.grid.getTile(4, 7), 'rock');
    this.addObstacle(this.grid.getTile(15, 6), 'tree');
  }

  setupLevel4() {
    // The largest, hardest level: 6 destinations on a big grid.
    this.setupGrid(24, 16);

    let red = this.addDestination('#FF0000', this.grid.getTile(this.grid.getWidth() - 1, 3));
    let orange = this.addDestination('#FF8000', this.grid.getTile(this.grid.getWidth() - 1, 12));
    let yellow = this.addDestination('#FFFF00', this.grid.getTile(0, 4));
    let green = this.addDestination('#00FF00', this.grid.getTile(0, 11));
    let blue = this.addDestination('#00FFFF', this.grid.getTile(6, this.grid.getHeight() - 1));
    let purple = this.addDestination('#8000FF', this.grid.getTile(17, 0));

    this.addSpawner(this.grid.getTile(this.grid.getWidth() - 1, 4), 3, this.allExcept(red));
    this.addSpawner(this.grid.getTile(this.grid.getWidth() - 1, 11), 3, this.allExcept(orange));
    this.addSpawner(this.grid.getTile(0, 3), 1, this.allExcept(yellow));
    this.addSpawner(this.grid.getTile(0, 10), 1, this.allExcept(green));
    this.addSpawner(this.grid.getTile(7, this.grid.getHeight() - 1), 0, this.allExcept(blue));
    this.addSpawner(this.grid.getTile(16, 0), 2, this.allExcept(purple));
  }

  // Every destination other than the given one, used so spawners can send
  // cars to all destinations except their own.
  allExcept(dest) {
    return this.destinations.filter((d) => d !== dest);
  }

  toggleUnreachableRoutes() {
    this.showUnreachable = !this.showUnreachable;
  }

  toggleMode() {
    this.editing = !this.editing;
    this.modeButton.name = this.editing ? "Test" : "Edit";
    // Recalculate routes from the current roads and clear any cars, so both
    // switching to test (pick up new roads) and back to edit (clean slate)
    // start fresh.
    this.restart();
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
    return router;
  }

  // Mark a tile as permanent scenery (e.g. 'rock', 'tree', 'building') that
  // can never become a road.
  addObstacle(target, type) {
    target.getData().obstacle = type || 'rock';
  }

  // Block a rectangular area of tiles, useful for buildings or larger scenery.
  addObstacleRect(x, y, width, height, type) {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        this.addObstacle(this.grid.getTile(x + dx, y + dy), type);
      }
    }
  }

  getTile(pos) {
    return this.grid.getTile(Math.floor(pos.x / this.size), Math.floor(pos.y / this.size));
  }

  update() {
    if (this.editing) {
      // No cars spawn/move while editing roads.
      return;
    }
    this.time++;
    // Add new cars when appropriate
    if (this.time % this.spawnRate === 1) {
      for (let spawn of this.spawners) {
        this.cars.push(spawn.createNewCar());
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
    if (!this.editing) {
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
    }
  }
  mouseDrag(pos) {
    if (!this.editing) {
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
    } else if (!t.obstacle) {
      // If the mouse is within the grid, set the tiles to be roads.
      t.road = true;
    }
  }

  mouseEnd(pos) {
    if (this.view.click()) {
      // click was handled by a menu - buttons work in either mode.
      return;
    }
    if (!this.editing) {
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

    if (this.showUnreachable) {
      this.showUnreachableRoutes();
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

    for (let spawn of this.spawners) {
      this.view.show(spawn);
    }
    textSize(this.view.getSize() * 20);
    for (let dest of this.destinations) {
      this.view.showAtGridLoc(dest.target, function(size) {
        fill(dest.color);
        text("F", size / 4, size * .85);
      });
    }

    this.view.coverEdges();
  }

  // Draw a dashed line, colored to match each destination, between a spawner
  // and any destination it currently has no road route to. Toggled via the
  // "routes" button since it's off by default.
  showUnreachableRoutes() {
    strokeWeight(2);
    drawingContext.setLineDash([6, 6]);
    for (let spawn of this.spawners) {
      for (let dest of spawn.destinations) {
        if (dest.getTarget({pos: spawn.pos})) {
          // A car starting here could still make progress towards dest.
          continue;
        }
        let lineColor = color(dest.color);
        lineColor.setAlpha(200);
        stroke(lineColor);
        let from = this.view.toScreen(spawn.pos);
        let to = this.view.toScreen(createVector(dest.target.x + 0.5, dest.target.y + 0.5).mult(this.size));
        line(from.x, from.y, to.x, to.y);
      }
    }
    drawingContext.setLineDash([]);
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

  // TODO support other levels?
  // game.setupDemo();

  c.canvas.oncontextmenu = function() {
    return false;
  }

  // Stop rendering while the tab isn't visible, and pick back up on focus.
  // This is unrelated to the edit/test mode toggle.
  window.onblur = function() {
    noLoop();
  }
  window.onfocus = function() {
    loop();
  }
}

export function draw() {
  background('#1B3B1B');

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

export function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  view.setScreen(windowWidth, windowHeight);
}

export function mouseWheel(event) {
  view.scale(event.delta);
}
