
// TODO support rendering a view of this.
// TODO support loading objects near a point.
// TODO support loading particular objects (layers)

class MapView {
  constructor(size, screenWidth, screenHeight) {
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
    // This covers the area of map which needs to be drawn.
    let top = 0;
    let left = 0;
    let right = map.width;
    let bottom = map.height;

    // TODO figure out what region of map we need to show.
    // This depends on where we are focused on.
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let square = map.getTile(x, y).getData();
        push();
        // TODO this should be offset by the top/left?
        translate(this.toScreenX(x), this.toScreenY(y));
        square.show(this.size);
        pop();
      }
    }
  }
}
