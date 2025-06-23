class Overlay {
  constructor(pos) {
    this.pos = pos;
    this.display = true;
    this.titleHeight = 24;

    this.space = createVector(50, 50);
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  setName(name) {
    this.name = name;
  }

  setSpace(width, height) {
    this.space.set(width, height);
  }

  setPos(width, height) {
    this.pos.set(width, height);
  }

  toggleDisplay() {
    this.display = !this.display;
  }

  setDisplayed(display) {
    this.display = display;
  }

  show() {
    if (!this.display) {
      return;
    }

    push();
    translate(this.pos.x, this.pos.y);

    // Background for the overlay, TODO support custom.
    fill(160);
    noStroke()
    rect(0, 0, this.space.x, this.space.y);
    // title bar for overlay.
    fill(80);
    noStroke()
    rect(0, -this.titleHeight, this.space.x, this.titleHeight);

    fill(255);
    textSize(16);
    text(this.name, 5, -this.titleHeight + 16);

    // Draw a box with an X in it
    text("X", this.space.x - this.titleHeight / 2 - 5, -this.titleHeight / 2 + 5);
    noFill();
    stroke(255);
    rect(this.space.x - this.titleHeight, -this.titleHeight, this.titleHeight, this.titleHeight);

    this.renderer.show();
    pop();
  }

  click(mousePos) {
    if (!this.display) {
      return false;
    }
    if (mousePos.x < this.pos.x || mousePos.y < this.pos.y - this.titleHeight) {
      // x or y is out of bounds.
      return false;
    }
    let clickLoc = p5.Vector.sub(mousePos, this.pos);
    if (clickLoc.x > this.space.x || clickLoc.y > this.space.y) {
      // x or y is out of bounds the other way
      return false;
    }
    if (clickLoc.y < 0) {
      // Click on the title bar.
      if (clickLoc.x > this.space.x - this.titleHeight) {
        // Click on the X button.
        this.display = false;
      }
      return true;
    }
    // The click was on the view.
    this.renderer.click(clickLoc);
    return true;
  }

  highlight(mousePos) {
    if (!this.display) {
      return false;
    }
    if (this.renderer.highlight) {
      // Is mousePos within the bounds?
      // If so then return true?
      this.renderer.highlight(p5.Vector.sub(mousePos, this.pos));
    }
    return false;
  }
}
