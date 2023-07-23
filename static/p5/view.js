
// TODO support rendering a view of this.
// TODO support loading objects near a point.
// TODO support loading particular objects (layers)

class MapView {
  constructor(size) {
    // Have an area of the screen which shows the game.
    this.offsetLeft = 50;
    this.offsetTop = 50;

    // How much screen we need to render a 20x15 section of the map.
    // TODO should not be hardcoded.
    this.screenWidth = 20 * 2 * size;
    this.screenHeight = 15 * 2 * size;
    this.size = size;
    this.left = 0;
    this.top = 0;
    this.center = createVector(0, 0);
    // This is the offsets from the center which we will draw.
    this.halfMapTileHeight = (this.screenHeight / this.size / 2 / 2);
    this.halfMapTileWidth = (this.screenWidth / this.size / 2 / 2);

    console.log(this.halfMapTileWidth, this.halfMapTileHeight);
  }

  getCanvasWidth() {
    return this.offsetLeft * 2 + this.screenWidth;
  }

  getCanvasHeight() {
    return this.offsetTop * 2 + this.screenHeight;
  }

  getSize() {
    return this.size;
  }

  toScreenX(x) {
    let left = this.center.x - this.halfMapTileWidth;
    return this.offsetLeft + (x - left) * this.size * 2;
  }

  toScreenY(y) {
    let top = this.center.y - this.halfMapTileHeight;
    return this.offsetTop + (y - top) * this.size * 2;
  }

  toGameX(x) {
    return Math.round((x - this.offsetLeft) / (2 * this.size));
  }

  toGameY(y) {
    return Math.round((y - this.offsetTop) / (2 * this.size));
  }

  setCenter(pos) {
    this.center.set(pos);
  }

  translate(vel) {
    this.center.add(vel);
  }

  keys() {
    let vel = createVector(0, 0);
    if (keyIsDown(LEFT_ARROW)) {
      vel.x -= 10 / this.size;
    }
    if (keyIsDown(RIGHT_ARROW)) {
      vel.x += 10 / this.size;
    }
    if (keyIsDown(UP_ARROW)) {
      vel.y -= 10 / this.size;
    }
    if (keyIsDown(DOWN_ARROW)) {
      vel.y += 10 / this.size;
    }
    this.vel = vel;
  }

  scale(amount) {
    // how to interpret the amount?
    // It can get largish for fast scrolling, based on my simple testing. -100, 100
    // But its also small for slow scrolling -2, 2.
    // TODO should support configuration for * x so x can affect direction and sensitivity.

    // Scale based on amount (which contains a direction -/+).
    // Using a max/min to avoid the amount being too little/slow.
    if (amount > 0) {
      amount = Math.max(1, amount / 40)
    } else {
      amount = Math.min(-1, amount / 40);
    }
    // Also based on the current size, so we scale quicker when larger.
    this.size += amount * (this.size / 50);

    // Do not support lower than 4.
    this.size = Math.max(4, this.size);
    // Or larger than 100?
    this.size = Math.min(100, this.size);

    // Update the values which depend on size.
    this.halfMapTileHeight = (this.screenHeight / this.size / 2 / 2);
    this.halfMapTileWidth = (this.screenWidth / this.size / 2 / 2);
  }

  update() {
    // TODO should vel be scaled by size?
    // Otherwise we move fast when zoomed in, and slow when zoomed out.
    this.center.add(this.vel);
  }

  draw(map) {
    // TODO align center?
    // This covers the area of map which needs to be drawn.
    let top = 0;
    let left = 0;
    let right = map.width;
    let bottom = map.height;

    // Assuming center is a grid tile location.
    // TODO should support grid and non grid viewing?
    top = Math.round(this.center.y - this.halfMapTileHeight);
    bottom = top + 1 + 2 * this.halfMapTileHeight;
    left = Math.round(this.center.x - this.halfMapTileWidth);
    right = left + 1 + 2 * this.halfMapTileWidth;

    // We need to know what map space to render?
    // This depends on the size of map rendering?


    // TODO figure out what region of map we need to show.
    // use this.center as the focus point for the view of the map.
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let square = map.getTile(x, y).getData();
        if (!square) {
          continue;
        }
        push();
        translate(this.toScreenX(x), this.toScreenY(y));
        square.show(this.size);
        pop();
      }
    }
  }

  coverEdges() {
    fill("#333333");
    noStroke();
    rect(0, 0, this.offsetLeft, this.getCanvasHeight());
    rect(0, 0, this.getCanvasWidth(), this.offsetTop);
    rect(this.screenWidth + this.offsetLeft, 0, this.offsetLeft, this.getCanvasHeight());
    rect(0, this.screenHeight + this.offsetTop, this.getCanvasWidth(), this.offsetTop);
  }
}
