class ClusterRenderer {
  constructor(tilesetMatcher, size) {
    this.tilesetMatcher = tilesetMatcher;
    this.size = size
  }

  show() {
    textSize(14);
    fill(255);
    noStroke();

    // Show the clusters
    for (let [y, cluster] of this.tilesetMatcher.clusters.entries()) {
      text("" + y, 0, y * (this.size.y + 5) + 15);

      for (let [x, tile] of cluster.entries()) {
        tile.show(10 + x * this.size.x, y * (this.size.y + 5), this.size.x, this.size.y);
      }
    }
  }

  click(mousePos) {
  }
}

class TileRenderer {
  constructor(size, scale) {
    this.size = size;
    this.scale = scale;
    this.tile = null;
  }

  setTile(tile) {
    if (!tile) {
      this.tile = null;
    } else {
      this.tile = tile;
    }
    console.log("Showing tile for", this.tile);
  }

  // Display an enlarged tiles, along with its edge coloring.
  // Also display the tiles it can match against in each direction.
  show() {
    if (!this.tile) {
      return;
    }
    // Display the large view of the tile with edge pixel colors.
    fill(159);
    noStroke()
    let bigSize = this.size.copy().mult(this.scale);
    let tile = this.tile;
    if (tile.image) {
      // 40 margin to display the pixel colors.
      rect(0, 0, 80 + bigSize.x, 80 + bigSize.y);
    }

    stroke('white');
    noSmooth();
    // Default distance down to display the edges.
    if (tile.image) {
      // Override this if we are displaying a tile.
      rect(40, 40, bigSize.x + 1, bigSize.y + 1);
      tile.show(40, 40, bigSize.x, bigSize.y);
      tile.showEdges(40, 40, this.scale);
    }

    push();
    translate(0, bigSize.y + 80);
    this.showConnections();
    pop();
  }

  showConnections() {
    let tile = this.tile;
    let margin = 4;

    textSize(16);
    fill(255);
    noStroke();
    text("L", 6, 15);
    text("U", 6, 15 + (this.size.y + margin) * 1);
    text("R", 6, 15 + (this.size.y + margin) * 2);
    text("D", 6, 15 + (this.size.y + margin) * 3);
    text("A", 6, 15 + (this.size.y + margin) * 4);
    text("B", 6, 15 + (this.size.y + margin) * 5);

    stroke('white');
    noFill();
    let edgeMax = Math.max(tile.right.length, tile.left.length, tile.up.length, tile.down.length);
    edgeMax = Math.max(edgeMax, tile.above.length, tile.below.length);
    for (let i = 0; i < edgeMax; i++) {
      if (tile.left[i]) {
        tile.left[i].show((i + 1) * (this.size.x + margin), 0, this.size.x, this.size.y)
      }
      if (tile.up[i]) {
        tile.up[i].show((i + 1) * (this.size.x + margin), (this.size.y + margin), this.size.x, this.size.y)
      }
      if (tile.right[i]) {
        tile.right[i].show((i + 1) * (this.size.x + margin), (this.size.y + margin) * 2, this.size.x, this.size.y)
      }
      if (tile.down[i]) {
        tile.down[i].show((i + 1) * (this.size.x + margin), (this.size.y + margin) * 3, this.size.x, this.size.y)
      }
      if (tile.above[i]) {
        tile.above[i].show((i + 1) * (this.size.x + margin), (this.size.y + margin) * 4, this.size.x, this.size.y)
      }
      if (tile.below[i]) {
        tile.below[i].show((i + 1) * (this.size.x + margin), (this.size.y + margin) * 5, this.size.x, this.size.y)
      }
    }

  }
  click(mousePos) {

  }
}

class ConnectionRenderer {
  constructor(size) {
    this.size = size
    this.tile = null;
  }

  setTile(tile) {
    if (!tile) {
      this.tile = null;
    } else {
      this.tile = tile;
    }
    console.log("Showing connections for", this.tile);
  }

  click(mousePos) {

  }
}

class PossibleRenderer {
  constructor(size) {
    this.size = size
    this.square = null;
  }

  setSquare(square) {
    if (!square) {
      this.square = null;
    } else {
      this.square = square;
    }
    console.log("Showing possible options for", this.square);
  }

  show() {
    if (!this.square) {
      return;
    }

    noStroke();
    fill(255);
    if (this.square.tile) {
      this.square.tile.show(0, 0, this.size.x * 2, this.size.y * 2);
    } else {
      for (let [i, p] of this.square.possible.entries()) {
        p.show(this.size.x * 2 + 8 + (this.size.x + 4) * i, y, this.size.x, this.size.y);
      }
    }
    text(this.square.getLocationString(), 0, 10);
  }

  click(mousePos) {

  }
}

class ImpossibleRenderer {
  constructor(size, tilesetMatcher) {
    this.size = size;
    this.tilesetMatcher = tilesetMatcher;
  }

  show() {
    if (!this.tilesetMatcher.impossible) {
      return;
    }

    // Will always have 3 tiles.
    this.tilesetMatcher.impossible[0].show(0, size.y);
    this.tilesetMatcher.impossible[1].show(0, 0);
    this.tilesetMatcher.impossible[2].show(size.x, 0);
  }

  click(mousePos) {

  }
}

class TilesetRenderer {
  constructor(tilesetMatcher, tileSetters, size) {
    this.tilesetMatcher = tilesetMatcher;

    this.size = size;
    this.gridHeight = this.tilesetMatcher.tiles.getHeight();
    this.gridWidth = this.tilesetMatcher.tiles.getWidth();

    this.tileSetters = tileSetters;
    this.clicked = [null, null];
    this.clickIndex = 0;
  }

  getWidth() {
    return this.size.x * this.gridWidth;
  }

  getHeight() {
    return this.size.y * this.gridHeight;
  }

  show() {
    // background
    fill(159);
    stroke(255);
    rect(0, 0, this.getWidth(), this.getHeight())

    let w = this.size.y;
    let h = this.size.x;
    for (var y = 0; y < this.gridHeight; y++) {
      for (var x = 0; x < this.gridWidth; x++) {
        let tile = this.tilesetMatcher.get(x, y).getData();
        tile.show(x * w, y * h, w, h);

        // If this one is selected, show a border around it.
        if (this.clicked[0] === tile) {
          noFill();
          stroke(255, 0, 0);
          rect(x * w, y * h, w, h)
        }
        if (this.clicked[1] === tile) {
          noFill();
          stroke(255, 255, 0);
          rect(x * w, y * h, w, h)
        }
      }
    }

    // Overlay the index of each tile to aid debugging.
    textSize(10);
    fill(255);
    noStroke();
    for (var y = 0; y < this.gridHeight; y++) {
      for (var x = 0; x < this.gridWidth; x++) {
        text(x + "," + y, x * w + 3, y * h + 10);
      }
    }
  }

  click(pos) {
    let x = Math.floor(pos.x / this.size.x);
    let y = Math.floor(pos.y / this.size.y);
    // Default to no selection.
    let clicked = null;

    if (y >= 0 && y < this.gridHeight) {
      if (x >= 0 && x < this.gridWidth) {
        clicked = this.tilesetMatcher.get(x, y).getData();
      }
    }

    if (clicked) {
      console.log("clicked on", clicked);
      this.clicked[this.clickIndex] = clicked;
      this.tileSetters[this.clickIndex].setTile(clicked);
      this.clickIndex = (this.clickIndex + 1) % this.clicked.length;
      return true;
    }
  }
}

class WFCOverlay {
  constructor(tilesetMatcher, collapseFunction) {
    this.tilesetMatcher = tilesetMatcher;
    this.collapseFunction = collapseFunction;
    this.mousePos = createVector(0, 0);
    // A place to store a tile which was clicked on.
    this.clicked = null;

    let size = createVector(32, 32);
    let size2 = createVector(16, 16);

    this.tileRendererA = new TileRenderer(size, 15);
    this.tileRendererB = new TileRenderer(size, 15);
    // this.connectionRenderer = new ConnectionRenderer(size);
    this.squareRenderer = new PossibleRenderer(size)
    let tilesetRenderer = new TilesetRenderer(tilesetMatcher, [this.tileRendererA, this.tileRendererB], size);
    let clusterRenderer = new ClusterRenderer(tilesetMatcher, size2);

    // Wrap the renderers in an overlay at a particular location.
    this.tilesetOverlay = new Overlay(createVector(20, 50), tilesetRenderer);
    this.clustersOverlay = new Overlay(createVector(20, 50), clusterRenderer);

    // Hide these by default.
    this.clustersOverlay.toggleDisplay();
    // this.tilesetOverlay.toggleDisplay();

    this.overlays = [
        this.tilesetOverlay,
        this.clustersOverlay
    ];

    // Add some more overlays which are controlled by setting a displayable on the renderer.
    this.overlays.push(new Overlay(createVector(20, 100), this.tileRendererA));
    this.overlays.push(new Overlay(createVector(600, 100), this.tileRendererB));
    this.overlays.push(new Overlay(createVector(20 + tilesetRenderer.getWidth(), 50), this.squareRenderer));


    // Adding an impossible renderer to help discover impossible scenarios in the tileset.
    let impossibleRenderer = new ImpossibleRenderer(size, this.tilesetMatcher);
    this.overlays.push(new Overlay(createVector(20 + tilesetRenderer.getWidth(), 50 + tilesetRenderer.getHeight()), impossibleRenderer))
  }

  update() {
    // update should find and fill in one square each frame.
    this.collapseFunction.update();
  }

  mouseMove(mx, my) {
    this.mousePos.set(mx, my);

    // TODO check if mousePos is over an overlay first?
    this.collapseFunction.highlight(this.mousePos);
  }

  click(mx, my) {
    this.mousePos.set(mx, my);

    // Check displayed overlays, and fall through to the map underneath if nothing is clicked.
    if (this.clickButtons(this.mousePos)) {
      return;
    }

    for (let overlay of this.overlays) {
      if (overlay.click(this.mousePos)) {
        return;
      }
    }

    // Click went through to the main display.
    let click = this.collapseFunction.click(this.mousePos);
    if (click) {
      // click is a grid location within the collapse
      this.selectedSquare = click.getData();
      this.squareRenderer.setSquare(this.selectedSquare);
    }
  }

  draw() {
    // Draw grid view first below overlays.
    this.collapseFunction.drawWFC(this.tilesetMatcher);

    // Then draw various overlays in order (lowest to highest);
    this.drawButtons();

    for (let overlay of this.overlays) {
      overlay.show();
    }
  }

  drawButtons() {
    let x = 15
    let y = 20;
    fill(255);
    textSize(15);
    noStroke();
    text("show tiles", x, y + 15);
    text("show clusters", x + 100, y + 15);
    text("reset", x + 200, y + 15);

    // Rectangles around the button.
    noFill();
    stroke(255);
    rect(x, y, 100, 20);
    rect(x + 100, y, 100, 20);
    rect(x + 200, y, 200, 20);
  }

  clickButtons(mousePos) {
    let x = 15
    let y = 20;
    let dy = mousePos.y - y;
    let dx = mousePos.x - x;
    if (dy > 0 && dy < 20 && dx > 0 && dx < 100) {
      console.log("Toggle tileset display");
      this.tilesetOverlay.toggleDisplay();
      return true;
    }
    dx = mousePos.x - x - 100;
    if (dy > 0 && dy < 20 && dx > 0 && dx < 100) {
      console.log("Toggle clusters display");
      this.clustersOverlay.toggleDisplay();
      return true;
    }
    dx = mousePos.x - x - 200;
    if (dy > 0 && dy < 20 && dx > 0 && dx < 100) {
      console.log("clicked on reset");
      this.collapseFunction.reset();
      return true;
    }
  }
}
