class ImpossibleCollapse extends Error {
  constructor(square, possible, allowed) {
    super();
    this.square = square;
    this.possible = possible;
    this.allowed = allowed;
  }
}

class Square {
  constructor(x, y, z) {
    this.pos = createVector(x, y);
    this.z = z;
    this.possible = [];
    this.tile = null;
    this.failed = false;
    this.possibleCounts = false;
  }

  update() {

  }

  setPossible(possible) {
    this.possible = possible;
  }
  showPossibleCount(possibleCounts) {
    this.possibleCounts = possibleCounts;
  }
  collapse() {
    if (this.tile) {
      // Already collapsed.
      return;
    }

    this.tile = random(this.possible);
    this.possible = [this.tile];
  }

  getPossibleDirectionTiles() {
    let result = [[], [], [], [], [], []];
    for (let wfcTile of this.possible) {
      let allowedNeighbours = wfcTile.getDirectionTiles();
      for (let d = 0; d < allowedNeighbours.length; d++) {
        // For each possible tile, include its allowed neighbours in each direction.
        for (let t of allowedNeighbours[d]) {
          result[d].push(t);
        }
      }
    }
    return result;
  }
  reducePossible(allowed) {
    if (this.tile) {
      // Already collapsed.
      return false;
    }
    // remove all possible which are not in the set of allowed tiles passed from an adjacent tile.
    let prev = this.possible;
    this.possible = this.possible.filter(function(p) {
      return allowed.includes(p);
    });

    if (this.possible.length === 0) {
      // The provided allowed set reduced this locations possible to nothing.
      throw new ImpossibleCollapse(this, prev, allowed);
    }
    // The set of possible is reduced.
    return this.possible.length < prev.length;
  }

  setFailed() {
    this.failed = true;
  }

  showHighlight(size) {
    stroke(0, 255, 0);
    noFill();
    rect(0, 0, size * 2, size * 2);
  }

  showPossible(x, y, size) {
    noStroke();
    fill(255);
    if (this.tile) {
      this.tile.show(x, y, size * 2, size * 2);
    } else {
      for (let [i, p] of this.possible.entries()) {
        p.show(x + size * i * 1.5, y, size, size);
      }
    }
    text(this.getLocationString(), x, y + 10);
  }

  show(size) {
    if (!this.tile) {
      if (this.possibleCounts) {
        fill(255);
        noStroke();
        text(this.possible.length, 5, 15);
      }
      stroke(70);
      noFill();
      rect(0, 0, size * 2, size * 2);
      if (this.failed) {
        stroke(255, 0, 0);
        strokeWeight(3);
        noFill();
        rect(0, 0, size * 2, size * 2);
      }
      return;
    }
    if (this.tile.image) {
      image(this.tile.image, 0, 0, size * 2, size * 2);
    }
    if (this.failed) {
      stroke(255, 0, 0);
      strokeWeight(3);
      noFill();
      rect(0, 0, size * 2, size * 2);
      return;
    }
  }

  up() {
    return this.grid.get(this.pos.x, this.pos.y - 1);
  }
  down() {
    return this.grid.get(this.pos.x, this.pos.y + 1);
  }
  left() {
    return this.grid.get(this.pos.x - 1, this.pos.y);
  }
  right() {
    return this.grid.get(this.pos.x + 1, this.pos.y);
  }

  getLocationString() {
    return this.pos.x + "," + this.pos.y;
  }
}

class WFCTile {
  constructor(img, name) {
    this.image = img;
    this.name = name;
    // Register which tiles can be adjacent to this in various directions.
    this.left = [];
    this.right = [];
    this.up = [];
    this.down = [];
    this.below = [];
    this.above = [];
    this.edges = [[],[],[],[]];
    this.edgeTypeCounts = {};
    this.edgeTypes = [];
    this.debug = false;
  }
  copy() {
    let t = new WFCTile(this.image, this.name + " copy");
    t.up = [...this.up];
    t.right = [...this.right];
    t.down = [...this.down];
    t.left = [...this.left];
    t.edges = [...this.edges];
    t.edgeTypeCounts = Object.assign({}, this.edgeTypeCounts);
    t.edgeTypes = [...this.edgeTypes];
    return t;
  }

  setDebug(debug) {
    this.debug = debug;
  }
  addRight(tile) {
    if (!this.right.includes(tile)) {
      this.right.push(tile);
    }
  }
  addLeft(tile) {
    if (!this.left.includes(tile)) {
      this.left.push(tile);
    }
  }
  addUp(tile) {
    if (!this.up.includes(tile)) {
      this.up.push(tile);
    }
  }
  addDown(tile) {
    if (!this.down.includes(tile)) {
      this.down.push(tile);
    }
  }
  addAbove(tile) {
    if (!this.above.includes(tile)) {
      this.above.push(tile);
    }
  }
  addBelow(tile) {
    if (!this.below.includes(tile)) {
      this.below.push(tile);
    }
  }
  removeUp(tile) {
    const index = this.up.indexOf(tile);
    if (index !== -1) {
      this.up.splice(index, 1);
    }
  }
  removeDown(tile) {
    const index = this.down.indexOf(tile);
    if (index !== -1) {
      this.down.splice(index, 1);
    }
  }
  removeRight(tile) {
    const index = this.right.indexOf(tile);
    if (index !== -1) {
      this.right.splice(index, 1);
    }
  }
  removeLeft(tile) {
    const index = this.left.indexOf(tile);
    if (index !== -1) {
      this.left.splice(index, 1);
    }
  }

  getDirectionTiles() {
    return [
      this.up,
      this.right,
      this.down,
      this.left,
      this.above,
      this.below
    ]
  }

  getEdgeCount(type) {
    return this.edgeTypeCounts[type] || 0;
  }
  getEdgeType(dir) {
    return this.edgeTypes[dir];
  }
  setEdgeType(dir, type) {
    this.edgeTypes[dir] = type;
  }

  calculateEdges() {
    this.edges = [[], [], [], []];
    // Assuming width/height are the same.
    for (let i = 0; i < this.image.width; i++) {
      // Calculate pixel indexes for each edge for NESW.
      // These go left to right or top to bottom.
      let pi = [
        i * 4,
        (i * this.image.width + this.image.width - 1) * 4,
        ((this.image.width - 1) * this.image.width + i) * 4,
        i * this.image.width * 4
      ];
      for (let d = 0; d < 4; d++) {
        let r = this.image.pixels[pi[d]];
        let g = this.image.pixels[pi[d] + 1];
        let b = this.image.pixels[pi[d] + 2];
        let a = this.image.pixels[pi[d] + 3];
        this.edges[d].push([r, g, b, a]);
      }
    }
  }

  classifyEdges() {
    this.edgeTypeCounts = {};
    this.edgeTypes = ["", "", "", ""];
    for (let d = 0; d < this.edges.length; d++) {
      let edgeLength = this.edges[d].length;
      // TODO this could use a median?
      // currently using the middle of the edge.
      let averagePixel = this.edges[d][7];
      let alphaPixels = 0;
      let blankPixels = 0;
      let samePixels = 0;
      // Assuming width/height are the same.
      for (let i = 0; i < this.image.width; i++) {
        let pixel = this.edges[d][i];
        if (this.isTransparent(pixel)) {
          // Check alpha channel is empty.
          alphaPixels++;
        } else if (this.isBlank(pixel)) {
          // Check RGB against the blank edge color.
          blankPixels++;
        } else if (pixel[0] === averagePixel[0] && pixel[1] === averagePixel[1] && pixel[2] === averagePixel[2]) {
          // Check RGB against the average pixel.
          samePixels++;
        }
      }


      let type = "";
      if (alphaPixels >= edgeLength - edgeLength / 8) {
        type = "transparent"
      } else if (blankPixels > edgeLength - edgeLength / 8) {
        type = "blank";
      } else if (alphaPixels + blankPixels > edgeLength - edgeLength / 8) {
        if (blankPixels > edgeLength / 2) {
          type = "blank";
        } else {
          type = "transparent";
        }
      } else if (samePixels > edgeLength - edgeLength / 8) {
        type = "same";
      } else {
        type = "colored";
        // TODO add this edge to a cluster to help with matching.
      }
      this.edgeTypes[d] = type;
      this.edgeTypeCounts[type] = (this.edgeTypeCounts[type] || 0) + 1;
    }
  }

  isBlank(pixel) {
    return pixel[0] === 63 && pixel[1] === 38 && pixel[2] === 49;
  }
  isTransparent(pixel) {
    return pixel[3] === 0;
  }
  isIsolated() {
    // If the number of colored and same edges is 0 then this is an isolated tile.
    return (this.edgeTypeCounts['same'] ?? 0) + (this.edgeTypeCounts['colored'] ?? 0) === 0;
  }
  anyEdgeUnconnectable() {
    let edges = this.getDirectionTiles();
    for (let d = 0; d < 4; d++) {
      if (edges[d].length === 0) {
        return true;
      }
    }
    return false;
  }

  show(x, y, w, h) {
    if (this.image) {
      image(this.image, x, y, w, h);
    } else {
      // Show empty tile.
      fill(255);
      noStroke();
      text("E", x + 5, y + 15);
    }
  }
  colorString(pixel) {
    if (pixel[3] === 0) {
      // Completely transparent.
      return "0";
    }
    return pixel[0]+","+pixel[1]+","+pixel[2];
  }
  showEdges(x, y, scale) {

    textSize(16);
    fill('white');
    noStroke();

    text(this.edgeTypes[0], x - 20 + this.image.width * scale / 2, y);
    text(this.edgeTypes[1], x + this.image.width * scale, y + this.image.height * scale / 2);
    text(this.edgeTypes[2], x - 20 + this.image.width * scale / 2, y + this.image.height * scale);
    text(this.edgeTypes[3], x, y + this.image.height * scale / 2);

    textSize(10);

    for (let i = 0; i < this.image.width; i++) {
      text(this.colorString(this.edges[3][i]), x, y + scale / 2 + i * scale);
      text(this.colorString(this.edges[1][i]), x + this.image.width * scale - scale * 2, y + scale / 2 + i * scale);

      let topPixel = this.edges[0][i];
      if (topPixel[3] === 0) {
        // transparent
        text("0", x + i * scale, y - 30);
      } else {
        for (let ii = 0; ii < 3; ii++) {
          text(topPixel[ii], x + i * scale, y - 30 + 10 * ii);
        }
      }

      let bottomPixel = this.edges[2][i];
      if (bottomPixel[3] === 0) {
        // transparent
        text("0", x + i * scale, y - 30);
      } else {
        for (let ii = 0; ii < 3; ii++) {
          text(bottomPixel[ii], x + i * scale, y + this.image.width * scale + 10 + 10 * ii);
        }
      }
    }
  }
}

/* goes through a tileset and creates WFCTile's with possible tiles in each direction */
class TileSetEdgeMatcher {

  constructor(tileset, tileWidth, tileHeight, scale) {
    // this.total = 0;
    // this.totalDiff = [0, 0, 0, 0];
    let tilesAcross = tileset.width / tileWidth;
    let tilesDown = tileset.height / tileHeight;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    if (tileWidth !== tileHeight) {
      console.warn("non square tiles are not currently well supported");
    }
    this.scale = scale;
    this.tiles = new Grid(tilesAcross, tilesDown, tileWidth * scale);
    console.log("Tile set loaded", tilesAcross, tilesDown);
    for (var y = 0; y < tilesDown; y += 1) {
      for (var x = 0; x < tilesAcross; x += 1) {
        let img = tileset.get(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
        let tile = new WFCTile(img, x +"," + y);
        this.tiles.setTileData(x, y, tile);
      }
    }

    this.allTiles = [];
    for (var y = 0; y < this.tiles.getHeight(); y++) {
      for (var x = 0; x < this.tiles.getWidth(); x++) {
        this.allTiles.push(this.tiles.getTile(x, y).getData());
      }
    }

    console.log("Tiles loaded", this.tiles);
  }

  get(x, y) {
    return this.tiles.getTile(x, y);
  }

  getData(x, y) {
    return this.tiles.getTile(x, y).getData();
  }

  debug(x, y) {
    this.getData(x, y).setDebug(true);
  }

  connectDirection(d, a, b) {
    if (d === 0) {
      this.connectY(b, a);
    } else if (d === 1) {
      this.connectX(a, b);
    } else if (d === 2) {
      this.connectY(a, b);
    } else if (d === 3) {
      this.connectX(b, a);
    }
  }

  multiConnectX(a, b) {
    for (let a1 of a) {
      for (let b1 of b) {
        this.connectX(a1, b1);
      }
    }
  }

  connectX(a, b) {
    a.addRight(b);
    b.addLeft(a);
  }
  disconnectX(a, b) {
    a.removeRight(b);
    b.removeLeft(a);
  }
  multiConnectY(a, b) {
    for (let a1 of a) {
      for (let b1 of b) {
        this.connectY(a1, b1);
      }
    }
  }
  multiDisconnectY(a, b) {
    for (let a1 of a) {
      for (let b1 of b) {
        this.disconnectY(a1, b1);
      }
    }
  }
  disconnectY(a, b) {
    a.removeDown(b);
    b.removeUp(a);
  }
  connectY(a, b) {
    a.addDown(b);
    b.addUp(a);
  }
  multiConnectZ(a, b) {
    for (let a1 of a) {
      for (let b1 of b) {
        this.connectZ(a1, b1);
      }
    }
  }
  connectZ(a, b) {
    a.addAbove(b);
    b.addBelow(a);
  }

  interchangable(arr) {
    for (let t1 of arr) {
      for (let t2 of arr) {
        this.connectX(t1, t2);
        this.connectY(t1, t2);
      }
    }
  }

  removeConnections(tiles) {
    for (let t of tiles) {
      for (let t1 of t.up) {
        t1.down.splice(t1.down.indexOf(t), 1);
      }
      for (let t1 of t.left) {
        t1.right.splice(t1.right.indexOf(t), 1);
      }
      for (let t1 of t.down) {
        t1.up.splice(t1.up.indexOf(t), 1);
      }
      for (let t1 of t.right) {
        t1.left.splice(t1.left.indexOf(t), 1);
      }
      t.up = [];
      t.down = [];
      t.left = [];
      t.right = [];
    }
  }

  drawTileset(sx, sy) {
    // background
    fill(159);
    stroke(255);
    let w = this.tileWidth * this.scale;
    let h = this.tileHeight * this.scale;
    rect(sx, sy, this.tiles.getWidth() * w, this.tiles.getHeight() * h)

    for (var y = 0; y < this.tiles.getHeight(); y++) {
      for (var x = 0; x < this.tiles.getWidth(); x++) {
        let tile = this.get(x, y).getData();
        tile.show(sx + x * w, sy + y * h, w, h);
      }
    }

    // Overlay the index of each tile to aid debugging.
    textSize(14);
    fill(255);
    noStroke();
    for (var y = 0; y < this.tiles.getHeight(); y++) {
      for (var x = 0; x < this.tiles.getWidth(); x++) {
        text(x + "," + y, x * w + sx + 5, y * h + sy + 15);
      }
    }
  }

  showClusters(x, y) {
    textSize(14);
    fill(255);
    noStroke();

    // Show the clusters
    for (let [i, cluster] of this.clusters.entries()) {
      text("" + i, x, y + i * (this.tileHeight + 5) + 15);
      this.showCluster(cluster, x + 10, y + i * (this.tileHeight + 5));
    }
  }

  showCluster(cluster, x, y) {
    for (let [i, tile] of cluster.entries()) {
      tile.show(x + i * this.tileWidth, y, this.tileWidth, this.tileHeight);
    }
  }

  click(pos, sx, sy) {
    let x = Math.floor((pos.x - sx) / (this.tileWidth * this.scale));
    let y = Math.floor((pos.y - sy) / (this.tileHeight * this.scale));
    // Default to no selection.
    this.clicked = null;

    if (this.collapsed) {
      // No clicking when the view is not displayed.
      return false;
    }

    if (y >= 0 && y < this.tiles.getHeight()) {
      if (x >= 0 && x < this.tiles.getWidth()) {
        this.clicked = this.get(x, y).getData();
      }
    }

    return this.clicked;
  }

  updateTileEdges() {
    // Find edges which look like they join.
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      let t1 = this.allTiles[i1];
      t1.image.loadPixels();
      t1.calculateEdges();
      t1.classifyEdges();
    }
  }

  detectEdges(tiles, threshold, allowedEdges) {
    // Check if ground tiles can join to each other?
    for (let i1 = 0; i1 < tiles.length; i1++) {
      for (let i2 = i1; i2 < tiles.length; i2++) {
        this.edgeDetect(tiles[i1], tiles[i2], threshold, allowedEdges);
      }
    }
  }

  findAllClusters() {
    this.clusters = [];
    this.items = [];
    for (let t of this.allTiles) {
      if (t.cluster) {
        // Already in an existing cluster
        continue;
      }
      // t is not yet in a cluster.
      let cluster = [t];
      t.cluster = cluster;
      let toCluster = [t];
      let iteration = 0;
      while (toCluster.length > 0) {
        let next = [];
        for (let t1 of toCluster) {
          let neighbours = t1.getDirectionTiles();
          for (let tiles of neighbours) {
            for (let t2 of tiles) {
              if (!t2.cluster) {
                t2.cluster = cluster;
                cluster.push(t2);
                next.push(t2);
              }
            }
          }
        }
        toCluster = next;
        iteration++;
      }
      if (cluster.length > 1) {
        this.clusters.push(cluster);
      } else {
        // Solo tiles which have no connections?
        this.items.push(cluster[0]);
      }
    }
    return this.clusters;
  }

  getItems() {
    return this.items;
  }

  findCluster(x, y) {
    let t = this.get(x, y).getData();
    return t.cluster;
  }

  addTile(t) {
    this.allTiles.push(t);
  }

  blankEdges(edges) {
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      let t1 = this.allTiles[i1];
      for (let d = 0; d < 4; d++) {
        if (t1.getEdgeType(d) === "blank") {
          for (let e of edges) {
            this.connectDirection(d, t1, e);
          }
        }
      }
    }
  }

  transparentEdges(edges) {
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      let t1 = this.allTiles[i1];
      for (let d = 0; d < 4; d++) {
        if (t1.getEdgeType(d) === "transparent") {
          for (let e of edges) {
            this.connectDirection(d, t1, e);
          }
        }
      }
    }
  }

  edgeDetect(t1, t2, threshold, allowedEdges) {
    // Match edges based on their type, or color difference threshold.
    let match = [0, 0, 0, 0];
    for (let d = 0; d < 4; d++) {
      match[d] = this.compareEdges(d, t1, t2, threshold, allowedEdges, t1.debug && t2.debug);
    }

    // threshold doesn't work well for all situations.
    // Could use a better matcher?
    // How do we avoid wood matching dirt (they are the exact same color)?
    // Ignore no alpha pixels?

    if (match[0]) {
      this.connectY(t2, t1);
    }
    if (t1 !== t2 && match[2]) {
      this.connectY(t1, t2);
    }
    if (match[3]) {
      this.connectX(t2, t1);
    }
    // If tiles are the same, we already connected them above.
    if (t1 !== t2 && match[1]) {
        this.connectX(t1, t2);
    }
  }

  compareEdges(d, t1, t2, threshold, allowedEdges, verbose) {
    let opp = (d + 2) % 4;
    if (allowedEdges.includes(t1.getEdgeType(d)) && t1.getEdgeType(d) === t2.getEdgeType(opp)) {
      // If an edge type is allowed, and matches then its supported.
      if (t1.isIsolated() || t2.isIsolated()) {
        // Items which have no edges shouldn't connect by default.
        return false;
      }
      return true;
    }
    if (t1.getEdgeType(d) !== "colored" && t1.getEdgeType(d) !== "same") {
      // This detector only works with colored/same edges.
      if (verbose) {
        console.log(t1.name, d, t2.name, "non coloured edges");
      }
      return false;
    }
    if (t2.getEdgeType(opp) !== "colored" && t2.getEdgeType(opp) !== "same") {
      // Don't connect to tiles which are not also colored or same.
      if (verbose) {
        console.log(t1.name, d, t2.name, "non coloured edges");
      }
      return false;
    }

    let edge = t1.edges[d];
    // The opposite direction for t2. 0 -> 2, 1 -> 3, 2 -> 0, 3 -> 1
    let edge2 = t2.edges[opp];
    let edgeDiff = 0;
    let pixelsMatched = 0;
    for (let i = 0; i < edge.length; i++) {
      // All pixel colors (RGBA)
      let pixelDiff = this.pixelColorDistance(edge[i], edge2[i]);
      if (i > 0) {
        // check against 1 pixel after this one, use that if it's a better match (diagonal match)
        pixelDiff = Math.min(pixelDiff, this.pixelColorDistance(edge[i], edge2[i - 1]));
        pixelDiff = Math.min(pixelDiff, this.pixelColorDistance(edge[i - 1], edge2[i]));
      }
      if (i < edge.length - 1) {
        pixelDiff = Math.min(pixelDiff, this.pixelColorDistance(edge[i], edge2[i + 1]));
        pixelDiff = Math.min(pixelDiff, this.pixelColorDistance(edge[i + 1], edge2[i]));
      }
      // Ignore blank edges which meet transparent ones?
      if ((t1.isBlank(edge[i]) && t2.isTransparent(edge2[i])) || (t1.isTransparent(edge[i]) && t2.isBlank(edge2[i]))) {
        pixelDiff = 0;
      }
      if (pixelDiff === 0) {
        pixelsMatched++
      }
      edgeDiff += pixelDiff;
    }
    if (verbose) {
      console.log(t1.name, d, t2.name, "pixelsMatched",pixelsMatched, "edgeDiff", edgeDiff);
    }

    if (pixelsMatched < edge.length / 8) {
      // Not a match if 1 or less in 8 pixels match.
    }
    return edgeDiff < threshold;
  }

  pixelColorDistance(p1, p2) {
    let diff = 0
    for (let ii = 0; ii < 4; ii++) {
      // Use the distance between colors in rgba.
      diff += Math.pow(p1[ii] - p2[ii], 2);
    }
    return diff;
  }

  setDefaultBelow(below) {
    // Everything with no requirement under them, should be allowed on the below set.
    for (let t of this.allTiles) {
      if (below.includes(t)) {
        // below is the bottom layer, so need nothing below them.
        continue;
      }
      if (t.below.length === 0) {
        this.multiConnectZ(below, [t]);
      }
    }
  }

  connectLayers(layers) {
    // Top layer is blank above.
    layers[0].left.setEdgeType(0, "blank");
    layers[0].middle.setEdgeType(0, "blank");
    layers[0].right.setEdgeType(0, "blank");

    // Bottom layer is blank below
    let bottomIdx = layers.length - 1;
    layers[bottomIdx].left.setEdgeType(2, "blank");
    layers[bottomIdx].middle.setEdgeType(2, "blank");
    layers[bottomIdx].right.setEdgeType(2, "blank");
    for(let d of layers[bottomIdx].decor) {
      d.setEdgeType(2, "blank");
    }
    for(let double of layers[bottomIdx].doubleDecor) {
      double[0].setEdgeType(2, "blank");
      double[1].setEdgeType(2, "blank");
    }

    // Connect each layer to the one below it.
    for (let l = 0; l < layers.length - 1; l++) {
      this.connectY(layers[l].left, layers[l + 1].left);

      // The middle and decor and double decor all connect.
      this.connectY(layers[l].middle, layers[l + 1].middle);
      this.multiConnectY(layers[l].decor, layers[l + 1].decor);
      this.multiConnectY(layers[l].decor, [layers[l + 1].middle]);
      this.multiConnectY([layers[l].middle], layers[l + 1].decor);

      // TODO this only supports doubleDecor below other layers.
      if (layers[l + 1].doubleDecor) {
        for (let double of layers[l + 1].doubleDecor) {
          this.multiConnectY([layers[l].middle], double);
          this.multiConnectY(layers[l].decor, double);
        }
      }

      this.connectY(layers[l].right, layers[l + 1].right);
    }

    // Connect each tile within the layer horizontally.
    for (let l of layers) {
      l.left.setEdgeType(3, "blank");
      this.connectX(l.left, l.middle);

      this.multiConnectX([l.left, l.middle], l.decor);
      this.multiConnectX(l.decor, [l.right, l.middle]);

      this.connectX(l.middle, l.right);
      l.right.setEdgeType(1, "blank");

      // All doubleDecorations connect to the left/middle and right/middle and each other.
      if (l.doubleDecor) {
        for (let double of l.doubleDecor) {
          this.multiConnectX([l.left, l.middle], [double[0]]);
          this.connectX(double[0], double[1]);
          this.multiConnectX([double[1]], [l.right, l.middle]);
        }
      }
    }
  }

  getRect(x1, y1, x2, y2) {
    let list = [];
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        list.push(this.getData(x, y));
      }
    }
    return list;
  }
}

/* fills in a grid with Square's which collapse to a single tile using the WFCTile joins. */
class CollapseFunction {
  constructor(width, height, view, layers, useMinimum) {
    this.width = width;
    this.height = height;
    this.view = view;
    this.tiles = layers;
    this.view.setCenter(createVector(200, 200));

    // Whether to collapse a tile with the minimum possibility first.
    this.useMinimum = useMinimum;
    this.layers = [];
    for (let i = 0; i < layers.length; i++) {
      this.layers.push(new Grid(width, height, view.getMapSize()));
    }
    // Use the top layer as the interactive (click/hover) one.
    this.mainLayer = this.layers.length - 1;
    this.reset();
  }

  reset() {
    this.complete = false;
    for (let layer of this.layers) {
      layer.reset();
    }
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        for (let z = 0; z < this.layers.length; z++) {
          let square = new Square(x, y, z);
          square.setPossible(this.tiles[z]);
          square.showPossibleCount(z === this.mainLayer);
          this.layers[z].setTileData(x, y, square);
        }
      }
    }
  }

  init() {
    // reduce the possibility of all tiles.
    // Just in case any impossible tiles are put in possible as part of setup.
    for (let z = 0; z < this.layers.length; z++) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          let t = this.layers[z].getTile(x, y);
          this.reduceWrapper(t);
        }
      }
    }
  }

  getCollapsable(minimum) {
    let currentMin = 1000000;
    let minimalPossible = [];
    let allPossible = [];
    let onePossible = [];
    for (let z = 0; z < this.layers.length; z++) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          let t = this.layers[z].getTile(x, y);
          let numPossible = t.getData().possible.length;
          if (t.getData().tile || numPossible === 0) {
            // already collapsed or cannot collapse to anything.
            continue;
          }
          if (numPossible === 1) {
            onePossible.push(t);
          }
          allPossible.push(t)
          if (numPossible < currentMin) {
            minimalPossible = [t];
            currentMin = numPossible;
          } else if (numPossible === currentMin) {
            minimalPossible.push(t);
          }
        }
      }
    }
    if (minimum) {
      return minimalPossible;
    } else {
      if (onePossible.length > 0) {
        // Fill in all the tiles with only one possibility first.
        return onePossible;
      }
      return allPossible;
    }
  }

  update() {

    view.update();

    if (this.complete) {
      return;
    }

    // Collapse will pick a tile from the possible ones.
    let collapsable = this.getCollapsable(this.useMinimum);

    if (collapsable.length > 0) {
      let loc = random(collapsable);
      loc.getData().collapse();
      try {
        this.reduceWrapper(loc);
      } catch (e) {
        loc.getData().setFailed();
        console.log("Failed to fill in", loc);
        console.error(e);
        // Stop filling in.
        this.complete = true;
      }
    } else {
      console.log("All filled in");
      this.complete = true;
    }
  }

  highlight(mousePos) {
    let pos = this.view.toGameGridFloor(mousePos);
    this.hover = this.layers[this.mainLayer].getTileAtPos(pos);
    if (this.hover.getData() == null) {
      this.hover = null;
    }
  }

  click(mousePos) {
    // translate to a grid location.
    let pos = this.view.toGameGridFloor(mousePos);

    this.clicked = this.layers[this.mainLayer].getTileAtPos(pos);
    if (this.clicked.getData() == null) {
      this.clicked = null;
    }
    return this.clicked;
  }

  drawWFC() {
    for (let layer of this.layers) {
      this.view.drawMap(layer);
    }
    // view.coverEdges();

    if (this.hover) {
      let tile = this.hover.getData();
      this.view.showAtGridLoc(this.hover, tile.showHighlight.bind(tile));
    }
    if (this.clicked) {
      let square = this.clicked.getData();
      this.view.showAtGridLoc(this.clicked, square.showHighlight.bind(square));
    }
  }

  reduceWrapper(loc) {
    // Starting at a location which has been collapsed, reduce the possibilities for all affected tiles.
    let toReduce = [loc]
    while (toReduce.length > 0) {
      let next = [];
      for (let gridLoc of toReduce) {
        // Calls reduce to remove possibilities of, and return the set of affected tiles.
        // Adds them all to the next iteration.
        try {
          for (let x of this.reduce(gridLoc)) {
            next.push(x);
          }
        } catch (error) {
          if (error instanceof ImpossibleCollapse) {
            error.square.setFailed();
            gridLoc.getData().setFailed();
            console.log("Error while collapsing reducing ", gridLoc.getLocationString(),
                "Square", error.square.pos.x + ",", error.square.pos.y + ",", error.square.z, "has its possible set allowed", error.allowed.map(function (a) {
                  return a.name;
                })
            );
          }
          throw error;
        }
      }
      toReduce = next;
    }
  }

  reduce(loc) {
    // Reduce the possibilities of this locations neighbours based on the current state of this location.
    let possibleDirectionTiles = loc.getData().getPossibleDirectionTiles();

    let moreReductionRequired = [];
    // This handles NESW
    let neighbours = loc.getCardinalTiles();
    for (let i = 0; i < neighbours.length; i++) {
      if (this.reduceLocationsPossible(neighbours[i], possibleDirectionTiles[i])) {
        moreReductionRequired.push(neighbours[i]);
      }
    }
    // Some special handling for above/below
    // TODO needs improving
    if (this.layers.length > 1) {
      if (loc.getData().z === 0) {
        let above = this.layers[1].getTile(loc.x, loc.y);
        if (this.reduceLocationsPossible(above, possibleDirectionTiles[4])) {
          moreReductionRequired.push(above);
        }
      } else {
        let below = this.layers[0].getTile(loc.x, loc.y);
        if (this.reduceLocationsPossible(below, possibleDirectionTiles[5])) {
          moreReductionRequired.push(below);
        }
      }
    }
    return moreReductionRequired
  }

  // A tile next to loc changed, and is restricting what loc can be to something within possible.
  reduceLocationsPossible(loc, allowed) {
    if (!loc.getData()) {
      // out of bounds?
      return false;
    }
    // We should never restrict a tile to no options at all.
    if (allowed.length === 0) {
      throw new ImpossibleCollapse(loc.getData(), loc.getData().possible, allowed);
    }
    return loc.getData().reducePossible(allowed);
  }
}

class WFCOverlay {
  constructor(tilesetMatcher, collapseFunction) {
    this.tilesetMatcher = tilesetMatcher;
    this.collapseFunction = collapseFunction;
    this.mousePos = createVector(0, 0);
    // A place to store a tile which was clicked on.
    this.clicked = null;
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

    if (this.showTileset) {
      let x = 20;
      let y = 50;

      this.clicked = this.tilesetMatcher.click(this.mousePos, x, y)
      if (this.clicked) {
        console.log("clicked on", this.clicked);
        return true;
      }
    }

    let click = this.collapseFunction.click(this.mousePos);
    if (click) {
      // click is a grid location within the collapse
      this.selectedSquare = click.getData();
      if (this.selectedSquare.tile) {
        // Already collapsed, so display the collapsed tile.
        this.clicked = this.selectedSquare.tile;
      } else {
        this.clicked = null;
      }
    }
  }

  draw() {
    // Draw grid view first below overlays.
    this.collapseFunction.drawWFC(this.tilesetMatcher);

    // Then draw various overlays in order (lowest to highest);
    this.drawButtons();

    let y = 50;
    if (this.showTileset) {
      this.tilesetMatcher.drawTileset(20, y);
    }
    // Increase y by the height of the tileset.
    y += 10 + this.tilesetMatcher.tileHeight * this.tilesetMatcher.scale * this.tilesetMatcher.tiles.getHeight();

    if (this.clicked) {
      // Display the large view of the tile with edge pixel colors.
      let x = 20 + this.tilesetMatcher.tileWidth * this.tilesetMatcher.scale * this.tilesetMatcher.tiles.getWidth();
      let scale = 20;
      // let x = 450;
      this.showWithEdges(this.clicked, x, 0, scale);
    }

    let size = 32;
    // The possible set occupies the same space as the connections set.
    if (this.clicked) {
      this.showConnections(this.clicked, 20, y, size);
    } else if (this.selectedSquare) {
      this.selectedSquare.showPossible(20, y, size);
    }

    y += 6 * 1.5 * size;

    if (this.showClusters) {
      this.tilesetMatcher.showClusters(10, y);
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
      this.showTileset = !this.showTileset;
      return true;
    }
    dx = mousePos.x - x - 100;
    if (dy > 0 && dy < 20 && dx > 0 && dx < 100) {
      console.log("Toggle clusters display");
      this.showClusters = !this.showClusters;
      return true;
    }
    dx = mousePos.x - x - 200;
    if (dy > 0 && dy < 20 && dx > 0 && dx < 100) {
      console.log("clicked on reset");
      this.collapseFunction.reset();
      return true;
    }
  }

  // Display an enlarged tiles, along with its edge coloring.
  // Also display the tiles it can match against in each direction.
  showWithEdges(tile, x, y, scale) {
    // This x is based on the width of the previous display.

    fill(159);
    noStroke()
    if (tile.image) {
      // 40 margin to display the pixel colors.
      rect(x, y, 80 + scale * this.tilesetMatcher.tileWidth, 80 + scale * this.tilesetMatcher.tileHeight);
    }
    stroke('white');
    noSmooth();
    // Default distance down to display the edges.
    let height = 50;
    if (tile.image) {
      // Override this if we are displaying a tile.
      rect(x + 40, y + 40, scale * tile.image.width + 1, scale * tile.image.height + 1);
      tile.show(x + 40, y + 40, scale * tile.image.width, scale * tile.image.height);
      tile.showEdges(x + 40, y + 40, scale);
    }
  }

  showConnections(tile, x, y, tileSize) {
    textSize(16);
    fill(255);
    noStroke();
    text("L", x + 6, y + 15);
    text("U", x + 6, y + 15 + (tileSize + 2) * 1);
    text("R", x + 6, y + 15 + (tileSize + 2) * 2);
    text("D", x + 6, y + 15 + (tileSize + 2) * 3);
    text("A", x + 6, y + 15 + (tileSize + 2) * 4);
    text("B", x + 6, y + 15 + (tileSize + 2) * 5);
    x += tileSize + 2;

    stroke('white');
    noFill();
    let edgeMax = Math.max(tile.right.length, tile.left.length, tile.up.length, tile.down.length);
    edgeMax = Math.max(edgeMax, tile.above.length, tile.below.length);
    for (let i = 0; i < edgeMax; i++) {
      if (tile.left[i]) {
        tile.left[i].show(x + i * (tileSize + 2), y, tileSize, tileSize)
      }
      if (tile.up[i]) {
        tile.up[i].show(x + i * (tileSize + 2), y + (tileSize + 2), tileSize, tileSize)
      }
      if (tile.right[i]) {
        tile.right[i].show(x + i * (tileSize + 2), y + (tileSize + 2) * 2, tileSize, tileSize)
      }
      if (tile.down[i]) {
        tile.down[i].show(x + i * (tileSize + 2), y + (tileSize + 2) * 3, tileSize, tileSize)
      }
      if (tile.above[i]) {
        tile.above[i].show(x + i * (tileSize + 2), y + (tileSize + 2) * 4, tileSize, tileSize)
      }
      if (tile.below[i]) {
        tile.below[i].show(x + i * 1.5 * tileSize, y + (tileSize + 2) * 5, tileSize, tileSize)
      }
    }
  }
}
