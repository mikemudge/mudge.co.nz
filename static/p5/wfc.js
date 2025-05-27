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

  showPossible(x, y) {
    let size = 16;
    noStroke();
    fill(255);
    if (this.tile) {
      // Already collapsed.
      if (this.tile.image) {
        image(this.tile.image, x, y, size * 2, size * 2);
      } else {
        text("E", x, y + 10);
      }
    } else {
      for (let [i, p] of this.possible.entries()) {
        if (p.image) {
          image(p.image, x + 40 + size * i * 1.5, y, size, size);
        } else {
          text("E", x + 40 + size * i * 1.5, y + 10);
        }
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
      if (alphaPixels > 14) {
        type = "transparent"
      } else if (blankPixels > 14) {
        type = "blank";
      } else if (alphaPixels + blankPixels > 14) {
        if (blankPixels > 7) {
          type = "blank";
        } else {
          type = "transparent";
        }
      } else if (samePixels > 14) {
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

  constructor(tileset, tileWidth, tileHeight) {
    // this.total = 0;
    // this.totalDiff = [0, 0, 0, 0];
    let tilesAcross = tileset.width / tileWidth;
    let tilesDown = tileset.height / tileHeight;
    if (tileWidth !== tileHeight) {
      console.warn("non square tiles are not currently well supported");
    }
    this.scale = 2;
    this.tiles = new Grid(tilesAcross, tilesDown, tileWidth * this.scale);
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

    // Display size is scaled up.
    this.tileWidth = tileWidth * this.scale;
    this.tileHeight = tileHeight * this.scale;
    console.log("Tiles loaded", this.tiles);
  }

  get(x, y) {
    return this.tiles.getTile(x, y);
  }

  getData(x, y) {
    return this.tiles.getTile(x, y).getData();
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

  drawTileset() {
    // Only show this when it's not collapsed.
    let sx = 20;
    let sy = 50;
    // background
    fill(159);
    stroke(255);
    rect(sx, sy, this.tiles.getWidth() * this.tileWidth, this.tiles.getHeight() * this.tileHeight)

    for (var y = 0; y < this.tiles.getHeight(); y++) {
      for (var x = 0; x < this.tiles.getWidth(); x++) {
        let tile = this.get(x, y).getData();
        tile.show(sx + x * this.tileWidth, sy + y * this.tileHeight, this.tileWidth, this.tileHeight);
      }
    }

    // Overlay the index of each tile to aid debugging.
    textSize(14);
    fill(255);
    noStroke();
    for (var y = 0; y < this.tiles.getHeight(); y++) {
      for (var x = 0; x < this.tiles.getWidth(); x++) {
        text(x + "," + y, x * this.tileWidth + sx + 5, y * this.tileHeight + sy + 15);
      }
    }
  }

  showClusters() {
    textSize(14);
    fill(255);
    noStroke();
    // Show the clusters
    for (let [i, cluster] of this.clusters.entries()) {
      let y = this.tileHeight * this.tiles.getHeight() + 200 + i * (this.tileHeight / 2 + 5);
      text("" + i, 10, y + 15);
      this.showCluster(cluster, 20, y);
    }
  }

  showCluster(cluster, x, y) {
    for (let [i, tile] of cluster.entries()) {
      tile.show(x + i * this.tileWidth / 2, y, this.tileWidth / 2, this.tileHeight / 2);
    }
  }

  click(pos) {
    let sx = 20;
    let sy = 50;

    let x = Math.floor((pos.x - sx) / this.tileWidth);
    let y = Math.floor((pos.y - sy) / this.tileHeight);
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
  }

  manualHouse(x, y) {
    let layers = [{
      left: this.getData(x, y),
      middle: this.getData(x + 1, y),
      right: this.getData(x + 2, y),
      decor: [this.getData(x + 3, y)]
    }, {
      left: this.getData(x, y + 1),
      middle: this.getData(x + 1, y + 1),
      right: this.getData(x + 2, y + 1),
      decor: [this.getData(x + 3, y + 1)]
    }, {
      left: this.getData(x, y + 2),
      middle: this.getData(x + 1, y + 2),
      right: this.getData(x + 3, y + 2),
      decor: this.getRect(x, y + 3, x + 1, y + 3),
      doubleDecor: [this.getRect(x+2, y + 3, x + 3, y + 3)]
    }];

    // Roof is blank above.
    layers[0].left.setEdgeType(0, "blank");
    layers[0].middle.setEdgeType(0, "blank");
    layers[0].right.setEdgeType(0, "blank");

    // Walls are blank below
    layers[2].left.setEdgeType(2, "blank");
    layers[2].middle.setEdgeType(2, "blank");
    layers[2].right.setEdgeType(2, "blank");
    for(let d of layers[2].decor) {
      d.setEdgeType(2, "blank");
    }
    for(let d of layers[2].doubleDecor) {
      d[0].setEdgeType(2, "blank");
      d[1].setEdgeType(2, "blank");
    }

    // connect empty to back.
    // this.multiConnectY([empty], [layers[0].left, layers[0].middle, layers[0].right]);
    // connect front to empty
    // this.multiConnectY([layers[2].left, layers[2].middle, layers[2].right], [empty]);
    // this.multiConnectY(layers[2].decor, [empty]);

    // Connect each layer to the one below it.
    for (let l = 0; l < layers.length - 1; l++) {
      this.connectY(layers[l].left, layers[l + 1].left);
      this.connectY(layers[l].middle, layers[l + 1].middle);
      this.multiConnectY(layers[l].decor, layers[l + 1].decor);
      this.multiConnectY(layers[l].decor, [layers[l + 1].middle]);
      this.multiConnectY([layers[l].middle], layers[l + 1].decor);
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
        for (let pair of l.doubleDecor) {
          this.multiConnectX([l.left, l.middle], [pair[0]]);
          this.connectX(pair[0], pair[1]);
          this.multiConnectX([pair[1]], [l.right, l.middle]);
        }
      }
    }
  }

  manualVertical(empty, grassDirtTiles) {
    let plainGrass = this.get(0, 0).getData();
    let tuffGrass = this.get(1, 0).getData();
    let flowerGrass = this.get(2, 0).getData();
    let stoneGrass = this.get(7, 3).getData();
    let grass = [plainGrass, tuffGrass, flowerGrass, stoneGrass];
    let dirt = [this.get(1,2).getData()]


    let grassDirtEdges = [];
    for (let t of grassDirtTiles) {
      if (grass.includes(t) || dirt.includes(t)) {
        continue;
      }
      grassDirtEdges.push(t);
    }

    let greenTrees = this.findCluster(7, 1)
    let yellowTrees = this.findCluster(10, 1)
    this.multiConnectZ(grassDirtTiles, [empty]);
    this.multiConnectZ(grass, greenTrees);
    this.multiConnectZ(grass, yellowTrees);


    // let allFences = this.findCluster(8, 3)
    // this.multiConnectZ(grass, allFences);
    // Manual fence align with grass edges.
    // This causes many impossible state errors?
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        let fence = this.getData(x + 8, y + 3);
        let dirt = this.getData(x, y + 1);
        this.connectZ(dirt, fence);
      }
    }
    // Connect top left corner fence.
    this.connectZ(this.getData(5, 3), this.getData(8, 3));
    // Connect top right corner fence.
    this.connectZ(this.getData(6, 3), this.getData(10, 3));
    // Connect bottom right corner fence.
    this.connectZ(this.getData(3, 3), this.getData(10, 5));
    // Connect bottom left corner fence.
    this.connectZ(this.getData(4, 3), this.getData(8, 5));


    // Everything with no requirement under them, should be allowed on all grass/dirt.
    for (let t of this.allTiles) {
      if (grassDirtTiles.includes(t)) {
        // grassDirtTiles are the bottom layer, so need nothing below them.
        continue;
      }
      if (t.below.length === 0) {
        this.multiConnectZ(grassDirtTiles, [t]);
      }
    }
  }

  findCluster(x, y) {
    let t = this.get(x, y).getData();
    let cluster = [];
    let explore = [t];
    while (explore.length > 0) {
      let next = [];
      for (let e of explore) {
        // Is e already part of the cluster?
        if (cluster.includes(e)) {
          continue;
        }
        cluster.push(e);
        for (let a of e.left) {
          next.push(a);
        }
        for (let a of e.right) {
          next.push(a);
        }
        for (let a of e.up) {
          next.push(a);
        }
        for (let a of e.down) {
          next.push(a);
        }
      }
      explore = next;
    }
    return cluster;
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
      return true;
    }
    if (t1.getEdgeType(d) !== "colored" && t1.getEdgeType(d) !== "same") {
      // This detector only works with colored/same edges.
      if (verbose) {
        console.log(t1.debug, d, t2.debug, "non coloured edges");
      }
      return false;
    }
    if (t2.getEdgeType(opp) !== "colored" && t2.getEdgeType(opp) !== "same") {
      // Don't connect to tiles which are not also colored or same.
      if (verbose) {
        console.log(t1.debug, d, t2.debug, "non coloured edges");
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
      console.log(t1.debug, d, t2.debug, "pixelsMatched",pixelsMatched, "edgeDiff", edgeDiff);
    }
    // Castle roof with a dark grey pixel.
    // 15 matched pixels and one is off by 6713?
    // 139,155,180
    // 192,203,220
    // 53, 48, 40 = 82 ^ 2

    if (pixelsMatched < 2) {
      // Not a match if only 0 or 1 pixels match.
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

  fixCastle() {
    let window = this.get(5, 10).getData();
    let wall = this.get(6, 10).getData();
    // Set wall edges to blank so that they can match anything.
    wall.setEdgeType(1, "blank");
    wall.setEdgeType(3, "blank");
    window.setEdgeType(1, "blank");
    window.setEdgeType(3, "blank");

    let doorTop = [
      this.getData(3, 9),
      this.getData(4, 9)
    ]
    let doorTop2 = [
      this.getData(5, 9),
      this.getData(6, 9),
    ]
    let doorBottom = [
      this.getData(3, 10),
      this.getData(4, 10),
    ]

    this.connectY(doorTop[0], doorBottom[0]);
    this.connectY(doorTop[1], doorBottom[1]);
    this.connectY(doorTop2[0], doorBottom[0]);
    this.connectY(doorTop2[1], doorBottom[1]);

    // We don't want bottom doors to repeat in the y direction.
    this.multiDisconnectY(doorBottom, doorBottom);
    // this.connectX(doorBottom[0], doorBottom[1]);
    // Set blank bottom so they can connect to anything under them.
    for (let d of doorBottom) {
      d.setEdgeType(2, "blank")
    }

    let bottomWall = wall.copy();
    // nothing knows about bottomWall?
    // bottomWall does know about things though, because it copied wall.
    this.addTile(bottomWall);

    this.connectX(bottomWall, bottomWall);
    this.disconnectX(bottomWall, wall);
    this.disconnectX(wall, bottomWall);
    bottomWall.setEdgeType(2, "blank");

    // Iterate through all of wall2's connections and connect them to wall2.
    for (let d = 0; d < 4; d++) {
      let tiles = bottomWall.getDirectionTiles()[d];
      for (let t of tiles) {
        this.connectDirection(d, bottomWall, t);
      }
    }
    // Reset below, so that this will be connected to all tiles below.
    bottomWall.below = [];

    this.connectX(bottomWall, doorBottom[0]);
    this.connectX(doorBottom[1], bottomWall);


    let roof = [
      this.getData(0,10),
      this.getData(1,10),
      this.getData(2,10),
    ];
    let roof2 = [
      this.getData(3, 8),
      this.getData(4, 8),
      this.getData(5, 8),
    ]


    this.multiConnectY(roof, doorTop);
    this.multiConnectY(roof, doorTop2);

    this.multiConnectY(roof2, doorTop);
    this.multiConnectY(roof2, doorTop2);

    // Using a top wall and bottom wall so its always fixed height of 2.
    this.multiConnectY(roof, [wall, window]);
    this.multiConnectY(roof2, [wall, window]);
    this.multiConnectY([wall, window], [bottomWall]);
  }

  fixTrees(x) {

    this.connectX(this.getData(x,1), this.getData(x + 2,1))
    let treetop = [
      this.get(x + 1,1).getData(),
    ];
    let tree = [
      this.get(x,2).getData(),
      this.get(x + 1,2).getData(),
      this.get(x + 2,2).getData()
    ];
    this.multiConnectY(treetop, tree);
    let treebottom = [this.getData(x + 1, 2)]
    this.multiConnectY([this.getData(x, 0), this.getData(x + 2, 0)], treebottom);
  }

  doMatching() {
    // Get additional logging during edge detection for debug tiles.
    // this.get(0, 10).getData().setDebug("0,10");
    // this.get(1, 10).getData().setDebug("1,10");

    // Read pixels from image to determine what tiles can connect to.
    this.updateTileEdges();

    // How many pixels were matched, and how far away in color space were they on average.
    let threshold = 16 * 500;
    // Do edge detection to join tiles in specific regions.
    // this.detectEdges(this.allTiles);
    // grass + dirt
    this.detectEdges(this.getRect(0, 0, 7, 3), threshold, []);
    // trees
    this.detectEdges(this.getRect(3, 0, 11, 2), threshold, ['transparent']);
    // house 1
    // this.detectEdges(this.getRect(0, 4, 3, 7), threshold, []);
    // house 2
    // this.detectEdges(this.getRect(4, 4, 7, 7), threshold, []);
    // fence
    this.detectEdges(this.getRect(8, 3, 11, 6), threshold, []);
    // castle
    this.detectEdges(this.getRect(0, 8, 6, 10), threshold, ['transparent']);


    // TODO Clustering of edges? (Transitivity?)
    // TODO positional awareness, my north's east is also my east's north.
    // Make sure that tile's which fit here can line up with some of my neighbours?

    // TODO try to reduce these manual fixes.
    this.fixTrees(6);
    this.fixTrees(9);
    this.fixCastle();
    this.manualHouse(0, 4);
    this.manualHouse(4, 4);

    // Find clusters after we detect edges, but before we allow transparent/blank connections.
    this.findAllClusters();
    for (let cluster of this.clusters) {
      console.log("Cluster", cluster);
    }
    // Any tiles which don't connect to any others.
    console.log("Items", this.items.map(function(i) { return i.name }));

    // Add an empty tile to the object layer, so there is an option to have nothing above grass.
    let empty = new WFCTile(null, "Empty");
    for (let d = 0; d < 4; d++) {
      empty.setEdgeType(d, "transparent");
    }
    // Empty tile can connect to itself in any direction.
    this.interchangable([empty]);
    this.addTile(empty);

    // The grass/dirt cluster is the ground layer, and is used for vertical joining.
    let grassDirtTiles = this.findCluster(0, 0);

    // This is happening before blank/transparent connections for clustering of trees/fences etc.
    this.manualVertical(empty, grassDirtTiles);

    // Connect blank and transparent edges to the empty tile.
    // This means there is always a slight gap between things.
    this.blankEdges([empty]);
    this.transparentEdges([empty]);

    // disconnect some of the "items" which don't join well.
    this.removeConnections([
      // House doors causing issues.
      this.getData(2, 6),
      this.getData(6, 6),

      // Some dead end fence posts.
      // This can cause failures as it results in impossible states.
      // this.getData(8, 6),
      // this.getData(9, 6),
      // this.getData(10, 6),
      // this.getData(11, 3),
      // this.getData(11, 4),
      // this.getData(11, 5),

      // Items, may not be needed any more?
      this.get(9, 4).getData(),
      this.get(11, 7).getData(),
      this.get(11, 8).getData(),
      this.get(8, 9).getData(),
      this.get(9, 9).getData(),
      this.get(8, 10).getData(),
      this.get(10, 10).getData(),
      this.get(11, 10).getData(),
    ]);

    // layer 2 is everything which can go on top of grass/dirt
    // Start with the fence cluster, but after transparent edges have been joined.
    let objectTiles = this.findCluster(8, 3);
    let items = [];
    let objects = [];
    for (let t of objectTiles) {
      if (t.down.length === 0 || t.up.length === 0 || t.left.length === 0 || t.right.length === 0) {
        // This tile doesn't work with anything currently so skip it.
        continue;
      }
      if (t.getEdgeCount("transparent") >= 4) {
        items.push(t);
      } else {
        objects.push(t);
      }
    }
    return [grassDirtTiles, objects];
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
  constructor(width, height, view, layers) {
    this.width = width;
    this.height = height;
    this.view = view;
    this.tiles = layers;
    this.view.setCenter(createVector(200, 200));

    // Whether to collapse a tile with the minimum possibility first.
    this.useMinimum = false;
    this.layers = [
      new Grid(width, height, view.getMapSize()),
      new Grid(width, height, view.getMapSize())
    ];
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
          square.showPossibleCount(z === 1);
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
      console.log("Found", minimalPossible.length, "tiles with", currentMin, "possibilities");
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
    this.hover = this.layers[1].getTileAtPos(pos);
    if (this.hover.getData() == null) {
      this.hover = null;
    }
  }

  click(mousePos) {
    // translate to a grid location.
    let pos = this.view.toGameGridFloor(mousePos);

    this.clicked = this.layers[1].getTileAtPos(pos);
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
      this.clicked = this.tilesetMatcher.click(this.mousePos)
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
    // Draw grid view first (below overlays.
    this.collapseFunction.drawWFC(this.tilesetMatcher);
    if (this.selectedSquare) {
      // Show possibility space.
      this.selectedSquare.showPossible(20, 50);
    }

    this.drawButtons();

    if (this.showTileset) {
      this.tilesetMatcher.drawTileset();
    }
    if (this.showClusters) {
      this.tilesetMatcher.showClusters();
    }

    // Then draw various overlays in order (lowest to highest);
    if (this.clicked) {
      this.showWithEdges(this.clicked);
      this.showConnections(this.clicked);
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
  showWithEdges(tile) {
    // This x is based on the width of the previous display.
    let x = 450;
    let y = 40;
    let scale = 20;

    fill(159);
    noStroke()
    if (tile.image) {
      rect(x - 40, y - 40, 401, 401);
    }
    stroke('white');
    noSmooth();
    // Default distance down to display the edges.
    let height = 50;
    if (tile.image) {
      // Override this if we are displaying a tile.
      rect(x, y, scale * tile.image.width + 1, scale * tile.image.height + 1);
      tile.show(x, y, scale * tile.image.width, scale * tile.image.height);
      tile.showEdges(x, y, scale);
    }
  }

  showConnections(tile) {
    let x = 0;
    let y = 410;

    let tileSize = 16;

    textSize(16);
    fill(255);
    noStroke();
    text("L", x + 6, y + 15);
    text("U", x + 6, y + 15 + tileSize * 1.5);
    text("R", x + 6, y + 15 + tileSize * 3);
    text("D", x + 6, y + 15 + tileSize * 4.5);
    text("A", x + 6, y + 15 + tileSize * 6);
    text("B", x + 6, y + 15 + tileSize * 7.5);
    x += tileSize * 1.5;

    stroke('white');
    noFill();
    let edgeMax = Math.max(tile.right.length, tile.left.length, tile.up.length, tile.down.length);
    edgeMax = Math.max(edgeMax, tile.above.length, tile.below.length);
    for (let i = 0; i < edgeMax; i++) {
      if (tile.left[i]) {
        tile.left[i].show(x + i * 1.5 * tileSize, y, tileSize, tileSize)
      }
      if (tile.up[i]) {
        tile.up[i].show(x + i * 1.5 * tileSize, y + 1.5 * tileSize, tileSize, tileSize)
      }
      if (tile.right[i]) {
        tile.right[i].show(x + i * 1.5 * tileSize, y + 3 * tileSize, tileSize, tileSize)
      }
      if (tile.down[i]) {
        tile.down[i].show(x + i * 1.5 * tileSize, y + 4.5 * tileSize, tileSize, tileSize)
      }
      if (tile.above[i]) {
        tile.above[i].show(x + i * 1.5 * tileSize, y + 6 * tileSize, tileSize, tileSize)
      }
      if (tile.below[i]) {
        tile.below[i].show(x + i * 1.5 * tileSize, y + 7.5 * tileSize, tileSize, tileSize)
      }
    }
  }
}

function preload() {
  tileset = loadImage('/static/p5/game/tinytown/tilemap_packed.png');
}

let renderer;
function setup() {
  tilesetMatcher = new TileSetEdgeMatcher(tileset, 16,16);

  let layers = tilesetMatcher.doMatching();

  // Create a grid, and use the matched tiles to fill it in.
  view = new MapView(20);
  createCanvas(view.getCanvasWidth(), view.getCanvasHeight());

  let collapseFunction = new CollapseFunction(35, 25, view, layers);

  collapseFunction.init();
  renderer = new WFCOverlay(tilesetMatcher, collapseFunction);

  // collapseFunction.edges;
  if (Notification.permission === "granted") {
    setTimeout(function() {
      let notification = new Notification("WFC Test", {
        body: "Hi",
        tag: "dedupe"
        // Also can contain badge, icon, image, data and more https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification
      });
      console.log("Notification", notification);
    }, 5000);
  } else {
    console.log("Notifications permission", Notification.permission);
  }
}

function draw() {
  background(127);

  renderer.update();
  renderer.draw();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  view.setScreen(windowWidth, windowHeight - 18);
}

function keyPressed() {
  view.keys();
}

function keyReleased() {
  view.keys();
}

function mouseWheel(event) {
  view.scale(event.delta);
}

function mouseMoved() {
  renderer.mouseMove(mouseX, mouseY);
}

function mouseReleased() {
  renderer.click(mouseX, mouseY);
}
