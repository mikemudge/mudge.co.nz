/* goes through a tileset and creates WFCTile's with possible tiles in each direction */
class TileSetEdgeMatcher {

  constructor(tileset, tileWidth, tileHeight) {
    let tilesAcross = tileset.width / tileWidth;
    let tilesDown = tileset.height / tileHeight;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    if (tileWidth !== tileHeight) {
      console.warn("non square tiles are not currently well supported");
    }
    this.tiles = new Grid(tilesAcross, tilesDown, tileWidth);
    console.log("Tile set loaded", tilesAcross, tilesDown);
    for (var y = 0; y < tilesDown; y += 1) {
      for (var x = 0; x < tilesAcross; x += 1) {
        let img = tileset.get(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
        let tile = new WFCTile(img, x +"," + y);
        this.tiles.setTileData(x, y, tile);
      }
    }

    this.allTiles = [];
    this.clusters = [];
    this.ground = [];
    this.items = [];
    this.objects = [];
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

  connectLayersZ(ground, objects) {
    for (let t of objects) {
      if (t.below.length === 0) {
        this.multiConnectZ(ground, [t]);
      }
    }
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
      if (tiles[i1].isIsolated()) {
        // Skip over tiles which are isolated (no cluster)
        continue;
      }
      for (let i2 = i1; i2 < tiles.length; i2++) {
        if (tiles[i2].isIsolated()) {
          // Skip over tiles which are isolated (no cluster)
          continue;
        }
        let match = [0, 0, 0, 0];
        for (let d = 0; d < 4; d++) {
          match[d] = this.edgeMatching(d, tiles[i1], tiles[i2], threshold, allowedEdges);
        }
        this.connectMatches(match, tiles[i1], tiles[i2]);
      }
    }
  }

  connectMatches(match, t1, t2) {
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

  getLayers() {
    return [this.ground, this.objects];
  }

  findImpossibilities(cluster) {
    for (let t of cluster) {
      // Assume t is the bottom left corner of a 2x2 grid.
      // Search for up/right's which cause impossible states?
      for (let t1 of t.up) {
        // t1 is the top left corner.
        for (let t2 of t1.right) {
          // t2 is the top right corner.
          if (!this.intersection(t2.down, t.right)) {
            // t, t1, t2 makes an impossible situation?
            console.log("Can't do", t, t1, t2);
            this.impossible = [t, t1, t2];
            // While debugging just find the first impossibility.
            return;
          }
        }
      }
    }
  }

  intersection(tiles1, tiles2) {
    return tiles1.filter(value => tiles2.includes(value));
  }

  findAllClusters() {
    this.ground = [];
    this.items = [];
    this.objects = [];
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

    // Classify each cluster as ground or objects.
    for (let cluster of this.clusters) {
      let transparent = false;
      for (let tile of cluster) {
        if (tile.hasTransparentPixel()) {
          // This cluster must be part of the main layer
          transparent = true;
          break;
        }
      }
      for (let tile of cluster) {
        if (transparent) {
          this.objects.push(tile);
        } else {
          this.ground.push(tile);
        }
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
    this.objects.push(t);
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

  edgeMatching(d, t1, t2, threshold, allowedEdges) {
    let verbose = t1.debug && t2.debug;
    if (t1 === t2) {
      // Don't debug matching with the same tile.
      verbose = false;
    }
    if (this.checkAllowedEdges(d, t1, t2, allowedEdges)) {
      // console.log("Allowed edge match", t1, t2);
      return true;
    }

    // We only do full edge detection on colored/same edges?
    let opp = (d + 2) % 4;
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

    // Check the color difference
    let diff = this.compareEdgesDifference(d, t1, t2, verbose);
    if (diff < threshold) {
      return true;
    }
    return false;
  }

  checkAllowedEdges(d, t1, t2, allowedEdges) {
    let opp = (d + 2) % 4;
    return allowedEdges.includes(t1.getEdgeType(d)) && t1.getEdgeType(d) === t2.getEdgeType(opp);
  }

  compareEdges(d, t1, t2) {
    // TODO new Edge Detection based check?
  }

  compareEdgesDifference(d, t1, t2, verbose) {
    let opp = (d + 2) % 4;
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
      // Not a match if 1 or less in 8 pixels match?
    }
    return edgeDiff;
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
