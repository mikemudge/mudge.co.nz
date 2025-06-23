class ClusterRenderer {
  constructor(overlay, tilesetMatcher, size) {
    this.overlay = overlay;
    this.tilesetMatcher = tilesetMatcher;
    this.size = size;

    this.overlay.setName("Clusters");
    this.overlay.setSpace(this.getWidth(), this.getHeight());
    this.overlay.setRenderer(this);
  }

  getWidth() {
    let maxCluster = this.tilesetMatcher.clusters[0].length;
    for (let cluster of this.tilesetMatcher.clusters) {
      maxCluster = Math.max(maxCluster, cluster.length);
    }
    return 20 + maxCluster * this.size.x;
  }

  getHeight() {
    return this.tilesetMatcher.clusters.length * (this.size.y + 5);
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
  constructor(overlay, size, scale) {
    this.size = size;
    this.scale = scale;
    this.tile = null;
    this.pixelSize = null;
    this.overlay = overlay;
    this.overlay.setName("Tile");
    this.overlay.setSpace(this.getWidth(), this.getHeight());
    this.overlay.setRenderer(this);
    this.overlay.setDisplayed(false);
  }

  setTile(tile) {
    if (!tile) {
      this.tile = null;
      this.overlay.setDisplayed(false);
    } else {
      this.tile = tile;
      this.overlay.setDisplayed(true);
      this.overlay.setName("Tile " + this.tile.name);
      this.pixelSize = createVector(this.size.x / this.tile.image.width * this.scale, this.size.y / this.tile.image.height * this.scale);
    }
    console.log("Showing tile for", this.tile);
  }

  getWidth() {
    return this.size.x * this.scale + 10;
  }

  getHeight() {
    return this.size.y * this.scale + 40 + (this.size.y + 4) * 4;
  }

  // Display an enlarged tile with hover pixel colors, and the tiles it can match against in each direction.
  show() {
    // Display a large view of the tile.
    let bigSize = this.size.copy().mult(this.scale);
    stroke('white');
    noSmooth();
    if (this.tile.image) {
      // draw a rectangle and display the tile within it.
      rect(5, 5, bigSize.x + 1, bigSize.y + 1);
      this.tile.show(5, 5, bigSize.x, bigSize.y);
      if (this.lastClickedPixel) {
        // Highlight the clicked pixel.
        noFill();
        rect(5 + this.lastClickedPixel.x * this.pixelSize.x, 5 + this.lastClickedPixel.y * this.pixelSize.y, this.pixelSize.x, this.pixelSize.y);
      }
    }

    if (this.hoverPixel) {
      this.showPixelColor(5, bigSize.y + 10, this.hoverPixel);
    } else if (this.lastClickedPixel) {
      this.showPixelColor(5, bigSize.y + 10, this.lastClickedPixel);
    }

    push();
    translate(0, bigSize.y + 40);
    this.showConnections();
    pop();
  }

  showPixelColor(x, y, loc) {
    let pixel = this.tile.getPixel(loc.x, loc.y);

    // Fill a small swatch with the color of the pixel.
    noStroke();
    fill(pixel);
    rect(x, y, 10, 10);

    // Then in white, display the color string.
    fill(255);
    text(this.tile.colorString(pixel), x + 15, y + 10);
  }

  showConnections() {
    if (!this.tile) {
      return;
    }
    // TODO could use getDirectionTiles?
    let edges = [this.tile.up, this.tile.right, this.tile.down, this.tile.left];
    let letters = ["U", "R", "D", "L"];

    let w = (this.size.x + 4);
    let h = (this.size.y + 4);
    fill(255);
    noStroke();
    textSize(16);
    for (let [y, letter] of letters.entries()) {
      text(letter, 6, this.size.y / 2 + 5 + h * y);
    }

    stroke('white');
    noFill();
    for (let [y, edge] of edges.entries()) {
      for (let i = 0; i < edge.length; i++) {
        edge[i].show(22 + i * w, h * y, this.size.x, this.size.y);
      }
    }
  }

  highlight(mousePos) {
    this.hoverPixel = this.mouseToPixel(mousePos);
  }

  click(mousePos) {
    this.lastClickedPixel = this.mouseToPixel(mousePos);
    return true;
  }

  mouseToPixel(mousePos) {
    // Remove the margin and scale down to 0-1.
    let pixel = mousePos.copy().sub(5, 5).div(this.pixelSize);
    // Then find the pixel x,y within the original image.
    pixel.x = Math.floor(pixel.x);
    pixel.y = Math.floor(pixel.y);
    if (pixel.x >= 0 && pixel.x < this.tile.image.width) {
      if (pixel.y >= 0 && pixel.y < this.tile.image.height) {
        return pixel;
      }
    }
    return null;
  }
}

class PossibleRenderer {
  constructor(overlay, size) {
    this.size = size
    this.square = null;
    this.overlay = overlay;
    this.overlay.setName("Grid Square Possiblities");
    this.overlay.setSpace(this.getWidth(), this.getHeight());
    this.overlay.setRenderer(this);
    this.overlay.setDisplayed(false);
  }

  getWidth() {
    // Width is not clear for this, so just have space for 20 wide?
    return this.size.x * 20;
  }

  getHeight() {
    // TODO we can probably display a grid of possible tiles?
    return this.size.y + 10;
  }

  setSquare(square) {
    if (!square) {
      this.square = null;
      this.overlay.setDisplayed(false);
    } else {
      this.square = square;
      this.overlay.setDisplayed(true);
    }
    console.log("Showing possible options for", this.square);
  }

  show() {
    noStroke();
    fill(255);
    if (this.square.tile) {
      this.square.tile.show(0, 5, this.size.x, this.size.y);
    } else {
      for (let [i, p] of this.square.possible.entries()) {
        p.show(this.size.x + 5 + (this.size.x + 4) * i, 5, this.size.x, this.size.y);
      }
    }
    textSize(10);
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

  getWidth() {
    return this.size.x * 2;
  }

  getHeight() {
    return this.size.y * 2;
  }

  show() {
    // Will always have 3 tiles.
    this.tilesetMatcher.impossible[0].show(0, size.y);
    this.tilesetMatcher.impossible[1].show(0, 0);
    this.tilesetMatcher.impossible[2].show(size.x, 0);
  }

  click(mousePos) {

  }
}

class TilesetRenderer {
  constructor(overlay, tilesetMatcher, tileSetters, size) {
    this.tilesetMatcher = tilesetMatcher;

    this.size = size;
    this.gridHeight = this.tilesetMatcher.tiles.getHeight();
    this.gridWidth = this.tilesetMatcher.tiles.getWidth();

    this.tileSetters = tileSetters;
    this.clicked = [null, null];
    this.clickIndex = 0;
    this.overlay = overlay;
    this.overlay.setName("Tileset");
    this.overlay.setSpace(this.getWidth(), this.getHeight());
    this.overlay.setRenderer(this);

    this.diff = [0, 0, 0, 0];
  }

  getWidth() {
    return this.size.x * this.gridWidth;
  }

  getHeight() {
    return this.size.y * this.gridHeight;
  }

  updateTileMatchStats(t1, t2) {
    for (let d = 0; d < 4; d++) {
      this.diff[d] = this.tilesetMatcher.compareEdgesDifference(d, t1, t2, false);
    }
  }

  show() {
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

    for (let [i, diff] of this.diff.entries()) {
      text(i + " " + diff, 0, this.gridHeight * h + i * 15 + 15);
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
      this.clickIndex = this.clickIndex + 1;
      if (this.clickIndex >= this.clicked.length) {
        // Reset the index.
        this.clickIndex = 0;
        let t1 = this.clicked[0];
        let t2 = this.clicked[1];
        this.updateTileMatchStats(t1, t2);
      }
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

    this.overlays = [];

    let size = createVector(16, 16);

    this.clustersOverlay = new Overlay(createVector(20, 80));
    this.clustersOverlay.setRenderer(new ClusterRenderer(this.clustersOverlay, tilesetMatcher, size));
    // Hide this by default.
    this.clustersOverlay.setDisplayed(false);
    this.overlays.push(this.clustersOverlay);

    let tileRenderers = [
      new TileRenderer(new Overlay(createVector(0, 100)), size, 16),
      new TileRenderer(new Overlay(createVector(0, 100)), size, 16)
    ];
    this.overlays.push(tileRenderers[0].overlay);
    this.overlays.push(tileRenderers[1].overlay);

    this.tilesetOverlay = new Overlay(createVector(20, 80));
    let tilesetRenderer = new TilesetRenderer(this.tilesetOverlay, tilesetMatcher, tileRenderers, createVector(32, 32));
    this.overlays.push(this.tilesetOverlay);

    // Update the positions to be to the right of the tileset.
    tileRenderers[0].overlay.setPos(tilesetRenderer.getWidth() + 50, 100);
    tileRenderers[1].overlay.setPos(tilesetRenderer.getWidth() + 316, 100);

    // Add an overlay to show the collapse function grids possible set for a square.
    this.squareRenderer = new PossibleRenderer(new Overlay(createVector(20, windowHeight - 50)), size)
    this.overlays.push(this.squareRenderer.overlay);

    // Adding an impossible renderer to help discover impossible scenarios in the tileset.
    // let impossibleRenderer = new ImpossibleRenderer(size, this.tilesetMatcher);
    // this.overlays.push(new Overlay(createVector(20 + tilesetRenderer.getWidth(), 50 + tilesetRenderer.getHeight()), impossibleRenderer))

    this.reverseOverlays = this.overlays.toReversed();
  }

  update() {
    // update should find and fill in one square each frame.
    this.collapseFunction.update();
  }

  mouseMove(mx, my) {
    this.mousePos.set(mx, my);

    for (let overlay of this.reverseOverlays) {
      if (overlay.highlight(this.mousePos)) {
        return;
      }
    }

    this.collapseFunction.highlight(this.mousePos);
  }

  click(mx, my) {
    this.mousePos.set(mx, my);

    // Check displayed overlays, and fall through to the map underneath if nothing is clicked.
    if (this.clickButtons(this.mousePos)) {
      return;
    }

    for (let overlay of this.reverseOverlays) {
      if (overlay.click(this.mousePos)) {
        console.log("clicked on", overlay.name);
        return;
      }
    }

    // Click went through to the main display.
    let click = this.collapseFunction.click(this.mousePos);
    if (click) {
      // click is a grid location within the collapse
      this.squareRenderer.setSquare(click.getData());
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
