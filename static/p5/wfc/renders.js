import {Overlay} from "./overlay.js";
import {EAST, SOUTH} from "./tile.js";

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
    // The focused tile is shown smaller, and its possible neighbours a bit larger (but
    // capped well below the main tile's scale so a whole row still fits on screen).
    this.mainScale = scale / 2;
    this.neighbourScale = 2;
    this.labelWidth = 70;
    this.tile = null;
    this.pixelSize = null;
    this.hoverPixel = null;
    this.hoverNeighbour = null;
    this.lastClickedPixel = null;
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
        this.pixelSize = createVector(this.size.x / this.tile.image.width * this.mainScale, this.size.y / this.tile.image.height * this.mainScale);
      }
      // Reset the clicked/hover state for the new tile.
      this.hoverPixel = null;
      this.hoverNeighbour = null;
      this.lastClickedPixel = null;
      // The overlay needs to grow/shrink to fit however many neighbours this tile has.
      this.overlay.setSpace(this.getWidth(), this.getHeight());
    }
    console.log("Showing tile for", this.tile);
  }

  isClicked(tile) {
    return this.tile === tile;
  }

  getBigSize() {
    return this.size.copy().mult(this.mainScale);
  }

  getNeighbourSize() {
    return this.size.copy().mult(this.neighbourScale);
  }

  maxNeighbourCount() {
    if (!this.tile) {
      return 0;
    }
    return Math.max(this.tile.up.length, this.tile.right.length, this.tile.down.length, this.tile.left.length);
  }

  getWidth() {
    let neighbourSize = this.getNeighbourSize();
    let neighbourWidth = this.labelWidth + this.maxNeighbourCount() * (neighbourSize.x + 4);
    return Math.max(this.getBigSize().x + 10, neighbourWidth);
  }

  getHeight() {
    let neighbourSize = this.getNeighbourSize();
    // Tile preview + pixel colour swatch, then 4 direction rows, then a line for the hover tooltip.
    return this.getBigSize().y + 40 + (neighbourSize.y + 4) * 4 + 16;
  }

  // Display an enlarged tile with hover pixel colors, and the tiles it can match against in each direction.
  show() {
    // Display a large view of the tile.
    let bigSize = this.getBigSize();
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

    // The z-layer (ground vs object) determines which layer's grid this tile can actually
    // appear in — surface it here since it's not otherwise visible. Prefer the classification
    // TileSetEdgeMatcher.findAllClusters() actually assigned (zLayer), since an opaque tile
    // can still end up classified as an object if it connects to one; fall back to the raw
    // pixel check for tiles that haven't been through classification yet (e.g. solo items).
    let layerLabel = !this.tile.image ? "empty" : (this.tile.zLayer || (this.tile.hasTransparentPixel() ? "object" : "ground"));
    fill(255);
    noStroke();
    textSize(12);
    text("Layer: " + layerLabel, 5, bigSize.y + 35);

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
    let edges = [this.tile.up, this.tile.right, this.tile.down, this.tile.left];
    let labels = ["Up", "Right", "Down", "Left"];
    let neighbourSize = this.getNeighbourSize();
    let w = neighbourSize.x + 4;
    let h = neighbourSize.y + 4;

    // Alternating row backgrounds so each direction's neighbours are easy to tell apart.
    noStroke();
    for (let [y, edge] of edges.entries()) {
      fill(y % 2 === 0 ? 50 : 40);
      rect(0, h * y, this.labelWidth + edge.length * w, h);
    }

    fill(255);
    noStroke();
    textSize(11);
    for (let [y, label] of labels.entries()) {
      text(label + " (" + edges[y].length + ")", 4, h * y + h / 2 + 4);
    }

    stroke(255);
    noFill();
    for (let [y, edge] of edges.entries()) {
      for (let i = 0; i < edge.length; i++) {
        let x = this.labelWidth + i * w;
        edge[i].showTileAt(x, h * y, neighbourSize.x, neighbourSize.y);
        rect(x, h * y, neighbourSize.x, neighbourSize.y);
      }
    }

    // Highlight the hovered neighbour and show its name, so it's clear what you're
    // about to click through to.
    if (this.hoverNeighbour) {
      for (let [y, edge] of edges.entries()) {
        let i = edge.indexOf(this.hoverNeighbour);
        if (i !== -1) {
          stroke(255, 255, 0);
          noFill();
          rect(this.labelWidth + i * w, h * y, neighbourSize.x, neighbourSize.y);
          noStroke();
          fill(255);
          textSize(12);
          text(this.hoverNeighbour.name, 4, h * edges.length + 12);
          break;
        }
      }
    }
  }

  // Maps a mouse position (relative to the top of the connections area) to the neighbour
  // tile drawn there, or null if it's not over one.
  neighbourAt(x, y) {
    if (!this.tile) {
      return null;
    }
    let edges = [this.tile.up, this.tile.right, this.tile.down, this.tile.left];
    let neighbourSize = this.getNeighbourSize();
    let w = neighbourSize.x + 4;
    let h = neighbourSize.y + 4;
    let row = Math.floor(y / h);
    if (row < 0 || row >= edges.length) {
      return null;
    }
    let col = Math.floor((x - this.labelWidth) / w);
    if (col < 0 || col >= edges[row].length) {
      return null;
    }
    return edges[row][col];
  }

  highlight(mousePos) {
    if (!this.tile) {
      return;
    }
    let connectionsY = this.getBigSize().y + 40;
    if (mousePos.y >= connectionsY) {
      this.hoverNeighbour = this.neighbourAt(mousePos.x, mousePos.y - connectionsY);
      this.hoverPixel = null;
      return;
    }
    this.hoverNeighbour = null;
    if (!this.tile.image) {
      return;
    }
    this.hoverPixel = this.mouseToPixel(mousePos);
  }

  click(mousePos) {
    if (!this.tile) {
      return true;
    }
    let connectionsY = this.getBigSize().y + 40;
    if (mousePos.y >= connectionsY) {
      // Clicking a neighbour jumps to it, so the connection graph can be explored by
      // clicking through it rather than needing a separate global view.
      let neighbour = this.neighbourAt(mousePos.x, mousePos.y - connectionsY);
      if (neighbour) {
        this.setTile(neighbour);
      }
      return true;
    }
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
  constructor(overlay, grid, size, edgeScoreThreshold = 1.0) {
    this.tileGrid = grid;

    this.size = size;
    this.edgeScoreThreshold = edgeScoreThreshold;

    this.tileTarget = null;
    this.overlay = overlay;
    this.overlay.setName("Tileset");
    this.overlay.setSpace(this.getWidth(), this.getHeight());
    this.overlay.setRenderer(this);
  }

  setTileTarget(tileTarget) {
    this.tileTarget = tileTarget;
  }

  setEdgeScoreThreshold(threshold) {
    this.edgeScoreThreshold = threshold;
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

    // Overlay lines on the shared border between adjacent tiles in the sheet, coloured by
    // whether WFCTile.edgeScore is at/below (green) or above (red) the threshold used for
    // auto-detection — a quick visual sanity check on which spritesheet-adjacent tiles the
    // detector considers a good join.
    strokeWeight(2);
    for (let y = 0; y < this.tileGrid.getHeight(); y++) {
      for (let x = 0; x < this.tileGrid.getWidth(); x++) {
        let tile = this.tileGrid.getTile(x, y).getData();
        if (!tile) {
          continue;
        }
        if (x + 1 < this.tileGrid.getWidth()) {
          let right = this.tileGrid.getTile(x + 1, y).getData();
          if (right) {
            let score = tile.edgeScore(EAST, right);
            stroke(score <= this.edgeScoreThreshold ? color(0, 255, 0) : color(255, 0, 0));
            line((x + 1) * w, y * h, (x + 1) * w, (y + 1) * h);
          }
        }
        if (y + 1 < this.tileGrid.getHeight()) {
          let down = this.tileGrid.getTile(x, y + 1).getData();
          if (down) {
            let score = tile.edgeScore(SOUTH, down);
            stroke(score <= this.edgeScoreThreshold ? color(0, 255, 0) : color(255, 0, 0));
            line(x * w, (y + 1) * h, (x + 1) * w, (y + 1) * h);
          }
        }
      }
    }
    strokeWeight(1);

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
    this.edgeScores = [0, 0, 0, 0];


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
        this.edgeScores[d] = this.clicked[0].edgeScore(d, this.clicked[1]);
      }

      this.tilesetMatcher.compareEdges(EAST, this.clicked[0], this.clicked[1]);
    }
  }

  isClicked(tile) {
    return this.clicked.includes(tile);
  }

  show() {
    const directionLabels = ["N", "E", "S", "W"];
    for (let [i, diff] of this.diff.entries()) {
      text(directionLabels[i] + " " + diff + " score:" + this.edgeScores[i].toFixed(2), 0, i * 15 + 15);
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

export class WFCOverlay {
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

    this.collapseGrid = this.collapseFunction.getMainLayer();
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
    this.edgeDetectionOverlay = overlay;
    this.edgeDetectionOverlay.setDisplayed(false);

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

    let pos = this.view.toGameGrid(this.mousePos);
    this.mouseMapPos = this.view.toGame(this.mousePos);
    this.hover = this.collapseGrid.getTileAtPos(pos);
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
    let pos = this.view.toGameGrid(this.mousePos);
    this.clicked = this.collapseGrid.getTileAtPos(pos);

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
    text("show edges", x + 300, y + 15);

    // Rectangles around the button.
    noFill();
    stroke(255);
    rect(x, y, 100, 20);
    rect(x + 100, y, 100, 20);
    rect(x + 200, y, 100, 20);
    rect(x + 300, y, 100, 20);
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
    dx = mousePos.x - x - 300;
    if (this.edgeDetectionOverlay && dy > 0 && dy < 20 && dx > 0 && dx < 100) {
      console.log("Toggle edge detection display");
      this.edgeDetectionOverlay.toggleDisplay();
      return true;
    }
  }
}
