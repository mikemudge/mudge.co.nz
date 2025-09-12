import {Grid} from "./jslib/grid.js"

var MouseControls = function(game) {
  this.game = game;
  this.map = game.map;
  this.enable();
}

MouseControls.prototype.update = function () {
  // Any math or anything this needs to do?
}

MouseControls.prototype.draw = function (ctx) {
  // Check validity of road location, I.E no placement when the location is occupied.
}

MouseControls.prototype.enable = function () {
  document.addEventListener('mousedown', this.onMouseDown.bind(this));
  document.addEventListener('mouseup', this.onMouseUp.bind(this));
  document.addEventListener('mousemove', this.onMouseMove.bind(this));
  document.addEventListener('mouseout', this.onMouseOut.bind(this));
}

MouseControls.prototype.onMouseOut = function(event) {
}

MouseControls.prototype.onMouseDown = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  this.down = true;
}

MouseControls.prototype.onMouseMove = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  if (event.buttons) {
    // Dragging the mouse.
  }
}

MouseControls.prototype.onMouseUp = function(event) {
  this.mx = event.clientX;
  this.my = event.clientY;
  // Indicates that this was a left click?
  if (event.button === 0) {
  }
}

class Square {
  constructor() {
    this.strength = 0;
    this.team = null;
  }
}

class Team {
  constructor(c, alt) {
    this.color = color(c);
    this.colorAlt = color(alt);
  }
}

class Ball {
  constructor(game, team, pos) {
    this.game = game;
    this.team = team;
    this.pos = pos;
    this.radius = 4;
    this.hit = false;
    this.vel = p5.Vector.random2D().mult(2);
  }

  update() {
    this.pos.add(this.vel);

    // Check if the ball hit an edge?
    if (this.pos.x < 0 || this.pos.x >= this.game.grid.getWidth() * this.game.size) {
      this.vel.mult(-1, 1);
    }
    if (this.pos.y < 0 || this.pos.y > this.game.grid.getHeight() * this.game.size) {
      this.vel.mult(1, -1);
    }

    // Check if the ball hit a tile which doesn't belong to its team
    let tile = this.game.grid.getTileAtPosWithSize(this.pos, this.game.size).getData();
    if (tile && tile.team !== this.team) {
      // Convert tile to my team.
      tile.team = this.team;
      this.hit = true;
    }
  }

  draw() {
    fill(this.team.colorAlt);
    circle(this.pos.x, this.pos.y, this.radius * 2);
  }

  finished() {
    return this.hit;
  }
}

class ColorWarGame {
  constructor() {
    this.grid = new Grid(45, 45);
    this.balls = [];
    this.size = 15;
    this.time = 0;

    this.controls = new MouseControls(this);

    for (let y = 0; y < this.grid.getHeight(); y++) {
      for (let x = 0; x < this.grid.getWidth(); x++) {
        this.grid.setTileData(x, y, new Square());
      }
    }

    this.loadScenario();
  }


  loadScenario() {
    let teams = [
      new Team('#FF0000', '#CC0000'),
      new Team('#00FF00', '#00CC00'),
      new Team('#0000FF', '#0000CC'),
      new Team('#FFFF00', '#CCCC00')
    ];

    let inset = 10;
    this.homes = [
      this.grid.getTile(inset, inset),
      this.grid.getTile(this.grid.getWidth() - inset, inset),
      this.grid.getTile(inset, this.grid.getHeight() - inset),
      this.grid.getTile(this.grid.getWidth() - inset, this.grid.getHeight() - inset)
    ];

    for (let [i, home] of this.homes.entries()) {
      home.getData().team = teams[i];
    }
  }

  draw() {
    // Clear the screen.
    background(0);

    for (let y = 0; y < this.grid.getHeight(); y++) {
      for (let x = 0; x < this.grid.getWidth(); x++) {
        let tile = this.grid.getTile(x, y).getData();
        if (tile.team) {
          fill(tile.team.color);
        } else {
          fill('#888888');
        }
        rect(x * this.size, y * this.size, this.size, this.size);
      }
    }

    for (let ball of this.balls) {
      ball.draw();
    }

    this.controls.draw();
  }

  update() {
    // Update the game.
    this.controls.update();

    for (let y = 0; y < this.grid.getHeight(); y++) {
      for (let x = 0; x < this.grid.getWidth(); x++) {
        let tile = this.grid.getTile(x, y);
        let square = tile.getData();
        // TODO update each square?
      }
    }

    for (let ball of this.balls) {
      ball.update();
    }

    this.time++;
    if (this.time % 10 === 0) {
      for (let home of this.homes) {
        this.balls.push(new Ball(this, home.getData().team, createVector(home.x + .5, home.y + .5).mult(this.size)));
      }
    }

    this.balls = this.balls.filter((b) => !b.finished());
  }
}

let game;
export function setup() {
  createCanvas(windowWidth, windowHeight);

  game = new ColorWarGame();
}

export function draw() {
  game.update();

  game.draw();
}
