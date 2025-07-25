class Player {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.color = color(255);
  }

  setVel(vel) {
    this.vel = vel;
    this.pos.add(this.vel);
  }

  update() {
  }

  show(size) {
    fill(this.color);
    noStroke();

    circle(0, 0, size * 0.7);
  }
}

class Square {
  constructor() {
    this.color = color(random(255), random(255), random(255))
    this.tree = new Tree();
  }

  show(size) {
    fill(this.color);
    rect(-size / 2, -size / 2, size, size);
    this.tree.show(size);
  }
}

class Tree {
  constructor() {
    // lawn green is #7CFC00
    // green is #008000
    let rnd = random();
    this.color = color(rnd * 0x7c, 0x80 + rnd * (0xfc - 0x80), 0);
    this.treePos = createVector(random(-.5,.5), random(-.25, .5));
  }

  show(size) {
    stroke("black");
    fill(this.color);
    rect(-size / 2, -size / 2, size, size);
    fill("brown");
    rect(size * (this.treePos.x - .1) / 2, size / 2 * this.treePos.y, size * .1 , size * .25);
    fill("ForestGreen");
    circle(size / 2 * this.treePos.x,  size / 2 * (this.treePos.y - .125), size * .375, size * .375);
  }
}

class Game {
  constructor(view) {
    this.debug = false;
    this.width = 30;
    this.height = 20;
    this.map = new Grid(this.width, this.height, view.getMapSize());
    this.setupNewGame();

    this.view = view;
    this.humanPlayer = new Player(view.getMapSize(), view.getMapSize());
    this.humanPlayer.color = color('red')
    this.players = [this.humanPlayer];

    // Add keys for player?
  }

  pause() {
    this.paused = true;
    console.log("game paused");
    noLoop();
  }

  unpause() {
    this.paused = false;
    console.log("game resumed");
    loop();
  }

  setupNewGame() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let square = new Square();
        this.map.setTileData(x, y, square);
      }
    }
  }

  update() {
    // TODO need to disconnect tile updates from display?
    view.update();

    for (let player of this.players) {
      player.update();
    }
  }

  draw() {
    this.view.draw(this.map);

    for (let player of this.players) {
      this.view.show(player);
    }

    this.view.coverEdges(this.debug);
  }
}

function setup() {
  view = new MapView(40);
  view.createCanvas()
  // Must match bomb settings for countdown.
  frameRate(30);

  game = new Game(view);
  window.onblur = game.pause;
  window.onfocus = game.unpause;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  view.setScreen(windowWidth, windowHeight - 18);
}

function keyPressed() {
  view.keys();
}

function keyReleased() {
  view.keys();
}

function mouseWheel(event) {
  view.scale(event.delta);
}

function draw() {
  background(0);

  game.update();

  game.draw();
}
