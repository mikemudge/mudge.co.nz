class Square {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.possible = [1, 2, 3, 4];
    this.type = null;
  }

  update() {

  }
  
  collapse() {
    if (this.type) {
      // Already collapsed.
      return;
    }
    this.type = random(this.possible);
    this.possible = [this.type];
  }

  reducePossible(type) {
    if (type == 4) {
      console.log("water neighbour collapse");
    }
    for (let i = this.possible.length - 1; i >= 0; i--) {
      if (this.possible[i] < type - 1 || this.possible[i] > type + 1) {
        // Incompatible neighbour.
        this.possible.splice(i, 1);
      }
    }
    if (this.possible.length == 1) {
      this.collapse();
    }
  }

  draw(size) {
    if (!this.type) {
      fill(255);
      text(this.possible.length, this.pos.x + 5, this.pos.y + 15);
      stroke(70);
      noFill();
      rect(this.pos.x, this.pos.y, size, size);
      return;
    }
    noStroke();
    switch(this.type) {
      case 0:
        // dirt
        fill(150, 70, 0);
        rect(this.pos.x, this.pos.y, size, size);
        return;
      case 1:
        // dirt
        fill(150, 70, 0);
        rect(this.pos.x, this.pos.y, size, size);
        return;
      case 2:
        // grass
        fill(0, 150, 0);
        rect(this.pos.x, this.pos.y, size, size);
        return;
      case 3:
        // sand
        fill(237, 201, 175);
        rect(this.pos.x, this.pos.y, size, size);
        return;
      case 4:
        // water
        fill(0, 0, 150);
        rect(this.pos.x, this.pos.y, size, size);
        return;
      case 5:
        fill(200, 0, 0);
        rect(this.pos.x, this.pos.y, size, size);
        return;
    }
  }
}

class Grid {
  constructor(w, h, size) {
    this.width = w;
    this.height = h;
    this.size = size;
    this.data = [];

    for (let y = 0; y < this.height; y++) {
      this.data[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.data[y][x] = new Square(50 + x * this.size, 50 + y * this.size);
      }
    }

    // An unused square used for all impossible locations.
    this.edge = new Square(0, 0);
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
}

function setup() {
  createCanvas(800, 600);

  grid = new Grid(35, 25, 20);
  time = 0;
}

function draw() {
  background(0);

  time++;
  if (time % 10 == 0) {
    // TODO pick from remaining grid locations (prevent dups)
    idx = time / 10 - 1;
    x = idx % grid.width;
    y = int(idx / grid.width);
    // x = int(random(grid.width));
    // y = int(random(grid.height));
    // Set the type of one square every second.
    loc = grid.get(x, y);
    loc.collapse();
    console.log("Collapsing", x, y, "as", loc.type)
    grid.get(x + 1, y).reducePossible(loc.type);
    grid.get(x, y + 1).reducePossible(loc.type);
    grid.get(x - 1, y).reducePossible(loc.type);
    grid.get(x, y - 1).reducePossible(loc.type);
  }

  grid.draw();
}
