var Shop = function(params, map) {
  this.map = map;
  this.x = params.x;
  this.y = params.y;
  this.w = this.map.gridSize * 3;
  this.h = this.map.gridSize * 2;
  this.chance = 0;
  this.trips = 0;
};

Shop.prototype.update = function() {
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

Shop.prototype.carArrive = function() {
  this.trips--;
};

Shop.prototype.newTrip = function() {
  if (this.debug) {
    console.log("New trip available at", this);
  }
  this.trips++;
  // Find a house with a car, or queue up trip.
  // Queued trips will need to be queried if roads change?

  // TODO shops connections to roads are not straight forward
  // This uses y + this.map.gridSize * 2 to connect to the road at the bottom left of the shop.
  result = this.map.find(this.x, this.y + this.map.gridSize * 2, function(loc) {
    // TODO function should be able to return "Usable path" or "Found target"?
    // Need to support available branches and early exit?
    if (loc instanceof House) {
      // TODO check house car available?
      if (loc.getAvailableCar()) {
        return true;
      }
    }
    if (loc instanceof Road) {
      return loc;
    }
    // Everything else can't be used for pathing or goal.
    return false;
  });

  if (result) {
    // Use the car to go to the shop.
    if (this.debug) {
      console.log("Requesting a car to", result.goal);
    }
    car = result.goal.getAvailableCar();
    car.setTrip(result.path, this);
  } else {
    // No house with car available.
    // Enqueue trip for the future?
    if (this.debug) {
      console.log("No car available for trip to", this);
    }
  }
};

Shop.prototype.draw = function(ctx) {
  x = this.x + 3;
  y = this.y + 3;
  w = this.w - 6;
  h = this.h - 6;
  FancyDraw.roundRect(ctx, x, y, w, h, 'red', '#CC0000');
};

Shop.prototype.debugDraw = function(ctx) {
  ctx.font = 'normal 16px serif';
  ctx.fillStyle = 'white';
  ctx.fillText("" + this.trips, this.x + this.w / 2, this.y + this.h / 2 + 5);
};

var FancyDraw = function() {};
FancyDraw.roundRect = function(ctx, x, y, w, h, col, border) {
  r = 12;
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.fillStyle = col;
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;

  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

var Factory = function(params, map) {
  this.map = map;
  this.debug = true;
  this.angle = Math.PI / 2;
  this.x = params.x;
  this.y = params.y;
  this.w = this.map.gridSize * 3;
  this.h = this.map.gridSize * 2;
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
  this.truck = new Car(this, map);
  this.truck.cargoSize = 4;
};

Factory.prototype.checkResourcesAvailable = function() {
  if (this.processing) {
    // Can't start processing if we already are.
    console.log("checkResourcesAvailable was called while already processing");
    return;
  }

  var canProcess = true;
  this.inputs.forEach(function(input) {
    need = input.amount;
    have = this.resources[input.name];
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

Factory.prototype.processComplete = function() {
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

Factory.prototype.carArrive = function(truck) {
  this.resources[truck.item] += truck.amount;
  if (!this.processing) {
    this.checkResourcesAvailable();
  }
};

Factory.prototype.update = function() {
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
    input = this.inputs[0];

    if (this.resources[input.name] > 10) {
      // We have enough resource in stock.
      // TODO customize the desired count?
      return;
    }

    console.log("Finding a truck route for", input);

    result = this.map.find(this.x, this.y + this.h, function(building) {
      if (loc instanceof Road) {
        return loc;
      }
      if (building == this) {
        return false;
      }
      if (building.resources) {
        if (building.resources[input.name]) {
          // TODO preference of how much item? E.g only request 5 of a thing or more?
          return true;
        }
      }
      return false;
    }.bind(this));

    if (result) {
      supplier = result.goal;
      if (this.debug) {
        console.log("Requesting a truck to", result.goal);
      }


      this.truck.item = input.name;
      this.truck.amount = Math.min(supplier.resources[input.name], this.truck.cargoSize);
      supplier.resources[input.name] -= this.truck.amount;

      // TODO truck is here and the path is from the supplier to here?
      this.truck.setTrip(result.path, this);
      this.truck.x = supplier.x;
      this.truck.y = supplier.y;
    }
  } else {

    // Other vehicles? Drones fly? Different cargo sizes/speeds?
    // TODO should trips be requested by need?
    // Or should factorys ship parts once they have a full load?
    // How to ensure distribution is fair/balanced?
  }
};

Factory.prototype.draw = function(ctx) {
  this.truck.draw(ctx);

  x = this.x + 3;
  y = this.y + 3;
  w = this.w - 6;
  h = this.h - 6;
  FancyDraw.roundRect(ctx, x, y, w, h, 'red', '#CC0000');
};

Factory.prototype.debugDraw = function(ctx) {
  this.truck.debugDraw(ctx);

  ctx.font = 'normal 16px serif';
  ctx.fillStyle = 'white';
  this.inputs.forEach(function(input) {
    ctx.fillText(input.name + ": " + this.resources[input.name], this.x + this.w / 2, this.y + 20);
  }.bind(this));

  ctx.fillText(this.processingTime + "/" + this.processTime, this.x + this.w / 2, this.y + this.h / 2 + 5);
  
  this.outputs.forEach(function(output) {
    ctx.fillText(output.name + ": " + this.resources[output.name], this.x + this.w / 2, this.y + this.h - 10);
  }.bind(this));
};

var House = function(params, map) {
  this.x = params.x;
  this.y = params.y;
  this.map = map;
  // TODO support changing angle?
  // And random angles?
  this.angle = Math.PI / 2;
  this.actualColor = 'red';
  this.color = params.color || this.actualColor;
  this.w = this.map.gridSize;
  this.h = this.map.gridSize;
  this.car1 = new Car(this, map);
};

House.prototype.getAvailableCar = function() {
  if (this.car1.target == null) {
    this.car1.x = this.x + this.map.gridSize / 4;
    this.car1.y = this.y + this.map.gridSize / 4;
    return this.car1;
  }
  return null;
};

House.prototype.update = function() {
  this.car1.update();
};

House.prototype.carArrive = function() {
  // Car's target is set to null meaning its already known as available.
  // Nothing else to do here.
};

House.prototype.draw = function(ctx) {
  // Draw cars first, so that houses will appear on top.
  // TODO ordering with roads might be off.
  this.car1.draw(ctx);

  x = this.x;
  y = this.y;
  w = this.w;
  h = this.h;
  ctx.beginPath();
  ctx.fillStyle = this.color;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
};

House.prototype.debugDraw = function(ctx) {
  this.car1.debugDraw(ctx);

  if (this.getAvailableCar()) {
    ctx.fillStyle = "white";
    ctx.fillText("c", this.x + 10, this.y + 15);
  }
};

var Car = function(house, map) {
  this.house = house;
  this.map = map;
  this.x = house.x + map.gridSize / 4;
  this.y = house.y + map.gridSize / 4;
  this.speed = 1.7;
  // TODO need to determine which way is the road from this house?
  this.angle = house.angle;
  this.targets = [];
  this.target = null;
};

Car.prototype.update = function() {
  if (!this.target) {
    // The house will indicate when the car should drive somewhere.
    // Until then, just sit still.
    return;
  }
  this.x += this.speed * Math.sin(this.angle);
  this.y += this.speed * Math.cos(this.angle);

  dx = this.target.x + this.target.w / 2 - this.x;
  dy = this.target.y + this.target.h / 2 - this.y;

  // Find the angle to aim for the target.
  this.angle = Math.atan2(dx, dy);

  // Store the squared distance to the target. (saves doing a sqrt every time)
  disSqr = dx * dx + dy * dy;
  if (disSqr < 9) {
    // closer than 3 px to the target, move on to next.
    // this distance needs to be relative to the speed the car can move, otherwise it overshoots
    this.target = this.getNextLocation();
  }
};

Car.prototype.returnHome = function () {
  return this.returnPath;
};

Car.prototype.setTrip = function(path, shop) {
  toShop = [];
  path.forEach(function(s) {
    toShop.push(s);
  });
  toShop.push(shop);

  returnPath = [];
  path.reverse().forEach(function(s) {
    returnPath.push(s);
  });
  returnPath.push(this.house);

  this.setPath(toShop);
  this.returnPath = returnPath;
};
Car.prototype.setPath = function(path) {
  this.targetIdx = -1;
  this.targets = path;
  this.target = this.getNextLocation();
};

Car.prototype.getNextLocation = function() {
  this.targetIdx++;
  if (this.targetIdx >= this.targets.length) {
    if (this.debug) {
      console.log('Car reached goal');
    }
    this.target.carArrive(this);
    if (this.target != this.house) {
      this.setPath(this.returnHome());
      return this.target;
    } else {
      // The car has returned home.
    }
    return null;
  }
  return this.targets[this.targetIdx];
};

Car.prototype.draw = function(ctx) {
  w = 5;
  h = 10;
  x = this.x;
  y = this.y;

  // Focus the ctx on the car, then rotate to the correct angle and undo the translation.
  // This gives the apperance of the car rotating around x,y instead of around 0, 0
  ctx.translate(x, y);
  ctx.rotate(-this.angle);
  ctx.translate(-x, -y);

  ctx.fillStyle = 'green';
  ctx.fillRect(x - w, y - h, 2 * w, 2 * h);

  // reset transform matrix to not affect any other rendering.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

Car.prototype.debugDraw = function(ctx) {
  if (this.target) {
    w = 5;
    h = 10;
    tx = this.target.x + this.target.w / 2;
    ty = this.target.y + this.target.h / 2;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'green';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
};

var Road = function(params, map) {
  this.map = map;
  this.x = params.x;
  this.y = params.y;
  this.actualColor = '#999999';
  this.color = params.color || this.actualColor;
  this.w = this.map.gridSize;
  this.h = this.map.gridSize;
};

Road.prototype.update = function() {
};

Road.prototype.draw = function(ctx) {
  x = this.x;
  y = this.y;
  w = this.w;
  h = this.h;
  ctx.beginPath();
  ctx.fillStyle = this.color;
  ctx.arc(x + w / 2, y + h / 2, this.map.gridSize / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  // Draw connections to other roads.
  // Only need to connect in half the directions as the other road piece will connect to this road.
  if (this.map.getAt(x, y - this.map.gridSize)) {
    ctx.fillRect(x + 2, y, w - 4, h / 2);
  }
  if (this.map.getAt(x - this.map.gridSize, y)) {
    ctx.fillRect(x, y + 2, w / 2, h - 4);
  }
  if (this.map.getAt(x, y + this.map.gridSize)) {
    ctx.fillRect(x + 2, y + this.map.gridSize/2, w - 4, h / 2);
  }
  if (this.map.getAt(x + this.map.gridSize, y)) {
    ctx.fillRect(x + this.map.gridSize/2, y + 2, w / 2, h - 4);
  }
  // TODO diagonals.
};

Road.prototype.debugDraw = function(ctx) {
  if (this.map.debugPathing && this.dis) {
    ctx.fillStyle = 'white';
    ctx.fillText("" + this.dis, this.x + this.map.gridSize / 2, this.y + this.map.gridSize / 2 + 5);
  }
};

var MouseControls = function(game) {
  this.game = game;
  this.map = game;
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
    "mine",
  ];

  this.enable();
};

MouseControls.prototype.update = function () {
  // Any math or anything this needs to do?
};

MouseControls.prototype.buttonClick = function(i) {
  if (i < this.buttons.length) {
    if (this.buttons[i] == "build") {
      this.buttons = this.buildButtons;
    } else if (this.buttons[i] == "road") {
      this.build = new Road({
        x: -this.game.gridSize,
        y: -this.game.gridSize,
        color: '#CCCCCC'
      }, this.map);
      this.building = "road";
    } else if (this.buttons[i] == "house") {
      this.build = new House({
        x: -this.game.gridSize,
        y: -this.game.gridSize,
      }, this.map);
      this.building = "house";
      // TODO need a build item field?
    } else if (this.buttons[i] == "delete") {
      // TODO support remove mode?
    }
  } else {
    console.log("Click on actions outside of buttons");
  }
};

MouseControls.prototype.draw = function (ctx) {
  // Check validity of road location, I.E no placement when the location is occupied.
  if (this.build != null) {
    if (this.game.isEmpty(this.build.x, this.build.y)) {
      this.build.draw(ctx);
    } else {
      // Display a not possible to build here warning?
    }
  }



  // Display resources at the top of the screen.
  ctx.font = 'normal 16px serif';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'right';
  Object.keys(this.resources).forEach(function(name, i) {
    r = this.resources[name];
    ctx.fillText(r.name + ": " + r.amount, this.game.width - 8, 20 + 15 * i);
  }.bind(this));

  ctx.closePath();


  // TODO add buttons for building new things. Not only road.
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1;
  this.buttons.forEach(function(button, i) {
    ctx.rect(0 + 50 * i, this.game.height - 50, 50, 50);
    ctx.fillText(button, 25 + 50 * i, this.game.height - 20);
  }.bind(this));
  ctx.stroke();
};

MouseControls.prototype.enable = function () {
  document.addEventListener('mousedown', this.onMouseDown.bind(this));
  document.addEventListener('mouseup', this.onMouseUp.bind(this));
  document.addEventListener('mousemove', this.onMouseMove.bind(this));
  document.addEventListener('mouseout', this.onMouseOut.bind(this));
};

MouseControls.prototype.onMouseOut = function(event) {
  // Hide the cursor road off screen.
  if (this.build == null) {
    return;
  }
  this.build.x = -this.game.gridSize;
  this.build.y = -this.game.gridSize;
};

MouseControls.prototype.onMouseDown = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  this.down = true;
};

MouseControls.prototype.onMouseMove = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  if (this.build == null) {
    return;
  }
  if (this.my > this.game.height - 50) {
    this.build.y = -this.game.gridSize;
    return;
  }
  this.build.x = Math.floor(this.mx / this.game.gridSize) * this.game.gridSize;
  this.build.y = Math.floor(this.my / this.game.gridSize) * this.game.gridSize;
  if (event.buttons) {
    // Add road while dragging the mouse.
    // TODO should make diagonals more easy?
    if (this.game.isEmpty(this.build.x, this.build.y)) {
      if (this.building == "road") {
        this.build.color = this.build.actualColor;
        this.game.addRoad(this.build);
        this.build = new Road({
          x: Math.floor(this.mx / this.game.gridSize) * this.game.gridSize,
          y: Math.floor(this.my / this.game.gridSize) * this.game.gridSize,
          color: '#CCCCCC'
        }, this.map);
      }
      // copy previous build?
    } else {
      // This happens because we are dropping roads as we move the mouse.
      // It will commonly move more than once on the same tile.
    }
  }
};

MouseControls.prototype.onMouseUp = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  if (this.my > this.game.height - 50) {
    // Click on the action bar.
    this.buttonClick(Math.floor(this.mx / 50));
    return;
  }
  if (this.build == null) {
    return;
  }
  // Finalize the location to where the mouse was released.
  this.build.x = Math.floor(this.mx / this.game.gridSize) * this.game.gridSize;
  this.build.y = Math.floor(this.my / this.game.gridSize) * this.game.gridSize;
    // Indicates that this was a left click?
  if (event.button === 0) {
    if (this.game.isEmpty(this.build.x, this.build.y)) {
      console.log("Adding " + this.building + " to map", this.build);
      this.build.color = this.build.actualColor;
      if (this.building == "road") {
        this.game.addRoad(this.build);
        this.build = new Road({
          x: Math.floor(this.mx / this.game.gridSize) * this.game.gridSize,
          y: Math.floor(this.my / this.game.gridSize) * this.game.gridSize,
          color: '#CCCCCC'
        }, this.map);
      } else {
        this.game.addBuilding(this.build);
        this.build = new House({
          x: Math.floor(this.mx / this.game.gridSize) * this.game.gridSize,
          y: Math.floor(this.my / this.game.gridSize) * this.game.gridSize,
        }, this.map);
      }
    } else {
      // Occupied location clicked, show warning?
      console.log("Can't place an object here", this.mx, this.my);
    }
  }
};


var Game = function(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.stopped = false;
  this.pause = false;
  this.debug = true;
  this.gridSize = 30;
  this.mapVersion = 0;

  this.map = [];
  for (var y = 0; y < 30; y++) {
    this.map.push([]);
    for (var x = 0; x < 50; x++) {
      this.map[y].push(null);
    }
  }

  this.roads = [];
  this.buildings = [];
  this.controls = new MouseControls(this);

  this.loadScenario();
};

Game.prototype.getAt = function(x, y) {
  x = Math.floor(x / this.gridSize);
  y = Math.floor(y / this.gridSize);
  if (y < 0 || y >= this.map.length) {
    return null;
  }
  if (x < 0 || x >= this.map[y].length) {
    return null;
  }
  return this.map[y][x];
};

Game.prototype.isEmpty = function(x, y) {
  var loc = this.getAt(x, y);
  if (loc == null) {
    return true;
  }
};

Game.prototype.addRoad = function(thing) {
  var x = thing.x;
  var y = thing.y;
  if (!x || !y) {
    throw new Error("Bad road added", thing);
  }
  // TODO support space, (I.e things which occupy multiple locations)
  for (y = thing.y / this.gridSize; y < (thing.y + thing.h) / this.gridSize; y++) {
    for (x = thing.x / this.gridSize; x < (thing.x + thing.w) / this.gridSize; x++) {
      this.map[y][x] = thing;
    }
  }
  this.roads.push(thing);
};

Game.prototype.addBuilding = function(thing) {
  var x = thing.x;
  var y = thing.y;
  // TODO support space, (I.e things which occupy multiple locations)
  for (y = thing.y / this.gridSize; y < (thing.y + thing.h) / this.gridSize; y++) {
    for (x = thing.x / this.gridSize; x < (thing.x + thing.w) / this.gridSize; x++) {
      this.map[y][x] = thing;
    }
  }
  this.buildings.push(thing);
};

Game.prototype.resetFrom = function() {
  for (var y = 0; y < 30; y++) {
    for (var x = 0; x < 50; x++) {
      if (this.map[y][x]) {
        // TODO there is likely a better way to find a path around a grid.
        this.map[y][x].from = null;
        this.map[y][x].dis = null;
      }
    }
  }
};

Game.prototype.find = function(x, y, condition) {
  this.resetFrom();
  // TODO need navigation methods?
  start = this.getAt(x, y);
  start.dis = 1;
  possibles = [start];
  while (possibles.length > 0) {
    nextPossibles = [];
    for (i=0;i<possibles.length;i++) {
      loc = possibles[i];
      // Check condition.
      res = condition(loc);
      if (res === true) {
        // Win condition, need to return the path to here.
        path = [];
        tmp = loc.from;
        while (tmp != start && path.length < 100) {
          path.push(tmp);
          tmp = tmp.from;
        }
        path.push(start);
        if (this.debugPathing) {
          console.log(path);
        }
        return {'path': path, 'goal': loc};
      }
      if (res) {
        nextSteps = [];
        // If res is truthy then we can expand through loc.
        nextSteps.push(this.getAt(loc.x + this.gridSize, loc.y));
        nextSteps.push(this.getAt(loc.x - this.gridSize, loc.y));
        nextSteps.push(this.getAt(loc.x, loc.y + this.gridSize));
        nextSteps.push(this.getAt(loc.x, loc.y - this.gridSize));

        for (ii = 0; ii < nextSteps.length; ii++) {
          if (nextSteps[ii]) {
            if (!nextSteps[ii].dis || nextSteps[ii].dis > loc.dis + 1) {
              // Track the way this location was reachable.
              nextSteps[ii].from = loc;
              nextSteps[ii].dis = loc.dis + 1;
              nextPossibles.push(nextSteps[ii]);
            }
          }
        }
      }
    }
    possibles = nextPossibles;
  }
  return null;
};

Game.prototype.loadScenario = function() {
  // Add a shop at the top left corner
  this.addBuilding(new Shop({
    x: 5 * this.gridSize,
    y: 6 * this.gridSize
  }, this));

  this.addBuilding(new Shop({
    x: 15 * this.gridSize,
    y: 6 * this.gridSize
  }, this));

  this.addBuilding(new Factory({
    x: 15 * this.gridSize,
    y: 15 * this.gridSize
  }, this));

  this.addBuilding(f = new Factory({
    inputs: [],
    outputs: [{name: 'logs', amount: 1}],
    x: 10 * this.gridSize,
    y: 5 * this.gridSize
  }, this));
  f.resources.logs = 100;

  // Connect the factorys using road.
  for (y = 7; y <= 17; y++) {
    if (y == 8) {
      continue;
    }
    this.addRoad(new Road({
      x: 10 * this.gridSize,
      y: y * this.gridSize
    }, this));
  }
  for (x = 10; x <= 15; x++) {
    this.addRoad(new Road({
      x: x * this.gridSize,
      y: 17 * this.gridSize
    }, this));
  }

  // Connect the house to the shop using road.
  for (y = 15; y <= 18; y++) {
    this.addBuilding(new House({
      x: 4 * this.gridSize,
      y: y * this.gridSize
    }, this));
    this.addBuilding(new House({
      x: 6 * this.gridSize,
      y: y * this.gridSize
    }, this));
  }

  // Connect the shops using road.
  for (x = 5; x <= 15; x++) {
    this.addRoad(new Road({
      x: x * this.gridSize,
      y: 8 * this.gridSize
    }, this));
  }

  // Connect the house to the shop using road.
  for (y = 8; y <= 18; y++) {
    this.addRoad(new Road({
      x: 5 * this.gridSize,
      y: y * this.gridSize
    }, this));
  }
};

Game.prototype.warn = function(msg) {
  // TODO add some in game messaging.
  console.log(msg);
};

Game.prototype.draw = function() {
  this.ctx.beginPath();

  // Clear the screen.
  this.ctx.fillStyle = 'black';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  this.ctx.closePath();

  // Draw a grid.
  this.ctx.beginPath();
  this.ctx.strokeStyle = 'white';
  this.ctx.lineWidth = 1;
  for (y = 0; y < 30; y++) {
    for (x = 0; x < 50; x++) {
      this.ctx.rect(x * this.gridSize, y * this.gridSize, this.gridSize, this.gridSize);
    }
  }
  this.ctx.stroke();

  // Now draw all the things in the grid, roads first and buildings/cars on top.
  this.roads.forEach(function(t) {t.draw(this.ctx);}.bind(this));
  this.buildings.forEach(function(t) {t.draw(this.ctx);}.bind(this));

  if (this.debug) {
    this.roads.forEach(function(t) {
      t.debugDraw(this.ctx);
    }.bind(this));
    this.buildings.forEach(function(t) {
      t.debugDraw(this.ctx);
    }.bind(this));
  }

  this.controls.draw(this.ctx);
};

Game.prototype.run = function() {
  // Update the game.  
  this.controls.update();
  // Update all the buildings.
  this.buildings.forEach(function(t) {
    t.update();
  }.bind(this));

  // Render the game.
  this.draw();

  if (!this.pause) {
    window.requestAnimationFrame(this.run.bind(this));
  } else {
    this.stopped = true;
    console.log('stopped game');
  }
};

Game.prototype.resize = function() {
  // TODO the bounds of the game just changed?
  // This should just be a window into the game, and not update the game size if resize happens.
  this.width = this.canvas.width;
  this.height = this.canvas.height;
};

var PauseController = function(game, $scope) {
  this.game = game;
  $scope.game = game;
  window.addEventListener('blur', function() {
    game.pause = true;
    $scope.$apply();
    // not running full
  }, false);
};

PauseController.prototype.start = function() {
  // game.start???
  this.game.pause = false;
  this.game.stopped = false;
  this.game.run();
};

function init() {
  var canvas = document.createElement('canvas');

  document.body.appendChild(canvas);
  var game = new Game(canvas);
  var resizeCanvas = function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    game.resize();
  };
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, false);
  game.run();
  return game;
}

angular.module('traffic', [
  'config',
  'ngRoute'
])
.factory('game', function() {
  return init();
})
.controller('PauseController', PauseController)
.config(function($routeProvider, config) {
  $routeProvider
    .otherwise({
      templateUrl: '/static/shared/game.tpl.html',
    });
});

