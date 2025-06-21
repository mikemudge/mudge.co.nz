class Overlay {
  constructor(pos, renderer) {
    this.renderer = renderer;
    this.pos = pos;
    this.display = true;
  }

  toggleDisplay() {
    this.display = !this.display;
  }

  show() {
    if (!this.display) {
      return;
    }
    push();
    translate(this.pos.x, this.pos.y);
    this.renderer.show();
    pop();
  }

  click(mousePos) {
    if (!this.display) {
      return false;
    }
    return this.renderer.click(p5.Vector.sub(mousePos, this.pos));
  }

  highlight(mousePos) {
    if (!this.display) {
      return;
    }
    this.renderer.highlight(p5.Vector.sub(mousePos, this.pos));
  }
}
