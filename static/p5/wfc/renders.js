class ClusterRenderer {
  constructor(overlay, clusters, size) {
    this.overlay = overlay;
    this.clusters = clusters;
    this.size = size;

    this.overlay.setName("Clusters");
    this.overlay.setSpace(this.getWidth(), this.getHeight());
    this.overlay.setRenderer(this);
  }

  getWidth() {
    let maxCluster = this.clusters[0].length;
    for (let cluster of this.clusters) {
      maxCluster = Math.max(maxCluster, cluster.length);
    }
    return 20 + maxCluster * this.size.x;
  }

  getHeight() {
    return this.clusters.length * (this.size.y + 5);
  }

  show() {
    textSize(14);
    fill(255);
    noStroke();

    // Show the clusters
    for (let [y, cluster] of this.clusters.entries()) {
      text("" + y, 0, y * (this.size.y + 5) + 15);

      for (let [x, tile] of cluster.entries()) {
        tile.showTileAt(10 + x * this.size.x, y * (this.size.y + 5), this.size.x, this.size.y);
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
      if (this.tile.image) {
        this.pixelSize = createVector(this.size.x / this.tile.image.width * this.scale, this.size.y / this.tile.image.height * this.scale);
      }
      // Reset the clicked/hover pixels for the new tile.
      this.hoverPixel = null;
      this.lastClickedPixel = null;
    }
    console.log("Showing tile for", this.tile);
  }

  isClicked(tile) {
    return this.tile === tile;
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
      this.tile.showTileAt(5, 5, bigSize.x, bigSize.y);
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
        edge[i].showTileAt(22 + i * w, h * y, this.size.x, this.size.y);
      }
    }
  }

  highlight(mousePos) {
    if (!this.tile.image) {
      return;
    }
    this.hoverPixel = this.mouseToPixel(mousePos);
  }

  click(mousePos) {
    if (!this.tile.image) {
      return true;
    }
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
  constructor(overlay, size, tileRenderer) {
    this.size = size
    this.square = null;
    this.overlay = overlay;
    this.tileRenderer = tileRenderer;
    this.overlay.setName("Grid Square Possiblities");
    this.overlay.setSpace(this.getWidth(), this.getHeight());
    this.overlay.setRenderer(this);
    this.overlay.setDisplayed(false);
  }

  getWidth() {
    // Width is not clear for this, so just have space for 20 wide?
    return (this.size.x + 4) * 12;
  }

  getHeight() {
    // TODO we can probably display a grid of possible tiles?
    return (this.size.y + 4) * 5;
  }

  setSquare(square) {
    if (!square) {
      this.square = null;
      this.overlay.setDisplayed(false);
    } else {
      this.square = square;
      this.overlay.setDisplayed(true);
      if (this.square.tile) {
        this.tileRenderer.setTile(this.square.tile);
      }
    }
    console.log("Showing possible options for", this.square);
  }

  show() {
    noStroke();
    fill(255);
    if (this.square.tile) {
      this.square.tile.showTileAt(this.size.x, this.size.y, this.size.x * 4, this.size.y * 4);
    } else {
      for (let [i, p] of this.square.possible.entries()) {
        let x = (i % 10 + 1) * (this.size.x + 4);
        let y = Math.floor(i / 10) * (this.size.y + 4);
        p.showTileAt(x, y, this.size.x, this.size.y);
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
  constructor(overlay, grid, size) {
    this.tileGrid = grid;

    this.size = size;

    this.tileTarget = null;
    this.overlay = overlay;
    this.overlay.setName("Tileset");
    this.overlay.setSpace(this.getWidth(), this.getHeight());
    this.overlay.setRenderer(this);
  }

  setTileTarget(tileTarget) {
    this.tileTarget = tileTarget;
  }

  getWidth() {
    return this.size.x * this.tileGrid.getWidth();
  }

  getHeight() {
    return this.size.y * this.tileGrid.getHeight();
  }

  show() {
    let w = this.size.y;
    let h = this.size.x;
    for (var y = 0; y < this.tileGrid.getHeight(); y++) {
      for (var x = 0; x < this.tileGrid.getWidth(); x++) {
        let tile = this.tileGrid.getTile(x, y).getData();
        if (!tile) {
          continue;
        }
        tile.showTileAt(x * w, y * h, w, h);

        // If this one is selected, show a border around it.
        if (this.tileTarget && this.tileTarget.isClicked(tile)) {
          noFill();
          stroke(255, 0, 0);
          rect(x * w, y * h, w, h)
        }
      }
    }

    // Overlay the index of each tile to aid debugging.
    textSize(10);
    fill(255);
    noStroke();
    for (var y = 0; y < this.tileGrid.getHeight(); y++) {
      for (var x = 0; x < this.tileGrid.getWidth(); x++) {
        text(x + "," + y, x * w + 3, y * h + 10);
      }
    }
  }

  click(pos) {
    let x = Math.floor(pos.x / this.size.x);
    let y = Math.floor(pos.y / this.size.y);
    // Default to no selection.
    let clicked = this.tileGrid.getTile(x, y).getData();

    if (clicked) {
      console.log("Tileset Render click on", clicked);
      if (this.tileTarget) {
        this.tileTarget.setTile(clicked);
      }
      return true;
    }
  }
}

class EdgeDetectionRenderer {
  constructor(overlay, tilesetMatcher, tileSetters) {
    this.overlay = overlay;
    this.tilesetMatcher = tilesetMatcher;
    this.tileSetters = tileSetters;
    this.clicked = [null, null];
    this.clickIndex = 0;
    this.diff = [0, 0, 0, 0];


    this.overlay.setName("Edge Detection");
    this.overlay.setSpace(this.getWidth(), this.getHeight());
    this.overlay.setRenderer(this);
  }

  getWidth() {
    return 320;
  }

  getHeight() {
    return 300;
  }

  setTile(tile) {
    this.clicked[this.clickIndex] = tile;
    this.tileSetters[this.clickIndex].setTile(tile);
    this.clickIndex += 1;

    if (this.clickIndex >= this.clicked.length) {
      // Reset the index.
      this.clickIndex = 0;
      for (let d = 0; d < 4; d++) {
        this.diff[d] = this.tilesetMatcher.compareEdgesDifference(d, this.clicked[0], this.clicked[1], false);
      }

      this.tilesetMatcher.compareEdges(1, this.clicked[0], this.clicked[1]);
    }
  }

  isClicked(tile) {
    return this.clicked.includes(tile);
  }

  show() {
    for (let [i, diff] of this.diff.entries()) {
      text(i + " " + diff, 0, i * 15 + 15);
    }

    // Draw the image.
    if (this.tilesetMatcher.edgeDetectionImage) {
      noSmooth();
      image(this.tilesetMatcher.edgeDetectionImage, 0, 60, 320, 160);
      let x = 160
      stroke(255, 255, 0);
      noFill();
      rect(x - 10, 60, 10 * 2, 160);

      text(this.tilesetMatcher.tileEdgeAverage, 0, 230);
      text(this.tilesetMatcher.totalEdgeAverage, 0, 245);

    }
  }
}

class WFCOverlay {
  constructor(collapseFunction, view, size, grid) {
    this.collapseFunction = collapseFunction;
    this.view = view;
    this.mousePos = createVector(0, 0);
    this.mouseMapPos = createVector(0, 0);
    // A place to store a tile which was clicked on.
    this.clicked = null;
    this.hover = null;

    this.tilesetOverlay = new Overlay(createVector(20, 80));
    this.tilesetRenderer = new TilesetRenderer(this.tilesetOverlay, grid, createVector(32, 32));

    let tile1 = new TileRenderer(new Overlay(createVector(50 + this.tilesetRenderer.getWidth(), 100)), size, 16);
    this.tilesetRenderer.setTileTarget(tile1);
    this.tileRenderer = tile1;

    // Add an overlay to show the collapse function grids possible set for a square.
    this.squareRenderer = new PossibleRenderer(new Overlay(createVector(20, windowHeight - 100)), size, tile1);

    // Adding an impossible renderer to help discover impossible scenarios in the tileset.
    // let impossibleRenderer = new ImpossibleRenderer(size, this.tilesetMatcher);
    // this.overlays.push(new Overlay(createVector(20 + tilesetRenderer.getWidth(), 50 + tilesetRenderer.getHeight()), impossibleRenderer))

    this.overlays = [];

    this.overlays.push(this.tilesetOverlay);
    this.overlays.push(tile1.overlay);
    this.overlays.push(this.squareRenderer.overlay);
    this.reverseOverlays = this.overlays.toReversed();
  }

  addTilesetMatcher(tilesetMatcher, size) {
    this.clustersOverlay = new Overlay(createVector(20, 80));
    // TODO will tilesetMatcher.clusters be set here?
    this.clustersOverlay.setRenderer(new ClusterRenderer(this.clustersOverlay, tilesetMatcher.clusters, size));
    this.clustersOverlay.setDisplayed(false);

    let x = 50 + this.tilesetRenderer.getWidth() + this.tileRenderer.getWidth();
    let tile2 = new TileRenderer(new Overlay(createVector(x, 100)), size, 16);
    let tileRenderers = [this.tileRenderer, tile2];

    let overlay = new Overlay(createVector(20, this.tilesetRenderer.getHeight()));
    let edgeDetectionRender = new EdgeDetectionRenderer(overlay, tilesetMatcher, tileRenderers);
    this.tilesetRenderer.setTileTarget(edgeDetectionRender);

    // Add extra overlays
    this.overlays.push(this.clustersOverlay);
    this.overlays.push(overlay);
    this.overlays.push(tile2.overlay);

    // Redo this after adding more overlays.
    this.reverseOverlays = this.overlays.toReversed();
  }

  update() {
    this.view.update();
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

    let pos = this.view.toGameGridFloor(this.mousePos);
    this.mouseMapPos = this.view.toGame(this.mousePos);
    this.hover = this.collapseFunction.getTileAtPos(pos);
    if (this.hover.getData() == null) {
      this.hover = null;
    }
  }

  click(mx, my) {
    this.mousePos.set(mx, my);

    // Check displayed overlays, and fall through to the map underneath if nothing is clicked.
    if (this.clickButtons(this.mousePos)) {
      return;
    }

    for (let overlay of this.reverseOverlays) {
      if (overlay.click(this.mousePos)) {
        console.log("Overlay clicked on", overlay.name);
        return;
      }
    }

    // Click went through to the main display.
    let pos = this.view.toGameGridFloor(this.mousePos);
    this.clicked = this.collapseFunction.getTileAtPos(pos);
    if (this.clicked.getData() == null) {
      this.clicked = null;
    } else {
      // click is a grid location within the collapse
      this.squareRenderer.setSquare(this.clicked.getData());
    }
  }

  showSquare(sq, size) {
    if (sq.tile) {
      sq.tile.show(size);
    } else {
      if (sq.possibleCounts) {
        fill(255);
        noStroke();
        text(sq.possible.length, 5, 15);
      }
      stroke(70);
      noFill();
      this.view.showHighlight(size);
    }
    if (sq.failed) {
      stroke(255, 0, 0);
      strokeWeight(3);
      noFill();
      this.view.showHighlight(size);
    }
  }

  vectorString(pos) {
    return Math.round(pos.x) + ", " + Math.round(pos.y);
  }

  draw() {
    // Draw grid view first below overlays.
    for (let layer of this.collapseFunction.getLayers()) {
      this.view.drawMapWith(layer, this.showSquare.bind(this));
    }
    // view.coverEdges();

    // TODO this looks weird in ISO?
    let pos = this.view.toScreen(this.view.center);
    fill(255, 255, 0)
    circle(pos.x, pos.y, 5, 5);

    // Show select/hover for the map.
    if (this.hover) {
      stroke(0, 255, 0);
      noFill();
      this.view.showAtGridLoc(this.hover, this.view.showHighlight.bind(this.view));
    }

    let loc = this.view.toScreen(this.mouseMapPos);
    fill(255, 255, 0);
    noStroke();
    text(this.vectorString(this.mouseMapPos), loc.x + 3, loc.y - 2);
    circle(loc.x, loc.y, 5);

    if (this.clicked) {
      stroke(255, 255, 0);
      noFill();
      this.view.showAtGridLoc(this.clicked, this.view.showHighlight.bind(this.view));
    }

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
    if (this.clustersOverlay && dy > 0 && dy < 20 && dx > 0 && dx < 100) {
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
