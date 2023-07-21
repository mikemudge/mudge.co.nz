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

    circle(0, 0, size * 1.4);
  }
}

class Square {
  constructor() {
    this.color = color(random(255), random(255), random(255))
    this.tree = true;
  }

  show(size) {
    fill(this.color);
    rect(-size, -size, size * 2, size * 2);

    if (this.tree) {
      fill("brown");
      rect(-size * .1, 0, size * .2 , size * .5);
      fill("green");
      circle(0, size * -.25, size * .75, size * .75);
    }
  }
}

class Game {
  constructor(view) {
    this.width = 20;
    this.height = 20;
    this.size = 20;
    this.bombs = 0;
    this.map = new Grid(this.width, this.height);
    this.setupNewGame();

    this.view = view;
    this.humanPlayer = new Player(1, 1);
    this.humanPlayer.color = color('red')
    this.players = [this.humanPlayer];

    // Add keys for player?
  }

  setupNewGame() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let square = new Square();
        this.map.setTileData(x, y, square);
      }
    }
  }

  keys() {
    let vel = createVector(0, 0);
    if (keyCode === LEFT_ARROW) {
      vel.x-=0.5;
    } else if (keyCode === RIGHT_ARROW) {
      vel.x+=0.5;
    } else if (keyCode === UP_ARROW) {
      vel.y-=0.5;
    } else if (keyCode === DOWN_ARROW) {
      vel.y+=0.5;
    } else if (keyCode === 32 /* SPACE */) {
      this.humanPlayer.action();
    }
    this.humanPlayer.setVel(vel);
  }

  update() {
    this.view.setCenter(this.humanPlayer.pos);

    // TODO need to disconnect tile updates from display?

    for (let player of this.players) {
      player.update();
    }
  }

  draw() {
    this.view.draw(this.map);

    for (let player of this.players) {
      push();
      let x = this.view.toScreenX(player.pos.x);
      let y = this.view.toScreenY(player.pos.y);
      translate(x, y);
      noStroke();
      player.show(this.view.getSize());
      pop();
    }
  }
}

function setup() {
  view = new MapView(20);
  w = view.getCanvasWidth();
  h = view.getCanvasHeight();
  createCanvas(w, h);
  console.log("setting canvas size", w, h);
  // Must match bomb settings for countdown.
  frameRate(30);

  game = new Game(view);
}

function keyPressed() {
  game.keys(keyCode);
}

function mouseWheel(event) {
  view.scale(event.delta);
}

function draw() {
  background(0);

  game.update();

  game.draw();
}
