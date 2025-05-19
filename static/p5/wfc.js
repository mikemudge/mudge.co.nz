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
    console.log("Collapsed", this, this.tile);
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
      noStroke();
      text(this.possible.length, 5, 15);
      stroke(70);
      noFill();
      rect(0, 0, size * 2, size * 2);
      return;
    }
    if (this.tile.image) {
      image(this.tile.image, 0, 0, size * 2, size * 2);
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
}

class WFCTile {
  constructor(img) {
    this.image = img;
    // Register which tiles can be adjacent to this in various directions.
    this.left = [];
    this.right = [];
    this.up = [];
    this.down = [];
    this.edges = [[],[],[],[]];
    this.edgeTypeCounts = {};
    this.edgeTypes = [];
    this.debug = false;
  }
  copy() {
    let t = new WFCTile(this.image);
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
        let tile = new WFCTile(img);
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
    // Default distance down to display the edges.
    let height = 50;
    if (tile.image) {
      // Override this if we are displaying a tile.
      height = scale * tile.image.height;
      rect(x, y, scale * tile.image.width + 1, scale * tile.image.height + 1);
      tile.show(x, y, scale * tile.image.width, scale * tile.image.height);
      tile.showEdges(x, y, scale);
    }

    let edgeMax = Math.max(tile.right.length, tile.left.length, tile.up.length, tile.down.length);

    // Shift down a tile and a bit more (font size).
    y += height + 45;
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
  }

  detectEdges() {
    // Find edges which look like they join.
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      let t1 = this.allTiles[i1];
      t1.image.loadPixels();
      t1.calculateEdges();
      t1.classifyEdges();
    }

    // Check if ground tiles can join to each other?
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      for (let i2 = i1; i2 < this.allTiles.length; i2++) {
        this.edgeDetect(this.allTiles[i1], this.allTiles[i2]);
      }
    }
  }

  manualFixes(empty) {
    // TODO hack some blank edges.
    for (let x = 0; x < 8; x++) {
      let houseFront = [this.get(x, 6).getData(), this.get(x, 7).getData()];

      // Reset down, then add empty.
      houseFront[0].down = [];
      houseFront[1].down = [];
      houseFront[0].up = [];
      houseFront[1].up = [];
      // These house front tiles can be above empty.
      this.multiConnectY(houseFront, [empty]);

    }

    // Left roof above left wall, right roof above right wall.
    this.connectY(this.get(0, 5).getData(), this.get(0, 6).getData());
    this.connectY(this.get(2, 5).getData(), this.get(3, 6).getData());

    // Second house
    this.connectY(this.get(4, 5).getData(), this.get(4, 6).getData());
    this.connectY(this.get(6, 5).getData(), this.get(7, 6).getData());

    for (let x = 0; x < 4; x++) {
      // connect front and roof.
      this.connectY(this.get(x, 5).getData(), this.get(x, 6).getData());
      // The other house (4 over)
      this.connectY(this.get(x + 4, 5).getData(), this.get(x + 4, 6).getData());

    }

    // The house roof needs to connect.
    for (let y = 4; y < 6; y++) {
      let middleRoof = this.get(1, y).getData();
      let decorRoof = this.get(3, y).getData();
      this.connectX(middleRoof, middleRoof);
      this.connectX(decorRoof, middleRoof);
      this.connectX(middleRoof, decorRoof);
      this.connectX(this.get(0, y).getData(), decorRoof);
      this.connectX(decorRoof, this.get(2, y).getData());
      this.connectX(this.get(0, y).getData(), middleRoof);
      this.connectX(middleRoof, this.get(2, y).getData());

      // Second house
      middleRoof = this.get(5, y).getData();
      decorRoof = this.get(7, y).getData();
      this.connectX(middleRoof, middleRoof);
      this.connectX(decorRoof, middleRoof);
      this.connectX(middleRoof, decorRoof);
      this.connectX(this.get(4, y).getData(), decorRoof);
      this.connectX(decorRoof, this.get(6, y).getData());
      this.connectX(this.get(4, y).getData(), middleRoof);
      this.connectX(middleRoof, this.get(6, y).getData());
    }

    let left = [this.get(0, 6).getData()];
    let right = [this.get(3, 6).getData()];
    let doubleDoor = [this.get(2, 7).getData(), this.get(3, 7).getData()];
    let middle = [this.get(1, 6).getData()];
    let decor = [
      // this.get(2, 6).getData(),
      this.get(0, 7).getData(),
      this.get(1, 7).getData(),
    ];
    // The middle roof can connect down to any of the middle fronts.
    let middleRoof = [this.get(1, 5).getData(), this.get(3, 5).getData()]
    this.multiConnectY(middleRoof, middle);
    this.multiConnectY(middleRoof, decor);
    this.multiConnectY(middleRoof, doubleDoor);

    // TODO this may cause dupes?
    this.connectHouse(left, right, doubleDoor, middle, decor);

    // Second house.
    left = [this.get(4, 6).getData()];
    right = [this.get(7, 6).getData()];
    doubleDoor = [this.get(6, 7).getData(), this.get(7, 7).getData()];
    middle = [this.get(5, 6).getData()];
    decor = [
      // this.get(6, 6).getData(),
      this.get(4, 7).getData(),
      this.get(5, 7).getData(),
    ];
    // The middle roof can connect down to any of the middle fronts.
    middleRoof = [this.get(5, 5).getData(), this.get(7, 5).getData()]
    this.multiConnectY(middleRoof, middle);
    this.multiConnectY(middleRoof, decor);
    this.multiConnectY(middleRoof, doubleDoor);

    // TODO this may cause dupes?
    this.connectHouse(left, right, doubleDoor, middle, decor);

    // Castle
    let roof1 = this.get(0, 10).getData();
    let roof2 = this.get(1, 10).getData();
    let roof3 = this.get(2, 10).getData();

    // roof2 down matching is best, copy it to the others.
    roof1.down = [...roof2.down];
    roof3.down = [...roof2.down];

    this.connectX(empty, this.get(6, 10).getData());
    this.connectX(this.get(6, 10).getData(), empty);
    this.connectY(this.get(6, 10).getData(), empty);

    // Manually fix up some edges.
    this.fixTrees();

    this.fixWalls();
  }

  connectHouse(left, right, doubleDoor, middle, decor) {
    this.multiConnectX(left, middle);
    this.multiConnectX(left, decor);
    this.multiConnectX(middle, middle);
    this.multiConnectX(middle, decor);
    this.multiConnectX(decor, middle);
    this.multiConnectX(decor, right);
    this.multiConnectX(middle, right);
    this.multiConnectX([doubleDoor[1]], right);
    this.multiConnectX([doubleDoor[1]], middle);
    this.multiConnectX(left, [doubleDoor[0]]);
    this.multiConnectX(middle, [doubleDoor[0]]);
    this.connectX(doubleDoor[0], doubleDoor[1]);
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

  edgeDetect(t1, t2) {
    // Match edges based on their type, or color difference threshold.
    let match = [0, 0, 0, 0];
    for (let d = 0; d < 4; d++) {
      match[d] = this.compareEdges(d, t1, t2, t1.debug && t2.debug);
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

  compareEdges(d, t1, t2, verbose) {
    let opp = (d + 2) % 4;
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
    // How many pixels were matched, and how far away in color space were they on average.
    let threshold = 16 * 500;
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

  fixWalls(allGrassDirt) {
    let wall = [
      this.get(5,10).getData(),
      this.get(6,10).getData()
    ];
    let wall2 = [
      wall[0].copy(),
      wall[1].copy()
    ];
    let roof = [
      this.get(0,10).getData(),
      this.get(1,10).getData(),
      this.get(2,10).getData()
    ];

    // Using a top wall and bottom wall so its always fixed height of 2.
    this.multiConnectY(roof, wall);
    this.multiConnectY(wall, wall2);
    for (let w of wall2) {
      w.setEdgeType(2, "blank");
    }
  }

  fixTrees() {
    let treetop = [
      this.get(7,1).getData(),
    ];
    let tree = [
      this.get(6,2).getData(),
      this.get(8,2).getData()
    ];
    this.multiConnectY(treetop, tree);
    let treetop2 = [
      this.get(10,1).getData(),
    ];
    let tree2 = [
      this.get(9,2).getData(),
      this.get(11,2).getData()
    ];
    this.multiConnectY(treetop2, tree2);
  }
}

class CollapseFunction {
  constructor(width, height, view, layers) {
    this.width = width;
    this.height = height;
    this.view = view;
    this.groundTiles = layers[0];
    this.objectTiles = layers[1];
    this.view.setCenter(createVector(200, 200));

    // TODO layers aren't quite right.

    this.ground = new Grid(width, height, view.getMapSize());
    this.objects = new Grid(width, height, view.getMapSize());
    this.reset();
  }

  reset() {
    this.complete = false;
    this.ground.reset();
    this.objects.reset();
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let square = new Square(x, y);
        square.setPossible(this.groundTiles);
        this.ground.setTileData(x, y, square);
        square = new Square(x, y);
        square.setPossible(this.objectTiles);
        this.objects.setTileData(x, y, square);
      }
    }
  }

  getCollapsable(layer) {
    let currentMin = 1000000;
    let minimalPossible = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let t = layer.getTile(x, y);
        let numPossible = t.getData().possible.length;
        if (t.getData().tile || numPossible === 0) {
          // already collapsed or cannot collapse to anything.
          continue;
        }
        if (numPossible < currentMin) {
          minimalPossible = [t];
          currentMin = numPossible;
        } else if (numPossible === currentMin) {
          minimalPossible.push(t);
        }
      }
    }
    return minimalPossible;
  }

  update() {

    view.update();

    if (this.complete) {
      return;
    }

    // Collapse will pick a tile from the possible ones.
    let collapsable = this.getCollapsable(this.ground);
    let collapsable2 = this.getCollapsable(this.objects);

    let collapse = false;
    if (collapsable.length > 0) {
      let loc = random(collapsable);
      loc.getData().collapse();
      this.reduceWrapper(loc);
      collapse = true;
    }
    if (collapsable2.length > 0) {
      let loc = random(collapsable2);
      loc.getData().collapse();
      this.reduceWrapper(loc);
      collapse = true;
    }
    if (!collapse) {
      console.log("All filled in");
      this.complete = true;
    }
  }

  draw() {
    this.view.drawMap(this.ground);
    this.view.drawMap(this.objects);
    // view.coverEdges();

    fill(255);
    noStroke();
    text("reset", 15, 11 * 32 + 50);
    // Rectangle around the button.
    noFill();
    stroke(255);
    rect(15, 11 * 32 + 35, 100, 20);
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
let tilesetMatcher;
let collapseFunction;
function setup() {

  mousePos = createVector(0, 0);

  tilesetMatcher = new TileSetEdgeMatcher(tileset, 16,16);

  // Get additional logging during edge detection for debug tiles.
  tilesetMatcher.get(0, 10).getData().setDebug("0,10");
  tilesetMatcher.get(1, 10).getData().setDebug("1,10");

  // TODO Clustering of edges? (Transitivity?)
  // TODO positional awareness, my north's east is also my east's north.
  // Make sure that tile's which fit here can line up with some of my neighbours?

  tilesetMatcher.detectEdges();

  // The grass/dirt cluster is the ground layer.
  let grassDirtTiles = tilesetMatcher.findCluster(0, 0);

  // Add an empty tile to the object layer, so there is an option to have nothing above grass.
  let empty = new WFCTile(null);
  for (let d = 0; d < 4; d++) {
    empty.setEdgeType(d, "transparent");
  }
  tilesetMatcher.addTile(empty);
  this.clicked = empty;

  // TODO try to reduce these.
  tilesetMatcher.manualFixes(empty);

  // Connect blank edges to empty?
  tilesetMatcher.blankEdges([empty]);

  // Connect other edges to empty?
  // E.g castle walls don't have a blank edge.

  // Connect transparent edges to the empty tile.
  // This means there is always a slight gap between things.
  tilesetMatcher.transparentEdges([empty]);

  // disconnect some of the "items" which don't join well.
  tilesetMatcher.removeConnections([
    tilesetMatcher.get(9, 4).getData(),
    tilesetMatcher.get(11, 7).getData(),
    tilesetMatcher.get(11, 8).getData(),
    tilesetMatcher.get(8, 9).getData(),
    tilesetMatcher.get(9, 9).getData(),
    tilesetMatcher.get(8, 10).getData(),
    tilesetMatcher.get(10, 10).getData(),
    tilesetMatcher.get(11, 10).getData(),
  ]);

  // layer 2 is everything which can go on top of grass/dirt
  // Start with the fence cluster, but after transparent edges have been joined.
  let objectTiles = tilesetMatcher.findCluster(8, 3);
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

  // manualSetup();

  // Create a grid, and use the matched tiles to fill it in.
  view = new MapView(20);
  w = view.getCanvasWidth();
  h = view.getCanvasHeight();
  createCanvas(w, h);
  console.log("setting canvas size", w, h);

  let layers = [grassDirtTiles, objects];
  // TODO layers should restrict each other.
  collapseFunction = new CollapseFunction(35, 25, view, layers);

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

  // TODO Make this draw conditional?
  tilesetMatcher.draw();

  // update should find and fill in one square each frame.
  collapseFunction.update();
  collapseFunction.draw();
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
  tilesetMatcher.click(mousePos);

  let dy = mouseY - (11 * 32 + 35);
  let dx = mouseX - 15;
  if (dy > 0 && dy < 20 && dx > 0 && dx < 100) {
    console.log("clicked on reset");
    collapseFunction.reset();
  }
}
