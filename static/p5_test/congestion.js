import {Grid} from "../p5/jslib/grid.js";
import {MapView} from "../p5/jslib/view.js";

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

  show() {
    fill(this.color);
    rectMode(CENTER);
    rotate(this.vel.heading());
    rect(0, 0, this.r * 2, this.r);
  }
}

class Square {
  show(size) {
    if (this.road) {
      noStroke();
      fill('grey');
      rect(0, 0, size, size);
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
        for (let t of e.getCardinalTiles()) {
          if (this.grid.getTile(t.x, t.y).getData()) {
            continue;
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
    this.view = view;
    this.size = view.getMapSize();
    this.time = 0;
    this.cars = [];

    this.grid = new Grid(39, 24);
    // Move the center of the view to the center of the grid its looking at.
    this.view.setGridCenter(this.grid);

    // Init road tiles.
    for (let y = 0; y < this.grid.getHeight(); y++) {
      for (let x = 0; x < this.grid.getWidth(); x++) {
        if (x % 5 === 4 || y % 5 === 4) {
          let square = new Square();
          square.road = true;
          this.grid.setTileData(x, y, square);
        }
      }
    }

    // Now setup some spawners and destinations with routes.
    this.spawners = [
      this.grid.getTile(0, 9),
      this.grid.getTile(38, 9),
      this.grid.getTile(0, 19),
      this.grid.getTile(38, 19),
      this.grid.getTile(4, 0),
      this.grid.getTile(9, 23),
      this.grid.getTile(14, 0),
      this.grid.getTile(19, 23),
      this.grid.getTile(24, 0),
      this.grid.getTile(29, 23),
      this.grid.getTile(34, 0),
    ];

    this.destinations = [];
    this.addDestination('#FF0000', this.grid.getTile(38, 4));
    this.addDestination('#FF8000', this.grid.getTile(0, 4));
    this.addDestination('#FFFF00', this.grid.getTile(38, 14));
    this.addDestination('#00FF00', this.grid.getTile(0, 14));
    this.addDestination('#00FFFF', this.grid.getTile(34, 23));
    this.addDestination('#0080FF', this.grid.getTile(29, 0));
    this.addDestination('#0000FF', this.grid.getTile(24, 23));
    this.addDestination('#8000FF', this.grid.getTile(19, 0));
    this.addDestination('#FF00FF', this.grid.getTile(14, 23));
    this.addDestination('#FF0080', this.grid.getTile(9, 0));
    this.addDestination('#800080', this.grid.getTile(4, 23));
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
    if (this.time % 300 === 1) {
      for (let spawn of this.spawners) {
        this.createNewCar(spawn);
      }
    }

    for (let car of this.cars) {
      car.update();
    }

    // Remove cars once they leave the playing area.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (this.cars[i].finished()) {
        this.cars.splice(i, 1);
      }
    }
  }

  show() {

    this.view.drawMap(this.grid);
    for (let car of this.cars) {
      this.view.show(car);
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
  }
}

let game;
let view;
export function setup() {
  view = new MapView(20);
  view.createCanvas()

  game = new CongestionGame(view);
}

export function draw() {
  background(0);

  game.update();
  game.show();
}

export function mouseWheel(event) {
  view.scale(event.delta);
}
