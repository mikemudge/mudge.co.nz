class Square {
  constructor(x, y, tiles) {
    this.pos = createVector(x, y);
    this.possible = [];
    this.type = null;
    this.tiles = tiles;
    // Initially all tiles are possible.
    for (let i = 0; i < this.tiles.length; i++) {
      this.possible.push(i);
    }
  }

  update() {

  }
  
  collapse() {
    if (this.type != null) {
      // Already collapsed.
      return;
    }
    if (this.possible.length == 0) {
      console.error("No possible tiles", this);
      this.type = 0;
      this.possible = [0];
      return;
    }
    this.type = random(this.possible);
    this.possible = [this.type];
  }

  reducePossible(dir, value) {

    for (let i = this.possible.length - 1; i >= 0; i--) {
      let tile = this.tiles[this.possible[i]];
      if (tile[dir] != value) {
        // Incompatible neighbour.
        this.possible.splice(i, 1);
      }
    }
    if (this.possible.length == 1) {
      this.collapse();
    }
  }

  draw(size) {
    if (this.type == null) {
      fill(255);
      text(this.possible.length, this.pos.x - size + 5, this.pos.y - size + 15);
      stroke(70);
      noFill();
      rect(this.pos.x - size, this.pos.y - size, size * 2, size * 2);
      return;
    }
    let tile = this.tiles[this.type];
    push();
    translate(this.pos.x, this.pos.y);
    rotate(tile[5]);

    image(tile[4], -size, -size, size * 2, size * 2);
    pop()
  }
}

class Grid {
  constructor(w, h, size, tiles) {
    this.width = w;
    this.height = h;
    this.size = size;
    this.data = [];
    this.tiles = tiles;

    for (let y = 0; y < this.height; y++) {
      this.data[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.data[y][x] = new Square(50 + x * this.size * 2, 50 + y * this.size * 2, tiles);
      }
    }

    // An unused square used for all impossible locations.
    this.edge = new Square(0, 0, tiles);
  }

  draw() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.data[y][x].draw(this.size);
      }
    }
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return this.edge;
    }
    return this.data[y][x];
  }

  collapse(x, y) {
    let loc = this.get(x, y);
    if (loc == this.edge) {
      return;
    }
    loc.collapse();

    // console.log("Collapsing", x, y, "as", loc.type)
    let tile = this.tiles[loc.type];
    // Consider the direction for these.
    this.get(x, y - 1).reducePossible(2, tile[0]);
    this.get(x + 1, y).reducePossible(3, tile[1]);
    this.get(x, y + 1).reducePossible(0, tile[2]);
    this.get(x - 1, y).reducePossible(1, tile[3]);

  }
}

function rivers() {
  return [
    ['A', 'A', 'A', 'A', blank, 0],
    ['A', 'B', 'A', 'B', straight, 0],
    ['B', 'A', 'B', 'A', straight, Math.PI / 2],
    ['B', 'A', 'A', 'B', corner, 0],
    ['B', 'B', 'A', 'A', corner, Math.PI / 2],
    ['A', 'B', 'B', 'A', corner, Math.PI],
    ['A', 'A', 'B', 'B', corner, Math.PI * 3 / 2],
    ['B', 'B', 'A', 'B', tee, 0],
    ['B', 'B', 'B', 'A', tee, Math.PI / 2],
    ['A', 'B', 'B', 'B', tee, Math.PI],
    ['B', 'A', 'B', 'B', tee, Math.PI * 3 / 2],
    ['B', 'B', 'B', 'B', cross, 0],
  ];
}

function roads() {
  return [
    ['A', 'A', 'A', 'A', blank, 0],
    ['A', 'C', 'A', 'C', straightRoad, 0],
    ['C', 'A', 'C', 'A', straightRoad, Math.PI / 2],
    ['C', 'A', 'A', 'C', cornerRoad, 0],
    ['C', 'C', 'A', 'A', cornerRoad, Math.PI / 2],
    ['A', 'C', 'C', 'A', cornerRoad, Math.PI],
    ['A', 'A', 'C', 'C', cornerRoad, Math.PI * 3 / 2],
  ];
}

function riversAndRoads() {
  return [
    ['A', 'A', 'A', 'A', blank, 0],
    // River and grass.
    ['A', 'B', 'A', 'B', straight, 0],
    ['B', 'A', 'B', 'A', straight, Math.PI / 2],
    ['B', 'A', 'A', 'B', corner, 0],
    ['B', 'B', 'A', 'A', corner, Math.PI / 2],
    ['A', 'B', 'B', 'A', corner, Math.PI],
    ['A', 'A', 'B', 'B', corner, Math.PI * 3 / 2],
    ['B', 'B', 'A', 'B', tee, 0],
    ['B', 'B', 'B', 'A', tee, Math.PI / 2],
    ['A', 'B', 'B', 'B', tee, Math.PI],
    ['B', 'A', 'B', 'B', tee, Math.PI * 3 / 2],
    // ['B', 'B', 'B', 'B', cross, 0],

    // Road and grass.
    ['A', 'C', 'A', 'C', straightRoad, 0],
    ['C', 'A', 'C', 'A', straightRoad, Math.PI / 2],
    ['C', 'A', 'A', 'C', cornerRoad, 0],
    ['C', 'C', 'A', 'A', cornerRoad, Math.PI / 2],
    ['A', 'C', 'C', 'A', cornerRoad, Math.PI],
    ['A', 'A', 'C', 'C', cornerRoad, Math.PI * 3 / 2],
    // Road and river
    ['C', 'B', 'C', 'B', bridgeRoad, 0],
    ['B', 'C', 'B', 'C', bridgeRoad, Math.PI / 2],
  ];
}

function preload() {
  blank = loadImage('/static/p5/wfc/blank.png');
  straight = loadImage('/static/p5/wfc/straight.png');
  corner = loadImage('/static/p5/wfc/corner.png');
  tee = loadImage('/static/p5/wfc/tee.png');
  cross = loadImage('/static/p5/wfc/cross.png');
  straightRoad = loadImage('/static/p5/wfc/straightRoad.png');
  cornerRoad = loadImage('/static/p5/wfc/cornerRoad.png');
  bridgeRoad = loadImage('/static/p5/wfc/bridgeRoad.png');
}

function setup() {
  createCanvas(800, 600);

  params = new URLSearchParams(window.location.search);

  tileSet = params.get('tiles');
  if (tileSet == 'rivers') {
    tiles = rivers();
  } else if (tileSet == 'roads') {
    tiles = roads();
  } else {
    tiles = riversAndRoads();
  }

  size = 10;
  w = 700 / 2 / size;
  h = 500 / 2 / size;
  grid = new Grid(w, h, size, tiles);
  time = 0;
  // How many frames between collapses.
  rate = 1;
}

function debugTiles() {
  for (let i = 0; i < tiles.length; i++) {
    push();
    translate(10 + size, 10 + size + i * size * 3);
    push();
    rotate(tiles[i][5]);

    stroke(150);
    strokeWeight(1);
    noFill();
    rect(-size, -size, size * 2, size * 2);
    image(tiles[i][4], -size, -size, size * 2, size * 2);
    pop()
    fill(255);
    noStroke();
    translate(-5, 5);
    text(tiles[i][0], 0, -size);
    text(tiles[i][1], size, 0);
    text(tiles[i][2], 0, size);
    text(tiles[i][3], -size, 0);
    pop();
  }
}

function draw() {
  background(0);

  if (params.get('debug')) {
    debugTiles();
  }

  time++;
  if (time % rate == 0) {
    // TODO pick from remaining grid locations (prevent dups)
    idx = time / rate - 1;
    x = idx % grid.width;
    y = int(idx / grid.width);
    if (y >= grid.height) {
      noLoop();
    } else {
      // Set the type of one square every second.
      loc = grid.collapse(x, y);
    }
  }

  grid.draw();
}
