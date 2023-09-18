class Shop {
  constructor(pos, game) {
    this.game = game;
    this.pos = pos;
    this.w = 3;
    this.h = 2;
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
    let r = size * 0.6;
    fill('red');
    strokeWeight(3);
    stroke('#CC0000');
    rect(-size + 2, -size + 2, size * this.w * 2 - 4, size * this.h * 2 - 4, r);

    if (this.debug) {
      noStroke()
      fill('white')
      textAlign(CENTER)
      text("" + this.trips, (this.w - 1) * size, (this.h - 1) * size);
    }
  };
}

class Factory {
  constructor(pos, params, game) {
    this.game = game;
    this.map = game.map;
    this.pos = pos;
    this.w = 3;
    this.h = 2;
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
      if (this.processingTime > this.processTime) {
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

      let result = this.game.find(this.pos.x, this.pos.y + this.h * 20, function(tile) {
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
    rect(-size + 2, -size + 2, size * this.w * 2 - 4, size * this.h * 2 - 4, size * 0.6);

    if (this.debug) {
      noStroke()
      fill('white')
      textAlign(CENTER)
      for (let input of this.inputs) {
        text(input.name + ": " + this.resources[input.name], (this.w - 1) * size, (this.h - 1.5) * size);
      }
      text(this.processingTime + "/" + this.processTime, (this.w - 1) * size, (this.h - .5) * size);
      for (let output of this.outputs) {
        text(output.name + ": " + this.resources[output.name], (this.w - 1) * size, (this.h + .5) * size);
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
    this.w = 1;
    this.h = 1;
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
    this.car1.pos.set(this.pos);
  }

  carArrive() {
    // Car's target is set to null meaning its already known as available.
    this.car1.pos.set(this.pos);
    this.car1.vel.set(0, 0);
  };

  show(size) {
    fill('red')
    noStroke();
    rect(-size + 1, -size + 1, size * 2 - 2, size * 2 - 2);

    if (this.debug) {
      if (this.getAvailableCar()) {
        fill('white');
        text("c", 0, 5);
      }
    }
  }
}

class Car {
  constructor(house, game) {
    this.house = house;
    this.game = game;
    this.map = game.map;
    this.pos = house.pos.copy();
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

    let road = this.target.getData().road;
    if (road) {
      this.vel = road.pos.copy().sub(this.pos);
    } else {
      // Arrived at a building.
      let building = this.target.getData().building;
      this.vel = building.pos.copy().sub(this.pos);
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
    toShop.push(this.map.getTileAtPos(shop.pos));

    let returnPath = [];
    path.reverse().forEach(function(s) {
      returnPath.push(s);
    });
    returnPath.push(this.map.getTileAtPos(this.house.pos));

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

    fill('green');
    rect(-size / 2, -size * 3/ 5, size, size / 2);

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
    this.map = game.map;
    this.pos = pos;
    this.actualColor = '#999999';
    this.color = this.actualColor;
  };

  update() {
  }

  placed() {
    this.color = '#999999';
  }

  show(size) {
    fill(this.color);
    noStroke();
    circle(0, 0, size * 2);

    let tile = this.map.getTileAtPos(this.pos);
    if (tile.north().getData() && tile.north().getData().road) {
      rect(-size, -size, 2 * size, size);
    }
    if (tile.south().getData() && tile.south().getData().road) {
      rect(-size, 0, 2 * size, size);
    }
    if (tile.west().getData() && tile.west().getData().road) {
      rect(-size, -size, size, 2 * size);
    }
    if (tile.east().getData() && tile.east().getData().road) {
      rect(0, -size, size, 2 * size);
    }
    // TODO diagonals?
  }

  debugDraw(ctx) {
    if (this.map.debugPathing && this.dis) {
      ctx.fillStyle = 'white';
      ctx.fillText("" + this.dis, this.x + this.map.gridSize / 2, this.y + this.map.gridSize / 2 + 5);
    }
  }
}

class MouseControls {
  constructor(game, view) {
    this.game = game;
    this.view = view;
    this.build = null;
  
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
    this.buttons = [
      "build",
      "delete"
    ];
    this.buildButtons = [
      "road",
      "house",
      "factory",
      "shop",
    ];
  };
  
  update () {
    // Any math or anything this needs to do?
  };
  
  buttonClick(i) {
    if (i < this.buttons.length) {
      if (this.buttons[i] === "build") {
        this.buttons = this.buildButtons;
      } else if (this.buttons[i] === "road") {
        this.build = new Road(createVector(-20, -20), this.game);
        this.build.color = '#CCCCCC';
        this.building = "road";
      } else if (this.buttons[i] === "house") {
        this.build = new House(createVector(20, 20), this.game);
        this.building = "house";
        // TODO need a build item field?
      } else if (this.buttons[i] === "shop") {
        this.build = new Shop(createVector(20, 20), this.game);
        this.building = "shop";
        this.build.color = '#CC0000';
        // TODO need a build item field?
      } else if (this.buttons[i] === "delete") {
        // TODO support remove mode?
      }
    } else {
      console.log("Click on actions outside of buttons");
    }
  };

  display() {
    if (this.build !== null) {
      if (this.game.isEmpty(this.build.pos)) {
        this.view.show(this.build);
      } else {
        // Display a not possible to build here warning?
      }
    }

    // Draw buttons overlay.

    let w = this.view.getCanvasWidth();
    let y = this.view.getCanvasHeight();

    fill('white')
    noStroke();
    textSize(14);
    textAlign(RIGHT);
    let resources = Object.keys(this.resources);
    for (let r = 0; r < resources.length; r++) {
      let resource = this.resources[resources[r]];
      text(resource.name + ": " + resource.amount, w - 8, 20 + 15 * r);
    }

    this.buttons.forEach(function(button, i) {
      stroke('white')
      noFill();
      textAlign(CENTER);
      rect(50 * i, y - 50, 50, 50);
      fill('white');
      noStroke();
      text(button, 25 + 50 * i, y - 20);
    }, this);
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
    this.down = true;
  };

  onMouseMove(mx, my, buttons) {
    this.mx = mx;
    this.my = my;
    if (this.build === null) {
      return;
    }
    if (this.my > this.game.view.getCanvasHeight() - 50) {
      this.build.pos.y = -this.game.gridSize;
      return;
    }
    // convert to game pos, then gridify.
    this.build.pos.set(this.view.toGameGrid(createVector(this.mx, this.my)));

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
    if (this.my > this.game.view.getCanvasHeight() - 50) {
      // Click on the action bar.
      this.buttonClick(Math.floor(this.mx / 50));
      return;
    }
    if (this.build === null) {
      return;
    }

    // convert to game pos, then gridify.
    this.build.pos.set(this.view.toGameGrid(createVector(this.mx, this.my)));

    // this.build.x = Math.floor(this.mx / this.game.gridSize) * this.game.gridSize;
    // this.build.y = Math.floor(this.my / this.game.gridSize) * this.game.gridSize;
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
    rect(-size, -size, size * 2, size * 2);

    if (this.road) {
      text(0, 0, "r");
    }
  }
}

class TrafficGame {
  constructor(view) {
    this.view = view;
    this.stopped = false;
    this.pause = false;
    this.debug = false;
    // TODO remove this?
    this.gridSize = view.getMapSize();
    this.mapVersion = 0;

    this.width = 50;
    this.height = 30;
    this.map = new Grid(this.width, this.height, view.getMapSize());
    // Center in the middle of the grid.
    view.setCenter(createVector(24.5 * view.getMapSize(), 14.5 * view.getMapSize()));

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
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
    // Add a shop at the top left corner
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

    let square = this.map.getTileAtPos(thing.pos).getData();
    square.road = thing;
    this.roads.push(thing);
  };

  addBuilding(thing) {
    thing.placed();

    // TODO support space, (I.e things which occupy multiple locations)
    for (var y = thing.pos.y / this.gridSize; y < thing.pos.y / this.gridSize + thing.h; y++) {
      for (var x = thing.pos.x / this.gridSize; x < thing.pos.x / this.gridSize + thing.w; x++) {
        this.map.getTile(x, y).getData().building = thing;
      }
    }
    this.buildings.push(thing);
  };

  addCar(car) {
    this.cars.push(car);
  }

  isEmpty(pos) {
    let square = this.map.getTileAtPos(pos).getData();
    return square && !square.road && !square.building;
  };

  resetFrom() {
    for (var y = 0; y < 30; y++) {
      for (var x = 0; x < 50; x++) {
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
    let start = this.map.getTileAtPos(createVector(x, y));
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

function setup() {
  view = new MapView(20);
  // 18px is the top div showing nav items.
  view.setScreen(windowWidth, windowHeight - 18);
  let w = view.getCanvasWidth();
  let h = view.getCanvasHeight();
  createCanvas(w, h);
  console.log("setting canvas size", w, h);

  game = new TrafficGame(view);

  window.onblur = function() {
    game.paused = true;
    noLoop();
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
    return;
  }
  view.keys();
}

function keyReleased() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  view.keys();
}

function mouseDragged(event) {
  if (game.paused) {
    return;
  }
  game.controls.onMouseMove(mouseX, mouseY, event.buttons);
}

function mouseMoved() {
  if (game.paused) {
    return;
  }
  game.controls.onMouseMove(mouseX, mouseY, false);
}

function mousePressed() {
  if (game.paused) {
    return;
  }
  game.controls.onMouseDown(mouseX, mouseY);
}

function mouseReleased(event) {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  game.controls.onMouseUp(mouseX, mouseY, event);
}

function mouseWheel(event) {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  view.scale(event.delta);
}

function draw() {
  background(0);

  game.update();

  game.show();
}
