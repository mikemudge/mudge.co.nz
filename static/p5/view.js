
// TODO support rendering a view of this.
// TODO support loading objects near a point.
// TODO support loading particular objects (layers)

class MapView {
  constructor(size) {
    // Have an area of the screen which shows the game.
    this.offsetLeft = 100;
    this.offsetTop = 50;
    this.offsetBottom = 100;

    // The size of a map tile (number of units across a single map tile is).
    this.mapSize = size;

    // This represents the current scale to render everything at.
    this.size = 1;
    this.minSize = 0.25;
    this.maxSize = 10;

    // default to use the whole window.
    this.setScreen(windowWidth, windowHeight);
    this.center = createVector(0, 0);
  }

  getMapSize() {
    return this.mapSize;
  }

  setScreen(width, height) {
    this.screenWidth = width - 2 * this.offsetLeft;
    this.screenHeight = height - this.offsetTop - this.offsetBottom;

    this.halfScreen = createVector(this.screenWidth / 2, this.screenHeight / 2);
  }

  getCanvasWidth() {
    return this.offsetLeft * 2 + this.screenWidth;
  }

  getCanvasHeight() {
    return this.offsetTop + this.offsetBottom + this.screenHeight;
  }

  getSize() {
    return this.size;
  }

  toScreen(pos) {
    return pos.copy().sub(this.center).mult(this.size)
      .add(this.halfScreen).add(this.offsetLeft, this.offsetTop);
  }

  toScreenX(x) {
    // Take the difference from the current map center scaled by the size.
    let mapping = (x - this.center.x) * this.size;
    return this.offsetLeft + this.halfScreen.x + mapping;
  }

  toScreenY(y) {
    // Take the difference from the current map center scaled by the size.
    let mapping = (y - this.center.y) * this.size;
    // Then locate that from the center of the screen.
    return this.offsetTop + this.halfScreen.y + mapping;
  }

  toGameGrid(pos) {
    return createVector(
      Math.round(this.toGameX(pos.x) / this.mapSize) * this.mapSize,
      Math.round(this.toGameY(pos.y) / this.mapSize) * this.mapSize)
  }

  toGameX(x) {
    return (x - this.offsetLeft - this.halfScreen.x) / this.size + this.center.x;
  }

  toGameY(y) {
    return (y - this.offsetTop - this.halfScreen.y) / this.size + this.center.y;
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
      vel.x -= 20 / this.size;
    }
    if (keyIsDown(RIGHT_ARROW)) {
      vel.x += 20 / this.size;
    }
    if (keyIsDown(UP_ARROW)) {
      vel.y -= 20 / this.size;
    }
    if (keyIsDown(DOWN_ARROW)) {
      vel.y += 20 / this.size;
    }
    this.vel = vel;
  }

  scale(amount) {
    let x2 = this.toGameX(mouseX);
    let y2 = this.toGameY(mouseY);
    // Still scale the same amount
    let preSize = this.size;

    // Reverse direction for zoom.
    amount *= -1;
    // how to interpret the amount?
    // It can get largish for fast scrolling, based on my simple testing. -100, 100
    // But its also small for slow scrolling -2, 2.

    // Scale based on amount (which contains a direction -/+).
    // Using a max/min to avoid the amount being too little/slow.
    if (amount > 0) {
      amount = Math.max(1, amount / 40)
    } else {
      amount = Math.min(-1, amount / 40);
    }
    // Also based on the current size, so we scale quicker when larger.
    this.size += amount * (this.size / 50);

    // Limit scaling to some sensible min/max
    this.size = Math.max(this.minSize, this.size);
    this.size = Math.min(this.maxSize, this.size);

    // We want x2, y2 to be in the same location.
    // Need distance from center to x2, y2 to get scaled.
    this.center.sub(x2, y2).mult(preSize / this.size).add(x2, y2);
    // let off = createVector(x2, y2).sub(this.center).mult( -preSize / this.size);
    // this.center.add(off);
  }

  update() {
    // TODO should vel be scaled by size?
    // Otherwise we move fast when zoomed in, and slow when zoomed out.
    this.center.add(this.vel);
  }

  show(thing) {
    this.showAtPos(thing, thing.pos);
  }

  showAtPos(thing, pos) {
    push();
    let x = this.toScreenX(pos.x);
    let y = this.toScreenY(pos.y);
    translate(x, y);
    thing.show(this.mapSize * this.size / 2);
    pop();
  }

  draw(map) {
    // TODO align center?
    // This covers the area of map which needs to be drawn.
    let top = 0;
    let left = 0;
    let right = map.width;
    let bottom = map.height;

    // TODO figure out what region of map we need to show.
    // use this.center as the focus point for the view of the map.

    // This is the number of map tiles required to draw in each direction.
    let halfMapTileHeight = (this.halfScreen.y / this.size);
    let halfMapTileWidth = (this.halfScreen.x / this.size);

    // Assuming center is a grid tile location.
    top = Math.round((this.center.y - halfMapTileHeight) / this.mapSize);
    left = Math.round((this.center.x - halfMapTileWidth) / this.mapSize);

    // TODO could optimize these better.
    bottom = Math.round((this.center.y + halfMapTileHeight) / this.mapSize) + 1;
    right = Math.round((this.center.x + halfMapTileWidth) / this.mapSize) + 1;

    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let square = map.getTile(x, y).getData();
        if (!square) {
          continue;
        }
        push();
        translate(this.toScreenX(x * this.mapSize), this.toScreenY(y * this.mapSize));
        square.show(this.mapSize * this.size / 2);
        pop();
      }
    }
  }

  coverEdges(debug) {
    if (debug) {
      noFill();
      stroke("#333333");
    } else {
      fill("#333333");
      noStroke();
    }
    rect(0, 0, this.offsetLeft, this.getCanvasHeight());
    rect(0, 0, this.getCanvasWidth(), this.offsetTop);
    rect(this.screenWidth + this.offsetLeft, 0, this.offsetLeft, this.getCanvasHeight());
    rect(0, this.screenHeight + this.offsetTop, this.getCanvasWidth(), this.offsetBottom);
  }
}
