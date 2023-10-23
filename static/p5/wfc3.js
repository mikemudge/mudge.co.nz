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
    if (this.possible.length === 0) {
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
      if (tile[dir] !== value) {
        // Incompatible neighbour.
        this.possible.splice(i, 1);
      }
    }
    if (this.possible.length === 1) {
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
        this.data[y][x] = new Square(50 + x * this.size * 2, 100 + y * this.size * 2, tiles);
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
    if (loc === this.edge) {
      return;
    }
    loc.collapse();

    // console.log("Collapsing", x, y, "as", loc.type)
    let tile = this.tiles[loc.type];
    // Consider the direction for these.
    this.get(x, y - 1).reducePossible(2, tile[0].split('').reverse().join(''));
    this.get(x + 1, y).reducePossible(3, tile[1].split('').reverse().join(''));
    this.get(x, y + 1).reducePossible(0, tile[2].split('').reverse().join(''));
    this.get(x - 1, y).reducePossible(1, tile[3].split('').reverse().join(''));

  }
}

function preload() {
  allimages = loadImage('/static/p5/wfc/tileset.png');
}

let widths = [14, 14, 16, 16, 16, 10];
// let widths = [5, 5, 4];
let squareHeight = 16;
let squareWidth = 16;
let imgSquares = [];

function setup() {
  createCanvas(1000, 700);
  tiles = [];

  let edges = [
    ['WW', 'WG', 'GW', 'WW'],
    ['WW', 'WG', 'GG', 'GW'],
    ['WW', 'WW', 'WG', 'GW'],
    ['GG', 'GW', 'WG', 'GG'],
    ['GG', 'GG', 'GW', 'WG'],
    ['DD', 'DG', 'GD', 'DD'],
    ['DD', 'DG', 'GG', 'GD'],
    ['DD', 'DD', 'DG', 'GD'],
    ['GG', 'GD', 'DG', 'GG'],
    ['GG', 'GG', 'GD', 'DG'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GG', 'GG', 'GG', 'GG'],
    ['SS', 'SW', 'WS', 'SS'],
    ['SS', 'SS', 'SW', 'WS'],

    ['WG', 'GG', 'GW', 'WW'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GW', 'WW', 'WG', 'GG'],
    ['GW', 'WG', 'GG', 'GG'],
    ['WG', 'GG', 'GG', 'GW'],
    ['DG', 'GG', 'GD', 'DD'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GD', 'DD', 'DG', 'GG'],
    ['GD', 'DG', 'GG', 'GG'],
    ['DG', 'GG', 'GG', 'GD'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GG', 'GG', 'GG', 'GG'],
    ['SW', 'WS', 'SS', 'SS'],
    ['WS', 'SS', 'SS', 'SW'],

    ['WG', 'GW', 'WW', 'WW'],
    ['GG', 'GW', 'WW', 'WG'],
    ['GW', 'WW', 'WW', 'WG'],
    ['WW', 'WW', 'WW', 'WW'],
    ['DD', 'DD', 'DD', 'DD'],
    ['DG', 'GD', 'DD', 'DD'],
    ['GG', 'GD', 'DD', 'DG'],
    ['GD', 'DD', 'DD', 'DG'],
    ['GG', 'GS', 'SG', 'GG'],
    ['GG', 'GG', 'GS', 'SG'],
    ['WW', 'WD', 'DW', 'WW'],
    ['WW', 'WD', 'DD', 'DW'],
    ['WW', 'WW', 'WD', 'DW'],
    ['WW', 'WS', 'SW', 'WW'],
    ['WW', 'WS', 'SS', 'SW'],
    ['WW', 'WW', 'WS', 'SW'],

    ['BB', 'BG', 'GB', 'BB'],
    ['BB', 'BG', 'GG', 'GB'],
    ['BB', 'BB', 'BG', 'GB'],
    ['BB', 'BB', 'BB', 'BB'],
    ['SS', 'SS', 'SS', 'SS'],
    ['SS', 'SG', 'GS', 'SS'],
    ['SS', 'SG', 'GG', 'GS'],
    ['SS', 'SS', 'SG', 'GS'],
    ['GS', 'SG', 'GG', 'GG'],
    ['SG', 'GG', 'GG', 'GS'],
    ['WD', 'DD', 'DW', 'WW'],
    ['DD', 'DD', 'DD', 'DD'],
    ['DW', 'WW', 'WD', 'DD'],
    ['WS', 'SS', 'SW', 'WW'],
    ['SS', 'SS', 'SS', 'SS'],
    ['SW', 'WW', 'WS', 'SS'],

    ['BG', 'GG', 'GB', 'BB'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GB', 'BB', 'BG', 'GG'],
    ['GG', 'GB', 'BG', 'GG'],
    ['GG', 'GG', 'GB', 'BG'],
    ['SG', 'GG', 'GS', 'SS'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GS', 'SS', 'SG', 'GG'],
    ['DD', 'DW', 'WD', 'DD'],
    ['DD', 'DD', 'DW', 'WD'],
    ['WD', 'DW', 'WW', 'WW'],
    ['DD', 'DW', 'WW', 'WD'],
    ['DW', 'WW', 'WW', 'WD'],
    ['WS', 'SW', 'WW', 'WW'],
    ['SS', 'SW', 'WW', 'WS'],
    ['SW', 'WW', 'WW', 'WS'],

    ['BG', 'GB', 'BB', 'BB'],
    ['GG', 'GB', 'BB', 'BG'],
    ['GB', 'BB', 'BB', 'BG'],
    ['GB', 'BG', 'GG', 'GG'],
    ['BG', 'GG', 'GG', 'GB'],
    ['SG', 'GS', 'SS', 'SS'],
    ['GG', 'GS', 'SS', 'SG'],
    ['GS', 'SS', 'SS', 'SG'],
    ['DW', 'WD', 'DD', 'DD'],
    ['WD', 'DD', 'DD', 'DW']
  ]
  i = 0;
  for (var y = 0; y < widths.length; y += 1) {
    for (var x = 0; x < widths[y]; x += 1) {
      let img = allimages.get(x * squareWidth, y * squareHeight, squareWidth, squareHeight);
      imgSquares.push(img);
      let a = edges[i];
      i++;
      // Only use grass and water tiles.
      if (i >= 6 && i <= 14) {
        continue
      }
      if (i >= 20 && i <= 28) {
        continue
      }
      if (i >= 32) {
        continue
      }
      // if (i >= 44 && i <= 48) {
      //   continue
      // }
      // if (i >= 60 && i <= 65) {
      //   continue
      // }
      // if (i >= 76 && i <= 81) {
      //   continue
      // }
      tiles.push([a[0], a[1], a[2], a[3], img, 0]);
    }
  }

  size = 16;
  w = 800 / 2 / size;
  h = 500 / 2 / size;
  grid = new Grid(w, h, size, tiles);
  time = 0;
  // How many frames between collapses.
  rate = 1;
}

function draw() {
  background(0);

  // Show all the tiles along the top.
  for (let i = 0; i < tiles.length; i++) {
    let x = (i % 26) * squareWidth;
    let y = Math.floor(i / 26) * squareHeight;
    image(tiles[i][4], x, y, squareWidth, squareHeight);
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
