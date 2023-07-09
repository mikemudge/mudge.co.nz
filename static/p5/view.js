
// TODO support rendering a view of this.
// TODO support loading objects near a point.
// TODO support loading particular objects (layers)

class MapView {
  constructor(size) {
    // Have an area of the screen which shows the game.
    this.offsetLeft = 50;
    this.offsetTop = 50;
    // How much screen are we using?
    this.screenWidth = 10 * size;
    this.screenHeight = 10 * size;
    this.size = size;
    this.left = 0;
    this.top = 0;
  }

  toScreenX(x) {
    return this.offsetLeft + x * this.size * 2;
  }

  toScreenY(y) {
    return this.offsetTop + y * this.size * 2;
  }

  toGameX(x) {
    return Math.round((x - this.offsetLeft) / (2 * this.size));
  }

  toGameY(y) {
    return Math.round((y - this.offsetTop) / (2 * this.size));
  }

  draw(map) {
    // TODO align center?
    let width = 340 / this.size / 2;
    let height = 340 / this.size / 2;
    width = min(width, map.width - this.left);
    height = min(height, map.height - this.top);
    for (let y = this.top; y < this.top + height; y++) {
      for (let x = this.left; x < this.left + width; x++) {
        let tile = map.getTile(createVector(x, y));
        push();
        translate(this.toScreenX(x - this.left), this.toScreenY(y - this.top));
        tile.show(this.size);
        pop();
      }
    }
  }
}
