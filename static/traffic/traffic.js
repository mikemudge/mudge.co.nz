var Shop = function(params, map) {
  this.map = map;
  this.x = params.x;
  this.y = params.y;
  this.w = 60;
  this.h = 40;
  this.chance = 0;
}

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
}

Shop.prototype.newTrip = function() {
  console.log("New trip available at", this)
  // Find a house with a car, or queue up trip.
  // Queued trips will need to be queried if roads change?

  // TODO shops connections to roads are not straight forward
  // This uses y + 40 to connect to the road at the bottom left of the shop.
  result = this.map.find(this.x, this.y + 40, function(loc) {
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
    // TODO a path should be available from find?
    console.log("Requesting a car from", result.goal);
    result.goal.startTrip(this, result.path);
  } else {
    // No house with car available.
    // Enqueue trip for the future?
    console.log("No car available for trip to", this);
  }
}

Shop.prototype.draw = function(ctx) {
  x = this.x + 3;
  y = this.y + 3;
  w = this.w - 6;
  h = this.h - 6;
  r = 12;
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.fillStyle = 'red';
  ctx.strokeStyle = '#CC0000';
  ctx.lineWidth = 3;

  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
  ctx.fill()
  ctx.stroke();
  ctx.lineWidth = 1;
}

var House = function(params, map) {
  this.x = params.x;
  this.y = params.y;
  // TODO support changing angle?
  // And random angles?
  this.angle = Math.PI / 2;
  this.color = params.color || 'red';
  this.w = 20;
  this.h = 20;
  this.car1 = new Car(this, map);
}

House.prototype.getAvailableCar = function() {
  if (this.car1.target == null) {
    return this.car1;
  }
  return null;
}

House.prototype.startTrip = function(shop, path) {
  // TODO should use better pathing.
  returnPath = [];
  path.forEach(function(s) {
    returnPath.push(s);
  });
  returnPath.push(shop);
  path.reverse().forEach(function(s) {
    returnPath.push(s)
  });
  returnPath.push(this);
  console.log(returnPath);
  this.getAvailableCar().setPath(returnPath);
}

House.prototype.update = function() {
  this.car1.update();
}

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
  ctx.fillRect(x + 1, y + 1, 18, 18);
}

var Car = function(house, map) {
  this.house = house;
  this.map = map;
  this.x = house.x;
  this.y = house.y;
  this.speed = 1;
  // TODO need to determine which way is the road from this house?
  this.angle = house.angle;
  this.targets = [];
  this.target = null;
}

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
}

Car.prototype.setPath = function(path) {
  this.targetIdx = -1;
  this.targets = path;
  this.target = this.getNextLocation();
}

Car.prototype.getNextLocation = function() {
  this.targetIdx++;
  if (this.targetIdx >= this.targets.length) {
    console.log('Car reached goal');
    // TODO should inform target that it has been reached?
    // Shops will remove a trip.
    // Houses will increase cars available count.
    return null;
  }
  return this.targets[this.targetIdx];
}

Car.prototype.draw = function(ctx) {
  w = 5;
  h = 10;
  x = this.x + w;
  y = this.y + h;

  // Focus the ctx on the car, then rotate to the correct angle and undo the translation.
  // This gives the apperance of the car rotating around x,y instead of around 0, 0
  ctx.translate(x, y);
  ctx.rotate(-this.angle);
  ctx.translate(-x, -y);

  ctx.fillStyle = 'green';
  ctx.fillRect(x - w, y - h, 2 * w, 2 * h);

  // reset transform matrix to not affect any other rendering.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

var Road = function(params, map) {
  this.map = map;
  this.x = params.x;
  this.y = params.y;
  this.color = params.color || '#999999';
  this.w = 20;
  this.h = 20;
}

Road.prototype.update = function() {
}

Road.prototype.draw = function(ctx) {
  x = this.x;
  y = this.y;
  w = this.w;
  h = this.h;
  ctx.beginPath();
  ctx.fillStyle = this.color;
  ctx.arc(x + w / 2, y + h / 2, 9, 0, Math.PI * 2);
  ctx.fill();

  // Draw connections to other roads.
  // Only need to connect in half the directions as the other road piece will connect to this road.
  if (this.map.getAt(x, y - 20)) {
    ctx.fillRect(x + 2, y - 10, w - 4, h);
  }
  if (this.map.getAt(x - 20, y)) {
    ctx.fillRect(x - 10, y + 2, w, h - 4);
  }
  // TODO diagonals.

}

var MouseControls = function(game) {
  this.game = game;
  this.map = game;
  this.road = new Road({
    x: -20,
    y: -20,
    color: '#CCCCCC'
  }, this.map);
  this.enable();
}

MouseControls.prototype.update = function () {
  // Any math or anything this needs to do?
}

MouseControls.prototype.draw = function (ctx) {
  // Check validity of road location, I.E no placement when the location is occupied.
  if (this.game.isEmpty(this.road.x, this.road.y)) {
    this.road.draw(ctx);
  } else {
    // Display a not possible to build here warning?
  }
}

MouseControls.prototype.enable = function () {
  document.addEventListener('mousedown', this.onMouseDown.bind(this));
  document.addEventListener('mouseup', this.onMouseUp.bind(this));
  document.addEventListener('mousemove', this.onMouseMove.bind(this));
  document.addEventListener('mouseout', this.onMouseOut.bind(this));
}

MouseControls.prototype.onMouseOut = function(event) {
  // Hide the cursor road off screen.
  this.road.x = -20;
  this.road.y = -20;
}

MouseControls.prototype.onMouseDown = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  this.down = true;
}

MouseControls.prototype.onMouseMove = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  this.road.x = Math.floor(this.mx / 20) * 20;
  this.road.y = Math.floor(this.my / 20) * 20;
  if (event.buttons) {
    // Add road while dragging the mouse.
    // TODO should make diagonals more easy?
    if (this.game.isEmpty(this.road.x, this.road.y)) {
      console.log("Adding road to map", this.road);
      this.game.addRoad(this.road);
      this.road.color = '#999999';
      this.road = new Road({
        x: Math.floor(this.mx / 20) * 20,
        y: Math.floor(this.my / 20) * 20,
        color: '#CCCCCC'
      }, this.map);
    } else {
      // Can't connect a road to here. Should stop adding road now?
    }
  }
}

MouseControls.prototype.onMouseUp = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  // Finalize the location to where the mouse was released.
  this.road.x = Math.floor(this.mx / 20) * 20
  this.road.y = Math.floor(this.my / 20) * 20
    // Indicates that this was a left click?
  if (event.button === 0) {
    if (this.game.isEmpty(this.road.x, this.road.y)) {
      console.log("Adding road to things", this.road);
      this.game.addRoad(this.road);
      this.road.color = '#999999';
      this.road = new Road({
        x: Math.floor(this.mx / 20) * 20,
        y: Math.floor(this.my / 20) * 20,
        color: '#CCCCCC'
      }, this.map);
    } else {
      // Occupied location clicked, show warning?
    }
  }
}


var Game = function(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.stopped = false;
  this.pause = false;
  this.gridSize = 20;
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
}

Game.prototype.isEmpty = function(x, y) {
  var loc = this.getAt(x, y);
  if (loc == null) {
    return true;
  }
}

Game.prototype.addRoad = function(thing) {
  var x = thing.x;
  var y = thing.y;
  // TODO support space, (I.e things which occupy multiple locations)
  for (y = thing.y / this.gridSize; y < (thing.y + thing.h) / this.gridSize; y++) {
    for (x = thing.x / this.gridSize; x < (thing.x + thing.w) / this.gridSize; x++) {
      this.map[y][x] = thing;
    }
  }
  this.roads.push(thing);
}

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
}

Game.prototype.resetFrom = function() {
  for (var y = 0; y < 30; y++) {
    for (var x = 0; x < 50; x++) {
      if (this.map[y][x]) {
        // TODO there is likely a better way to find a path around a grid.
        this.map[y][x].from = null;
      }
    }
  }
}

Game.prototype.find = function(x, y, condition) {
  this.resetFrom();
  // TODO need navigation methods?
  start = this.getAt(x, y);
  possibles = [
    this.getAt(x + this.gridSize, y),
    this.getAt(x - this.gridSize, y),
    this.getAt(x, y + this.gridSize),
    this.getAt(x, y - this.gridSize),
  ];
  possibles.forEach(function(p) {
    if (p) {
      p.from = start;
    }
  });
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
        console.log(path)
        return {'path': path, 'goal': loc};
      }
      if (res) {
        nextSteps = [];
        // If res is truthy then we can expand through loc.
        nextSteps.push(this.getAt(loc.x + this.gridSize, loc.y))
        nextSteps.push(this.getAt(loc.x - this.gridSize, loc.y))
        nextSteps.push(this.getAt(loc.x, loc.y + this.gridSize))
        nextSteps.push(this.getAt(loc.x, loc.y - this.gridSize))

        for (i = 0; i < nextSteps.length; i++) {
          if (nextSteps[i]) {
            if (!nextSteps[i].from) {
              // Track the way this location was reachable.
              nextSteps[i].from = loc;
              nextPossibles.push(nextSteps[i]);
            }
          }
        }
      }
    }
    possibles = nextPossibles;
  }
  return null;
}

Game.prototype.loadScenario = function() {
  // Add a shop at the top left corner
  this.addBuilding(new Shop({
    x: 100,
    y: 120
  }, this));

  this.addBuilding(new House({
    x: 80,
    y: 300
  }, this));
  this.addBuilding(new House({
    x: 120,
    y: 300
  }, this));

  // Connect the house to the shop using road.
  for (y = 160; y <= 300; y+= this.gridSize) {
    this.addRoad(new Road({
      x: 100,
      y: y
    }, this));
  }
}

Game.prototype.warn = function(msg) {
  // TODO add some in game messaging.
  console.log(msg);
}

Game.prototype.draw = function() {
  this.ctx.beginPath();

  // Clear the screen.
  this.ctx.fillStyle = 'black';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  this.ctx.closePath();

  // Draw a grid.
  this.ctx.beginPath();
  this.ctx.strokeStyle = 'white';
  for (y = 0; y < 30; y++) {
    for (x = 0; x < 50; x++) {
      this.ctx.rect(x * this.gridSize, y * this.gridSize, this.gridSize, this.gridSize);
    }
  }
  this.ctx.stroke();

  // Now draw all the things in the grid, roads first and buildings/cars on top.
  this.roads.forEach(function(t) {t.draw(this.ctx)}.bind(this));
  this.buildings.forEach(function(t) {t.draw(this.ctx)}.bind(this));

  this.controls.draw(this.ctx);
}

Game.prototype.run = function() {
  // Update the game.  
  this.controls.update();
  // Update all the buildings.
  this.buildings.forEach(function(t) {t.update()}.bind(this));

  // Render the game.
  this.draw();

  if (!this.pause) {
    window.requestAnimationFrame(this.run.bind(this));
  } else {
    this.stopped = true;
    console.log('stopped game');
  }
}

Game.prototype.resize = function() {
  // TODO the bounds of the game just changed?
  // This should just be a window into the game, and not update the game size if resize happens.
  this.width = this.canvas.width;
  this.height = this.canvas.height;
}

var PauseController = function(game, $scope) {
  this.game = game;
  $scope.game = game;
  window.addEventListener('blur', function() {
    game.pause = true;
    $scope.$apply();
    // not running full
  }, false);
}

PauseController.prototype.start = function() {
  // game.start???
  this.game.pause = false;
  this.game.stopped = false;
  this.game.run();
}

function init() {
  var canvas = document.createElement('canvas');

  document.body.appendChild(canvas);
  var game = new Game(canvas);
  var resizeCanvas = function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    game.resize();
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, false);
  game.run();
  return game;
};

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

