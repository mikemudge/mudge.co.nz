class Square {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.possible = [];
    this.tile = null;
  }

  update() {

  }

  setPossible(possible) {
    this.possible = possible;
  }

  collapse() {
    if (this.tile) {
      // Already collapsed.
      return;
    }
    this.tile = random(this.possible);
    this.possible = [this.tile];
  }

  reducePossible(allowed) {
    // This needs logic from WFC.
    // remove all possible which are not in the set of allowed tiles passed from an adjacent tile.
    let prev = this.possible.length;
    this.possible = this.possible.filter(function(p) {
      return allowed.includes(p);
    });

    // The set of possible is reduced.
    return this.possible.length < prev;
  }

  show(size) {
    if (!this.tile) {
      fill(255);
      text(this.possible.length, 5, 15);
      stroke(70);
      noFill();
      rect(0, 0, size * 2, size * 2);
      return;
    }
    image(this.tile.image, 0, 0, size * 2, size * 2);
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
}

class WFCTile {
  constructor(img, x, y) {
    this.image = img;
    // Register which tiles can be adjacent to this in various directions.
    this.left = [];
    this.right = [];
    this.up = [];
    this.down = [];
    this.edges = [[],[],[],[]];
    this.edgeTypeCounts = {};
    this.edgeTypes = [];
  }

  addRight(tile) {
    this.right.push(tile);
  }
  addLeft(tile) {
    this.left.push(tile);
  }
  addUp(tile) {
    this.up.push(tile);
  }
  addDown(tile) {
    this.down.push(tile);
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
        type = "transparent";
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
    image(this.image, x, y, w, h);
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

class CollapseFunction {

  constructor(grid) {
    this.grid = grid;
    this.total = 0;
    this.totalDiff = [0, 0, 0, 0];
  }

  setTileset(tileset, tileWidth, tileHeight) {
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
        let tile = new WFCTile(img);
        this.tiles.setTileData(x, y, tile);
      }
    }

    this.allTiles = [];
    for (var y = 0; y < this.tiles.getHeight(); y++) {
      for (var x = 0; x < this.tiles.getWidth(); x++) {
        this.allTiles.push(this.tiles.getTile(x, y));
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

  // Register a grid of tiles which can all join each other.
  // Good for registering a 3x3 compatible grid.
  grid3(x1,y1, outers) {
    for (let i = 0; i < 3; i++) {
      this.connectX(this.tiles[y1 + i][x1 + 0], this.tiles[y1 + i][x1 + 1]);
      this.connectX(this.tiles[y1 + i][x1 + 1], this.tiles[y1 + i][x1 + 2]);
      this.connectX(this.tiles[y1 + i][x1 + 0], this.tiles[y1 + i][x1 + 2]);

      this.connectY(this.tiles[y1 + 0][x1 + i], this.tiles[y1 + 1][x1 + i]);
      this.connectY(this.tiles[y1 + 1][x1 + i], this.tiles[y1 + 2][x1 + i]);
      this.connectY(this.tiles[y1 + 0][x1 + i], this.tiles[y1 + 2][x1 + i]);

      for (let outer of outers) {
        // Connect to the outer tiles along each edge.
        this.connectX(outer, this.tiles[y1 + i][x1]);
        this.connectX(this.tiles[y1 + i][x1 + 2], outer);
        this.connectY(outer, this.tiles[y1][x1 + i]);
        this.connectY(this.tiles[y1 + 2][x1 + i], outer);
      }
    }
    // The middle tile is repeatable with itself.
    this.interchangable([this.tiles[y1 + 1][x1 + 1]]);

    // The edges can repeat.
    this.connectX(this.tiles[y1 + 0][x1 + 1], this.tiles[y1 + 0][x1 + 1]);
    this.connectX(this.tiles[y1 + 2][x1 + 1], this.tiles[y1 + 2][x1 + 1]);
    this.connectY(this.tiles[y1 + 1][x1 + 0], this.tiles[y1 + 1][x1 + 0]);
    this.connectY(this.tiles[y1 + 1][x1 + 2], this.tiles[y1 + 1][x1 + 2]);
  }
  grid3Plus2(x1, y1, grid2, outers) {
    let [tl, tr, bl, br] = grid2;

    // connect each of the grids separately first.
    this.grid3(x1, y1, outers);
    // this.grid2(tl, tr, bl, br);

    // Now the interchange of them.
    // The outer material of grid3 should match the inner material of grid2 and vice versa.

    // Top of grid3 can connect to bottom of grid2
    this.connectX(this.tiles[y1][x1 + 0], br);
    this.connectX(this.tiles[y1][x1 + 1], br);
    this.connectX(bl, this.tiles[y1][x1 + 1]);
    this.connectX(bl, this.tiles[y1][x1 + 2]);

    // Bottom of grid3 can connect to top of grid2
    this.connectX(this.tiles[y1 + 2][x1 + 0], tr);
    this.connectX(this.tiles[y1 + 2][x1 + 1], tr);
    this.connectX(tl, this.tiles[y1 + 2][x1 + 1]);
    this.connectX(tl, this.tiles[y1 + 2][x1 + 2]);

    // Left of grid3 can connect to right of grid2
    this.connectY(this.tiles[y1 + 0][x1], br);
    this.connectY(this.tiles[y1 + 1][x1], br);
    this.connectY(tr, this.tiles[y1 + 1][x1]);
    this.connectY(tr, this.tiles[y1 + 2][x1]);

    // Right of grid3 can connect to left of grid2
    this.connectY(this.tiles[y1 + 0][x1 + 2], bl);
    this.connectY(this.tiles[y1 + 1][x1 + 2], bl);
    this.connectY(tl, this.tiles[y1 + 1][x1 + 2]);
    this.connectY(tl, this.tiles[y1 + 2][x1 + 2]);

    // The inner material of grid3 is the outer for grid2.
    let inner = this.get(x1 + 1, y1 + 1);
    this.connectX(tr, inner);
    this.connectX(br, inner);
    this.connectX(inner, tl);
    this.connectX(inner, bl);

    this.connectY(bl, inner);
    this.connectY(br, inner);
    this.connectY(inner, tl);
    this.connectY(inner, tr);
  }

  grid2(tl, tr, bl, br) {
    this.connectX(tl, tr);
    this.connectX(bl, br);
    this.connectY(tl, bl);
    this.connectY(tr, br);
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
  multiConnectY(a, b) {
    for (let a1 of a) {
      for (let b1 of b) {
        this.connectY(a1, b1);
      }
    }
  }
  connectY(a, b) {
    a.addDown(b);
    b.addUp(a);
  }
  repeatable(a) {
    this.connectX(a, a);
    this.connectY(a, a);
  }

  interchangable(arr) {
    for (let t1 of arr) {
      for (let t2 of arr) {
        this.connectX(t1, t2);
        this.connectY(t1, t2);
      }
    }
  }

  getPossibleTiles() {
    let possibleTiles = [];
    // Set allTiles based on ones which were setup.
    for (let t of this.allTiles) {
      let tile = t.getData();
      if (tile.right.length > 0 && tile.left.length > 0 && tile.up.length > 0 && tile.down.length > 0) {
        possibleTiles.push(tile);
      }
    }
    return possibleTiles;
  }

  getCollapsable() {
    let currentMin = 1000000;
    let minimalPossible = [];
    let allTiles = [];
    for (let y = 0; y < this.grid.getHeight(); y++) {
      for (let x = 0; x < this.grid.getWidth(); x++) {
        let t = grid.getTile(x, y);
        let numPossible = t.getData().possible.length;
        if (t.getData().tile || numPossible === 0) {
          // already collapsed or cannot collapse to anything.
          continue;
        }
        allTiles.push(t);
        if (numPossible < currentMin) {
          minimalPossible = [t];
          currentMin = numPossible;
        } else if (numPossible === currentMin) {
          minimalPossible.push(t);
        }
      }
    }
    // return allTiles;
    return minimalPossible;
  }
  update() {
    if (this.complete) {
      return;
    }

    // Collapse will pick a tile from the possible ones.
    let collapsable = this.getCollapsable();

    if (collapsable.length > 0) {
      let loc = random(collapsable);
      loc.getData().collapse();
      this.reduceWrapper(loc);
    } else {
      console.log("All filled in");
      this.complete = true;
    }
  }

  reduceWrapper(loc) {
    let toReduce = [loc]
    while (toReduce.length > 0) {
      let next = [];
      for (let loc of toReduce) {
        for (let x of this.reduce(loc)) {
          next.push(x);
        }
      }
      toReduce = next;
    }
  }

  reduce(loc) {
    // This only handles a single tile?
    let upPossible = [];
    let downPossible = [];
    let leftPossible = [];
    let rightPossible = [];
    for (let p of loc.getData().possible) {
      for (let t of p.up) {
        upPossible.push(t);
      }
      for (let t of p.down) {
        downPossible.push(t);
      }
      for (let t of p.left) {
        leftPossible.push(t);
      }
      for (let t of p.right) {
        rightPossible.push(t);
      }
    }
    let moreReductionRequired = [];
    // Recurse if the possibilities were reduced?
    if (this.reducePossible(loc.north(), upPossible)) {
      moreReductionRequired.push(loc.north());
    }
    if (this.reducePossible(loc.south(), downPossible)) {
      moreReductionRequired.push(loc.south());
    }
    if (this.reducePossible(loc.west(), leftPossible)) {
      moreReductionRequired.push(loc.west());
    }
    if (this.reducePossible(loc.east(), rightPossible)) {
      moreReductionRequired.push(loc.east());
    }
    return moreReductionRequired
  }

  reducePossible(loc, possible) {
    if (!loc.getData()) {
      // out of bounds?
      return false;
    }
    return loc.getData().reducePossible(possible);
  }

  draw() {
    for (var y = 0; y < this.tiles.getHeight(); y++) {
      for (var x = 0; x < this.tiles.getWidth(); x++) {
        let tile = this.get(x, y).getData();
        tile.show(20 + x * this.tileWidth, 20 + y * this.tileHeight, this.tileWidth, this.tileHeight);
      }
    }
    // Overlay the index of each tile to aid debugging.
    textSize(14);
    fill(255);
    noStroke();
    for (var y = 0; y < this.tiles.getHeight(); y++) {
      for (var x = 0; x < this.tiles.getWidth(); x++) {
        text(x + "," + y, x * this.tileWidth + 26, y * this.tileHeight + 32);
      }
    }
    text("reset", 15, this.tiles.getHeight() * this.tileHeight + 50);

    // Rectangle around the button.
    noFill();
    stroke(255);
    rect(15, this.tiles.getHeight() * this.tileHeight + 35, 100, 20);

    if (this.clicked) {
      this.showWithEdges(this.clicked);
    }
  }

  showWithEdges(tile) {
    // This x is based on the width of the previous display.
    let x = 40 + 12 * this.tileWidth;
    let y = 40;
    stroke('white');
    noFill();
    let scale = 20;
    noSmooth();
    rect(x, y, scale * tile.image.width + 1, scale * tile.image.height + 1);
    tile.show(x, y, scale * tile.image.width, scale * tile.image.height);
    tile.showEdges(x, y, scale);

    let edgeMax = Math.max(tile.right.length, tile.left.length, tile.up.length, tile.down.length);

    // Shift down a tile and a bit more (font size).
    y += scale * tile.image.height + 45;
    textSize(16);
    fill(255);
    noStroke();
    text("L", x + 6, y);
    text("U", x + 6 + this.tileWidth / 2 * 1.5, y);
    text("R", x + 6 + this.tileWidth / 2 * 3, y);
    text("D", x + 6 + this.tileWidth / 2 * 4.5, y);
    y += 5;

    stroke('white');
    noFill();
    for (let i = 0; i < edgeMax; i++) {
      if (tile.left[i]) {
        tile.left[i].show(x, y + i * 1.5 * this.tileHeight / 2, this.tileWidth / 2, this.tileHeight / 2)
      }
      if (tile.up[i]) {
        tile.up[i].show(x + 1.5 * this.tileWidth / 2, y + i * 1.5 * this.tileHeight / 2, this.tileWidth / 2, this.tileHeight / 2)
      }
      if (tile.right[i]) {
        tile.right[i].show(x + 3 * this.tileWidth / 2, y + i * 1.5 * this.tileHeight / 2, this.tileWidth / 2, this.tileHeight / 2)
      }
      if (tile.down[i]) {
        tile.down[i].show(x + 4.5 * this.tileWidth / 2, y + i * 1.5 * this.tileHeight / 2, this.tileWidth / 2, this.tileHeight / 2)
      }
    }
  }

  click(pos) {
    let x = Math.floor((pos.x - 20) / this.tileWidth);
    let y = Math.floor((pos.y - 20) / this.tileHeight);
    // Default to no selection.
    this.clicked = null;
    if (y >= 0 && y < this.tiles.getHeight()) {
      if (x >= 0 && x < this.tiles.getWidth()) {
        this.clicked = this.get(x, y).getData();
      }
    }

    if (this.clicked) {
      console.log("clicked on", this.clicked, pos.x, pos.y, x, y);
    }

    let dy = pos.y - (this.tiles.getHeight() * this.tileHeight + 35);
    let dx = pos.x - 15;
    if (dy > 0 && dy < 20 && dx > 0 && dx < 100) {
      console.log("clicked on reset");
      this.reset();
    }
  }

  reset() {
    this.complete = false;
    this.grid.reset();
    let allTiles = this.getPossibleTiles();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let square = new Square(x, y);
        square.setPossible(allTiles);
        grid.setTileData(x, y, square);
      }
    }
  }

  detectEdges() {
    // Find edges which look like they join.

    let overlayTiles = [];
    let opaqueTiles = [];
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      let t1 = this.allTiles[i1].getData();
      t1.image.loadPixels();
      t1.calculateEdges();
      t1.classifyEdges();
      if (t1.getEdgeCount('transparent') >= 4) {
        // Ignore these ones for now?
        overlayTiles.push(this.allTiles[i1]);
      } else {
        opaqueTiles.push(this.allTiles[i1]);
      }
    }

    for (let x = 0; x < 8; x++) {
      this.get(x, 6).getData().setEdgeType(2, "blank");
      this.get(x, 7).getData().setEdgeType(2, "blank");
    }

    // TODO Clustering of edges? (Transitivity?)
    // TODO positional awareness, my north's east is also my east's north.
    // Make sure that tile's which fit here can line up with some of my neighbours?
    // TODO neighbour categories? E.g good colour matches, possible blank edge matches, transparent matches?
    // TODO better transparent/blank detection. Find tiles which can go anywhere, all edges are blank/transparent?

    // Check if ground tiles can join to each other?
    for (let i1 = 0; i1 < opaqueTiles.length; i1++) {
      for (let i2 = i1; i2 < opaqueTiles.length; i2++) {
        this.edgeDetect(opaqueTiles[i1], opaqueTiles[i2]);
      }
    }

    // Find clusters of tiles which join?
    let allGrassDirt = this.findCluster(this.tiles.getTile(0, 0).getData());
    let castleRoof = this.findCluster(this.tiles.getTile(0, 8).getData());
    let fence = this.findCluster(this.tiles.getTile(8, 3).getData());

    this.allowAll("blank", castleRoof, allGrassDirt);
    this.allowAll("transparent", fence, allGrassDirt);
  }

  allowAll(type, inner, outer) {
    for (let a of inner) {
      for (let d = 0; d < 4; d++) {
        if (a.getEdgeType(d) === type) {
          for (let b of outer) {
            this.connectDirection(d, a, b);
          }
        }
      }
    }
  }

  findCluster(t) {
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

  edgeDetect(loc1, loc2) {
    let t1 = loc1.getData();
    let t2 = loc2.getData();

    // Match edges based on their type, or color difference threshold.
    let match = [0, 0, 0, 0];
    for (let d = 0; d < 4; d++) {
      match[d] = this.compareEdges(d, t1, t2);
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

  compareEdges(d, t1, t2) {
    if (t1.getEdgeType(d) !== "colored" && t1.getEdgeType(d) !== "same") {
      // This detector only works with colored/same edges.
      return false;
    }
    let opp = (d + 2) % 4;
    if (t2.getEdgeType(opp) !== "colored" && t2.getEdgeType(opp) !== "same") {
      // Don't connect to tiles which are not also colored or same.
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
      }
      if (i < edge.length - 1) {
        pixelDiff = Math.min(pixelDiff, this.pixelColorDistance(edge[i], edge2[i + 1]));
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

    if (pixelsMatched < 2) {
      // Not a match if only 0 or 1 pixels match.
    }
    // How many pixels were matched, and how far away in color space were they on average.
    let threshold = 16 * 400;
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
}

function preload() {
  tileset = loadImage('/static/p5/game/tinytown/tilemap_packed.png');
}

function manualSetup() {
  // Set which tile edges can join.
  // Support edges with patterns which must match a reversed edge?
  // edges which can match anything (wildcard).

  // All grass tiles can join to each other.
  grassTiles = [
    collapseFunction.get(0, 0),
    collapseFunction.get(1, 0),
    collapseFunction.get(2, 0),
    collapseFunction.get(7, 3),
  ];
  collapseFunction.interchangable(grassTiles)

  // Build a 2x2 of grass/path to combine with the 3x3 of path/grass.
  br = collapseFunction.get(3, 3);
  bl = collapseFunction.get(4, 3);
  tl = collapseFunction.get(5, 3);
  tr = collapseFunction.get(6, 3);
  collapseFunction.grid3Plus2(0, 1, [tl, tr, bl, br], grassTiles);
  // Put the grid in backwards so the dirt edges can connect as well.
  collapseFunction.grid2(br, bl, tr, tl);

  collapseFunction.grid3(0, 8, []);
  dirt = collapseFunction.get(1, 2)

  for (let x of grassTiles) {
    for (let i = 0; i < 3; i++) {
      // Connect to the dirt tile along top, left and right edges.
      collapseFunction.connectX(x, collapseFunction.get(0,8 + i));
      collapseFunction.connectX(collapseFunction.get(2, 8 + i), x);
      collapseFunction.connectY(x, collapseFunction.get(i, 8));
    }
  }

  // Any of the grid3 grass tiles can connect to a wall or roof.
  otherEdges = [
    dirt,
    br,
    bl,
    tr,
    tl,
    collapseFunction.get(0, 1),
    collapseFunction.get(1, 1),
    collapseFunction.get(2, 1),
    collapseFunction.get(0, 2),
    collapseFunction.get(1, 2),
    collapseFunction.get(2, 2),
    collapseFunction.get(0, 3),
    collapseFunction.get(1, 3),
    collapseFunction.get(2, 3),
  ]
  for (let i = 0; i < 3; i++) {
    // Connect to the dirt tile along top, left and right edges.
    collapseFunction.multiConnectX(otherEdges, [collapseFunction.get(0, 8 + i)]);
    collapseFunction.multiConnectX([collapseFunction.get(2, 8 + i)], otherEdges);
    collapseFunction.multiConnectY(otherEdges, [collapseFunction.get(i, 8)]);
  }

  roof = [
    collapseFunction.get(0, 10),
    collapseFunction.get(1, 10),
    collapseFunction.get(2, 10)
  ]
  dtl1 = collapseFunction.get(3, 9);
  dtl2 = collapseFunction.get(5, 9);
  dtr1 = collapseFunction.get(4, 9);
  dtr2 = collapseFunction.get(6, 9);
  dbl = collapseFunction.get(3, 10);
  dbr = collapseFunction.get(4, 10);
  window2 = collapseFunction.get(5, 10);
  wall = collapseFunction.get(6, 10);


  collapseFunction.multiConnectX(otherEdges, [wall, window2]);

  collapseFunction.multiConnectY(roof, [dtl1, dtl2, dtr1, dtr2, window2]);
  collapseFunction.multiConnectY([dtl1, dtl2], [dbl]);
  collapseFunction.multiConnectY([dtr1, dtr2], [dbr]);
  // collapseFunction.multiConnectY([dbl, dbr], [dirt]);
  collapseFunction.connectY(dbl, collapseFunction.get(0,2));
  collapseFunction.connectY(dbl, collapseFunction.get(3,3));
  collapseFunction.connectY(dbr, collapseFunction.get(2,2));
  collapseFunction.connectY(dbr, collapseFunction.get(4,3));

  collapseFunction.multiConnectX(grassTiles, [wall, window2]);
  collapseFunction.multiConnectX([wall, window2], [dtl1, dtl2, dbl]);
  collapseFunction.connectX(dtl1, dtr1);
  collapseFunction.connectX(dtl2, dtr2);
  collapseFunction.connectX(dbl, dbr);
  collapseFunction.multiConnectX([dtr1, dtr2, dbr], [wall, window2]);
  collapseFunction.multiConnectX([wall, window2], grassTiles);

  collapseFunction.connectY(window2, wall);
  collapseFunction.connectX(window2, window2);
  collapseFunction.connectX(wall, wall);
  collapseFunction.multiConnectX([dirt], [window2, wall]);
  collapseFunction.multiConnectX([window2, wall], [dirt]);

  // Wall tiles can be above dirt, grass or grass/dirt edges
  collapseFunction.multiConnectY([wall], [dirt, collapseFunction.get(1, 1)]);
  collapseFunction.multiConnectY([wall], grassTiles);
}

let mousePos;
function setup() {
  view = new MapView(20);

  w = view.getCanvasWidth();
  h = view.getCanvasHeight();
  createCanvas(w, h);
  console.log("setting canvas size", w, h);
  view.setCenter(createVector(200, 200));

  mousePos = createVector(0, 0);

  width = 35;
  height = 25;
  grid = new Grid(width, height, view.getMapSize());
  // Get collapseFunction to fill in a grid.

  collapseFunction = new CollapseFunction(grid);
  collapseFunction.setTileset(tileset, 16,16);

  collapseFunction.detectEdges();

  // The detection should have some groups which can be accessed by any of their members?
  // Get all grass tiles?
  // Get all house tiles?
  // collapseFunction.multiConnectY();

  // manualSetup();
  collapseFunction.reset();

  // collapseFunction.edges;
  if (Notification.permission === "granted") {
    setTimeout(function() {
      new Notification("WFC Test", {
        body: "Hi",
        tag: "dedupe"
        // Also can contain badge, icon, image, data and more https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification
      });
    }, 1000);
  } else {
    console.log("Notifications permission", Notification.permission);
  }
}

function draw() {
  background(127);

  view.update();

  // TODO conditionally show the mapping of edges for the tileset?
  collapseFunction.draw();

  // update should find and fill in one square each frame.
  collapseFunction.update();

  view.drawMap(grid);
  // view.coverEdges();
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

function mouseReleased() {
  mousePos.set(mouseX, mouseY);
  collapseFunction.click(mousePos);
}
