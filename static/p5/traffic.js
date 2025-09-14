import {ButtonMenu, DisplayMenu, MapView} from "./jslib/view.js";
import {Grid} from "./jslib/grid.js";

class Shop {
  constructor(pos, game) {
    this.game = game;
    this.pos = pos;
    this.w = 60;
    this.h = 40;
    this.chance = 0;
    this.trips = 0;
    this.debug = true;
    this.debugConsole = false;
  }

  placed() {
  }

  update() {
    // Add a trip with increasing chance.
    // Means its unlikely to have trips close together, but also unlikely to have them too far apart.
    if (Math.random() < this.chance) {
      // Add trip.
      this.chance = 0;
      this.newTrip();
    } else {
      // Make it very slightly more likely to happen.
      this.chance += 0.0001;
    }
  };

  carArrive() {
    this.trips--;
  };

  newTrip() {
    if (this.debugConsole) {
      console.log("New trip available at", this);
    }
    this.trips++;
    // Find a house with a car, or queue up trip.
    // Queued trips will need to be queried if roads change?

    // TODO shops connections to roads are not straight forward
    // This uses y + this.map.gridSize * 2 to connect to the road at the bottom left of the shop.
    // TODO routing for a destination should be the responsibility of the destination?
    let result = this.game.find(this.pos.x, this.pos.y + 40, function(tile) {
      let square = tile.getData();
      if (!square) {
        return;
      }

      // TODO function should be able to return "Usable path" or "Found target"?
      // Need to support available branches and early exit?
      if (square.building instanceof House) {
        // TODO check house car available?
        if (square.building.getAvailableCar()) {
          return true;
        }
      }
      if (square.road) {
        return tile;
      }
      // Everything else can't be used for pathing or goal.
      return false;
    });

    if (result) {
      // Use the car to go to the shop.
      if (this.debugConsole) {
        console.log("Requesting a car to", result.goal);
      }
      let car = result.goal.getData().building.getAvailableCar();
      car.setTrip(result.path, this);
    } else {
      // No house with car available.
      // Enqueue trip for the future?
      if (this.debugConsole) {
        console.log("No car available for trip to", this);
      }
    }
  };

  show(size) {
    let r = size * 0.3;
    fill('red');
    strokeWeight(3);
    stroke('#CC0000');
    rect(2, 2, size * this.w - 4, size * this.h - 4, r);

    if (this.debug) {
      noStroke()
      fill('white')
      textAlign(CENTER)
      text("" + this.trips, this.w * size / 2 - 2, this.h * size / 2 + 5);
    }
  };
}

class Factory {
  constructor(pos, params, game) {
    this.game = game;
    this.map = game.map;
    this.pos = pos;
    this.w = 60;
    this.h = 40;
    // Needs input resources to produce an output resource.
    // Also needs workers from houses.
    this.inputs = params.inputs || [{name: "logs", amount: 1}];
    this.outputs = params.outputs || [{name: "wood", amount: 1}];
    this.processTime = 100;
    this.processingTime = 0;
    this.resources = params.resources || {
      "logs": 0,
      "wood": 0
    };
    this.debug = true;
    this.debugConsole = false;
  };

  placed() {
    this.truck = new Car(this, this.game);
    this.truck.cargoSize = 4;
    this.game.addCar(this.truck);
  }

  checkResourcesAvailable() {
    if (this.processing) {
      // Can't start processing if we already are.
      console.log("checkResourcesAvailable was called while already processing");
      return;
    }
  
    var canProcess = true;
    this.inputs.forEach(function(input) {
      let need = input.amount;
      let have = this.resources[input.name];
      if (need > have) {
        canProcess = false;
      }
    }.bind(this));
    if (canProcess) {
      // Consume the resources.
      this.inputs.forEach(function(input) {
        this.resources[input.name] -= input.amount;
      }.bind(this));
      this.processing = true;
      this.processingTime = 0;
    } else {
      // TODO if we can't process, can we order more of the resource?
      // Or are we just waiting for shipment?
    }
  };
  
  processComplete() {
    // Reset the timer.
    this.processingTime = 0;
    this.processing = false;
  
    // Update how much of the output we have.
    this.outputs.forEach(function(output) {
      this.resources[output.name] += output.amount;
    }.bind(this));
  
    // Complete, see if we can continue processing
    this.checkResourcesAvailable();
  };
  
  carArrive(truck) {
    this.resources[truck.item] += truck.amount;
    if (!this.processing) {
      this.checkResourcesAvailable();
    }
  };
  
  update() {
    if (this.processing) {
      this.processingTime++;
      if (this.processingTime >= this.processTime) {
        this.processComplete();
      }
    }
  
    if (this.truck.target) {
        // The truck for this factory is out getting resources.
        // TODO multiple trucks?
        this.truck.update();
    } else if (this.inputs.length > 0 && this.truck.target == null) {
      // The truck is available.
  
      // TODO support more items.
      let input = this.inputs[0];
  
      if (this.resources[input.name] > 10) {
        // We have enough resource in stock.
        // TODO customize the desired count?
        return;
      }

      if (this.debugConsole) {
        console.log("Finding a truck route for", input);
      }

      let result = this.game.find(this.pos.x, this.pos.y + this.h, function(tile) {
        let square = tile.getData();
        if (!square) {
          return false;
        }
        if (square.road) {
          return tile;
        }
        if (square.building === this) {
          return false;
        }
        if (square.building && square.building.resources) {
          if (square.building.resources[input.name]) {
            // TODO preference of how much item? E.g only request 5 of a thing or more?
            return true;
          }
        }
        return false;
      }.bind(this));

      if (this.debugConsole && !result) {
        console.log("No route for", input);
      }
      if (result) {
        let supplier = result.goal.getData().building;
        if (this.debugConsole) {
          console.log("Requesting a truck to", result.goal);
        }
  
        this.truck.item = input.name;
        this.truck.amount = Math.min(supplier.resources[input.name], this.truck.cargoSize);
        supplier.resources[input.name] -= this.truck.amount;
  
        // TODO truck is here and the path is from the supplier to here?
        this.truck.setTrip(result.path, this);
        this.truck.pos.set(supplier.pos);
      }
    } else {
  
      // Other vehicles? Drones fly? Different cargo sizes/speeds?
      // TODO should trips be requested by need?
      // Or should factorys ship parts once they have a full load?
      // How to ensure distribution is fair/balanced?
    }
  };

  show(size) {
    fill('red');
    strokeWeight(3);
    stroke('#CC0000');
    rect(2, 2, size * this.w - 4, size * this.h - 4, size * 0.3);

    // Show processing
    if (this.processTime) {
      stroke('white');
      strokeWeight(1);
      noFill()
      rect(0, 0, this.w * size, 5);
      fill('white');
      noStroke();
      rect(0, 0, this.w * size * this.processingTime / this.processTime, 5);
    }

    if (this.debug) {
      noStroke()
      fill('white')
      textAlign(CENTER)
      for (let input of this.inputs) {
        text(input.name + ": " + this.resources[input.name], this.w * size / 2, 15);
      }
      text(this.processingTime + "/" + this.processTime, this.w * size / 2, this.h * size * 3 / 6 + 8);
      for (let output of this.outputs) {
        text(output.name + ": " + this.resources[output.name], this.w * size / 2, this.h * size - 2);
      }
    }
  }
}

class House {
  constructor(pos, game) {
    this.pos = pos;
    this.game = game;
    this.actualColor = 'red';
    this.color = this.actualColor;
    this.w = game.gridSize;
    this.h = game.gridSize;
    // TODO should have a singular connected road as a start point for pathing.
    this.debug = true;
  }

  getAvailableCar() {
    if (this.car1 && this.car1.target == null) {
      return this.car1;
    }
    return null;
  };

  update() {
    this.car1.update();
  };

  placed() {
    this.color = 'red';
    // Create and add a car to the game.
    this.car1 = new Car(this, this.game);
    this.game.addCar(this.car1);
    this.car1.pos.set(this.pos).add(10, 10);
  }

  carArrive() {
    // Car's target is set to null meaning its already known as available.
    this.car1.pos.set(this.pos).add(10, 10);
    this.car1.vel.set(0, 0);
  };

  show(size) {
    fill('red')
    noStroke();
    rect(1, 1, size * 20 - 2, size * 20 - 2);

    if (this.debug) {
      if (this.getAvailableCar()) {
        fill('white');
        text("c", size * 10 + 2, size * 10 + 5);
      }
    }
  }
}

class Car {
  constructor(house, game) {
    this.house = house;
    this.game = game;
    this.size = game.gridSize;
    this.map = game.map;
    this.pos = house.pos.copy().add(this.size / 2, this.size / 2);
    this.vel = createVector(0, 0);
    this.maxSpeed = 1.7;
    this.targets = [];
    this.target = null;
  }

  update() {
    if (!this.target) {
      // The house will indicate when the car should drive somewhere.
      // Until then, just sit still.
      return;
    }

    let currentTile = this.target.getData();
    if (currentTile.building) {
      // Arrived at a building.
      this.vel = currentTile.building.pos.copy().add(this.size / 2, this.size / 2).sub(this.pos);
    } else {
      // Assume its a road (or was when the route was planned).
      this.vel = createVector(this.target.x + .5, this.target.y + .5).mult(this.size).sub(this.pos);
    }
    if (this.vel.magSq() < 9) {
      this.target = this.getNextLocation();
    }
    // Limit the velocity to the max speed.
    this.vel.limit(this.maxSpeed);
    this.angle = this.vel.heading();
    this.pos.add(this.vel);
  };

  returnHome () {
    return this.returnPath;
  }

  setTrip(path, shop) {
    let toShop = [];
    path.forEach(function(s) {
      toShop.push(s);
    });
    toShop.push(this.map.getTileAtPosWithSize(shop.pos, this.size));

    let returnPath = [];
    path.reverse().forEach(function(s) {
      returnPath.push(s);
    });
    returnPath.push(this.map.getTileAtPosWithSize(this.house.pos, this.size));

    this.setPath(toShop);
    this.returnPath = returnPath;
  }

  setPath(path) {
    this.targetIdx = -1;
    this.targets = path;
    this.target = this.getNextLocation();
  }

  getNextLocation() {
    this.targetIdx++;
    if (this.targetIdx < this.targets.length) {
      return this.targets[this.targetIdx];
    }
    if (this.debug) {
      console.log('Car reached goal');
    }
    this.target.getData().building.carArrive(this);
    if (this.target.getData().building !== this.house) {
      this.setPath(this.returnHome());
      return this.target;
    } else {
      // The car has returned home.
    }
    return null;
  };

  show(size) {
    push();
    // Translate is already done by the view, but we need to rotate the car to draw it facing in the right direction.
    rotate(this.vel.heading());

    // By drawing the car off to the side, it appears to be driving on the side of the road.
    // TODO we can do better than this though?
    if (this.game.car) {
      image(this.game.car, -size * 5, - size * 15 / 2, size * 10, size * 5);
    } else {
      fill('green');
      rect(-size * 5, - size * 15 / 2, size * 10, size * 5);
    }

    pop();
  }

  debugDraw() {
    if (this.target) {
      stroke('green');
      strokeWidth(1);
      // TODO need to convert to view space?
      let screenPos = this.view.toScreen(this.pos);
      line(screenPos.x, screenPos.y, this.target.x, this.target.y);
    }
  }
}

class Road {
  constructor(pos, game) {
    this.game = game;
    this.map = game.map;
    this.r = 10;
    this.pos = pos;
    this.actualColor = '#999999';
    this.color = this.actualColor;
  }

  update() {
  }

  placed() {
    this.color = '#999999';
  }

  show(size) {
    fill(this.color);
    noStroke();
    circle(size * this.r, size * this.r, size * this.r * 2);

    let tile = this.map.getTileAtPosWithSize(this.pos, this.game.gridSize);
    if (tile.north().getData() && tile.north().getData().road) {
      rect(0, 0, size * this.r * 2, size * this.r);
    }
    if (tile.south().getData() && tile.south().getData().road) {
      rect(0, size * this.r, size * this.r * 2, size * this.r);
    }
    if (tile.west().getData() && tile.west().getData().road) {
      rect(0, 0, size * this.r, size* this.r * 2);
    }
    if (tile.east().getData() && tile.east().getData().road) {
      rect(size * this.r, 0, size * this.r, size* this.r * 2);
    }
    // TODO diagonals?
  }
}

class MouseControls {
  constructor(game, view) {
    this.game = game;
    this.view = view;
    this.build = null;
    this.mousePos = createVector(0, 0);
  
    this.resources = {
      "wood": {
        amount: 100,
        name: "Wood"
      },  
      "concrete": {
        amount: 100,
        name: "Concrete"
      }
    };

    this.menu = new ButtonMenu();
    this.view.addBottomMenu(this.menu);

    // Build a menu for actions.
    let buildMenu = this.menu.registerSubMenu("build");
    let closure = this.buttonClick.bind(this);
    buildMenu.addButton("road", closure);
    buildMenu.addButton("house", closure);
    buildMenu.addButton("factory", closure);
    buildMenu.addButton("shop", closure);

    this.menu.addButton("delete", function() {
      console.log("delete clicked");
      this.bulldoze = true;
      this.build = null;
    }.bind(this));

    this.view.topMenu = new DisplayMenu(this.showResources.bind(this));
  };
  
  update () {
    // Any math or anything this needs to do?
  };

  buttonClick(buttonName) {
    console.log("clicked button", buttonName, this.game);
    this.building = buttonName;
    this.bulldoze = false;
    if (buttonName === "road") {
      this.build = new Road(createVector(-20, -20), this.game);
      this.build.color = '#CCCCCC';
    } else if (buttonName === "house") {
      this.build = new House(createVector(20, 20), this.game);
    } else if (buttonName === "shop") {
      this.build = new Shop(createVector(20, 20), this.game);
      this.build.color = '#CC0000';
    }
  }

  display() {
    if (this.bulldoze) {
      this.view.showAtPos({show: function(size) {
        fill('#CC0000');
        textSize(size * 20);
        text("X");
      }}, this.mousePos);
    }
    if (this.build !== null) {
      if (this.game.isEmpty(this.build.pos)) {
        this.view.show(this.build);
      } else {
        // Display a not possible to build here warning?
      }
    }
  }

  showResources() {
    // TODO the menu should known the size it can occupy?
    let w = this.view.getCanvasWidth();

    fill('white')
    noStroke();
    textSize(14);
    textAlign(RIGHT);
    let resources = Object.keys(this.resources);
    for (let r = 0; r < resources.length; r++) {
      let resource = this.resources[resources[r]];
      text(resource.name + ": " + resource.amount, w - 8, 20 + 15 * r);
    }
  }

  onMouseOut(event) {
    // Hide the cursor road off screen.
    if (this.build == null) {
      return;
    }
    this.build.x = -this.game.gridSize;
    this.build.y = -this.game.gridSize;
  };
  
  onMouseDown(mx, my) {
    this.mx = mx;
    this.my = my;
    this.mousePos.set(mx, my);
    this.down = true;
  };

  onMouseMove(mx, my, buttons) {
    this.mx = mx;
    this.my = my;
    this.mousePos.set(mx, my);
    if (this.build === null) {
      return;
    }
    if (this.my > this.game.view.getCanvasHeight() - 50) {
      this.build.pos.y = -this.game.gridSize;
      return;
    }
    // convert to game pos, then gridify.
    this.build.pos.set(this.view.toGameSnappedToGrid(createVector(this.mx, this.my)));

    // this.build.x = Math.floor(this.mx / this.game.gridSize) * this.game.gridSize;
    // this.build.y = Math.floor(this.my / this.game.gridSize) * this.game.gridSize;
    if (buttons) {
      // Add road while dragging the mouse.
      // TODO should make diagonals more easy?
      if (this.game.isEmpty(this.build.pos)) {
        if (this.building === "road") {
          this.build.color = this.build.actualColor;
          this.game.addRoad(this.build);
          this.build = new Road(this.build.pos.copy(), this.game);
          this.build.color = '#CCCCCC';
        }
        // copy previous build?
      } else {
        // This happens because we are dropping roads as we move the mouse.
        // It will commonly move more than once on the same tile.
      }
    }
  };
  
  onMouseUp(mx, my, event) {
    this.mx = mx;
    this.my = my;
    this.mousePos.set(mx, my);
    if (this.view.click(mx, my)) {
      // Click was consumed by the view
      return;
    }
    if (this.bulldoze) {
      // Remove at current location.
      let pos = this.view.toGameGrid(createVector(this.mx, this.my));
      let tile = this.game.map.getTileAtPos(pos).getData();
      game.removeRoad(tile);
      game.removeBuilding(tile);
      // TODO delete causes routing issues which break the game
      return;
    }
    if (this.build === null) {
      return;
    }

    // convert to game pos, then gridify.
    this.build.pos.set(this.view.toGameSnappedToGrid(createVector(this.mx, this.my)));

    // Indicates that this was a left click?
    if (event.button === 0) {
      if (this.game.isEmpty(this.build.pos)) {
        console.log("Adding " + this.building + " to map", this.build);
        if (this.building) {
          if (this.building === "road") {
            this.game.addRoad(this.build);
            this.build = new Road(this.build.pos.copy(), this.game);
          } else {
            this.game.addBuilding(this.build);
            if (this.building === "house") {
              this.build = new House(this.build.pos.copy(), this.game);
            } else if (this.building === "shop") {
              this.build = new Shop(this.build.pos.copy(), this.game);
            }
          }
        }
      } else {
        // Occupied location clicked, show warning?
        console.log("Can't place an object here", this.mx, this.my);
      }
    }
  };
}

class Square {
  constructor() {
    this.road = null;
    this.building = null;
  }

  show(size) {
    stroke("white");
    noFill();
    rect(0, 0, size, size);
  }
}

class TrafficGame {
  constructor(view) {
    this.view = view;
    this.pause = false;
    this.debug = false;
    this.gridSize = 20;
    this.mapVersion = 0;

    this.width = 50;
    this.height = 30;
    this.map = new Grid(this.width, this.height);

    for (let y = 0; y < this.map.getHeight(); y++) {
      for (let x = 0; x < this.map.getWidth(); x++) {
        let square = new Square();
        this.map.setTileData(x, y, square);
      }
    }

    this.roads = [];
    this.buildings = [];
    this.cars = [];
    this.controls = new MouseControls(this, view);

    this.loadScenario();
  };

  loadScenario() {
    // Add a shop in the top left corner
    this.addBuilding(new Shop(createVector(100, 120), this));

    this.addBuilding(new Shop(createVector(300, 120), this));

    this.addBuilding(new Factory(createVector(300, 300), {}, this));

    let f = new Factory(createVector(200, 100), {
      inputs: [],
      outputs: [{name: 'logs', amount: 1}]
    }, this);
    // Add some logs
    f.resources.logs = 100;
    this.addBuilding(f);

    // Connect the factorys using road.
    for (let y = 7; y <= 17; y++) {
      if (y === 8) {
        continue;
      }
      this.addRoad(new Road(createVector(200, y * 20), this));
    }
    for (let x = 10; x <= 15; x++) {
      this.addRoad(new Road(createVector(x * 20, 340), this));
    }

    // Connect the house to the shop using road.
    for (let y = 15; y <= 18; y++) {
      this.addBuilding(new House(createVector(80, y * 20), this));
      this.addBuilding(new House(createVector(120, y * 20), this));
    }

    // Connect the shops using road.
    for (let x = 5; x <= 15; x++) {
      this.addRoad(new Road(createVector(x * 20, 160), this));
    }

    // Connect the house to the shop using road.
    for (let y = 8; y <= 18; y++) {
      this.addRoad(new Road(createVector(100, y * 20), this));
    }
  };

  addRoad(thing) {
    thing.placed();

    let square = this.map.getTileAtPosWithSize(thing.pos, this.gridSize).getData();
    square.road = thing;
    this.roads.push(thing);
  };

  addBuilding(thing) {
    thing.placed();

    let tiles = this.map.getRect(thing.pos.copy().div(this.gridSize), createVector(thing.w, thing.h).div(this.gridSize));
    for (let tile of tiles) {
      tile.getData().building = thing;
    }
    this.buildings.push(thing);
  };

  removeRoad(tile) {
    if (tile.road) {
      this.roads = this.roads.filter((r) => r !== tile.road);
      tile.road = null;
    }
  }
  removeBuilding(tile) {
    if (tile.building) {
      this.buildings = this.buildings.filter((b) => b !== tile.building);

      let tiles = this.map.getRect(tile.building.pos.copy().div(this.gridSize), createVector(tile.building.w, tile.building.h).div(this.gridSize));
      for (let t of tiles) {
        t.getData().building = null;
      }
    }
  }

  addCar(car) {
    this.cars.push(car);
  }

  isEmpty(pos) {
    let square = this.map.getTileAtPosWithSize(pos, this.gridSize).getData();
    return square && !square.road && !square.building;
  };

  resetFrom() {
    for (var y = 0; y < this.map.getHeight(); y++) {
      for (var x = 0; x < this.map.getWidth(); x++) {
        let square = this.map.getTile(x, y).getData();
        if (square) {
          // TODO there is likely a better way to find a path around a grid.
          square.from = null;
          square.dis = null;
        }
      }
    }
  };

  find(x, y, condition) {
    this.resetFrom();
    // TODO need navigation methods?
    let start = this.map.getTileAtPos(createVector(x, y).div(this.gridSize));
    start.getData().dis = 1;
    let possibles = [start];
    while (possibles.length > 0) {
      let nextPossibles = [];
      for (let loc of possibles) {
        let currDis = loc.getData().dis;
        let res = condition(loc);
        if (res === true) {
          // Goal condition found, need to return the path to here.
          let path = [];
          let tmp = loc.getData().from;
          while (tmp !== start && path.length < 100) {
            path.push(tmp);
            tmp = tmp.getData().from;
          }
          path.push(start);
          if (this.debugPathing) {
            console.log(path);
          }
          return {'path': path, 'goal': loc};
        }
        // Handle successful path.
        if (res) {
          // Get the 4 tiles around this one.
          let nextSteps = loc.getCardinalTiles();
          for (let next of nextSteps) {
            let square = next.getData();
            if (!square) {
              continue;
            }
            // If it doesn't have a dis or the dis is longer than the current path we update it.
            if (!square.dis || square.dis > square.dis + 1) {
              square.from = loc;
              square.dis = currDis + 1;
              nextPossibles.push(next);
            }
          }
        }
      }
      possibles = nextPossibles;
    }
    return null;
  }

  warn(msg) {
    // TODO add some in game messaging.
    console.log(msg);
  };

  setCarModel(car) {
    this.car = car;
  }

  show() {
    this.view.draw(this.map);

    for (let road of this.roads) {
      this.view.show(road);
    }
    // Draw cars on top of roads, but under buildings.
    for (let car of this.cars) {
      this.view.show(car);
    }
    for (let building of this.buildings) {
      this.view.show(building);
    }

    this.view.coverEdges(this.debug);

    this.controls.display();
  }

  update() {
    this.controls.update();

    for (let building of this.buildings) {
      building.update();
    }

    this.view.update();
  }
}

let carImage;
export function preload() {
  carImage = loadImage('/static/img/traffic/red_car.svg');
}

let view;
let game;
export function setup() {
  view = new MapView(20);
  view.createCanvas();

  game = new TrafficGame(view);
  game.setCarModel(carImage);

  // Center in the middle of the grid.
  // TODO game.grid?
  view.setCenter(createVector(25 * view.getMapSize(), 15 * view.getMapSize()));


  window.onblur = function() {
    game.paused = true;
    noLoop();
  }
  window.onfocus = function() {
    game.paused = false;
    loop();
  }
}

export function draw() {
  background(0);

  game.update();

  game.show();
}

export function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  view.setScreen(windowWidth, windowHeight);
}

export function keyPressed() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  view.keys();
}

export function keyReleased() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  view.keys();
}

export function mouseDragged(event) {
  if (game.paused) {
    return;
  }
  game.controls.onMouseMove(mouseX, mouseY, event.buttons);
}

export function mouseMoved() {
  if (game && game.paused) {
    return;
  }
  game.controls.onMouseMove(mouseX, mouseY, false);
}

export function mousePressed() {
  if (game.paused) {
    return;
  }
  game.controls.onMouseDown(mouseX, mouseY);
}

export function mouseReleased(event) {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  game.controls.onMouseUp(mouseX, mouseY, event);
}

export function mouseWheel(event) {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  view.scale(event.delta);
}
