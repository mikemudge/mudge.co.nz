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
  constructor(img) {
    this.image = img;
    // Register which tiles can be adjacent to this in various directions.
    this.left = [];
    this.right = [];
    this.up = [];
    this.down = [];
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

  show(x, y, w, h) {
    image(this.image, x, y, w, h);
  }
}

class CollapseFunction {

  constructor(grid) {
    this.grid = grid;
  }

  setTileset(tileset, tileWidth, tileHeight) {
    this.tiles = [];
    this.scale = 2;
    console.log("Tile set loaded", tileset.width, tileset.height);
    for (var y = 0; y < tileset.height; y += tileHeight) {
      let row = [];
      for (var x = 0; x < tileset.width; x += tileWidth) {
        let img = tileset.get(x, y, tileWidth, tileHeight);
        row.push(new WFCTile(img));
      }
      this.tiles.push(row);
    }

    // Display size is scaled up.
    this.tileWidth = tileWidth * this.scale;
    this.tileHeight = tileHeight * this.scale;
  }

  get(x, y) {
    return this.tiles[y][x];
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
    let allTiles = [];
    // Set allTiles based on ones which were setup.
    for (var y = 0; y < this.tiles.length; y++) {
      for (var x = 0; x < this.tiles[y].length; x++) {
        let tile = this.tiles[y][x];
        if (tile.right.length + tile.left.length + tile.up.length + tile.down.length > 0) {
          allTiles.push(tile);
        }
      }
    }

    return allTiles;
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
      this.reduce(loc);
    } else {
      console.log("All filled in");
      this.complete = true;
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
    // Recurse if the possibilities were reduced?
    if (this.reducePossible(loc.north(), upPossible)) {
      this.reduce(loc.north());
    }
    if (this.reducePossible(loc.south(), downPossible)) {
      this.reduce(loc.south());
    }
    if (this.reducePossible(loc.west(), leftPossible)) {
      this.reduce(loc.west());
    }
    if (this.reducePossible(loc.east(), rightPossible)) {
      this.reduce(loc.east());
    }
  }

  reducePossible(loc, possible) {
    if (!loc.getData()) {
      // out of bounds?
      return false;
    }
    return loc.getData().reducePossible(possible);
  }

  draw() {
    for (var y = 0; y < this.tiles.length; y++) {
      for (var x = 0; x < this.tiles[y].length; x++) {
        this.tiles[y][x].show(20 + x * this.tileWidth, 20 + y * this.tileHeight, this.tileWidth, this.tileHeight);

        // Overlay the index of each tile to aid debugging.
        fill(255);
        noStroke();
        text(x + "," + y, x * this.tileWidth + 26, y * this.tileHeight + 32);
      }
    }

    if (this.clicked) {
      this.showWithEdges(this.clicked);
    }
  }

  showWithEdges(tile) {
    let x = 40 + 12 * this.tileWidth;
    let y = 20;
    tile.show(x, y, this.tileWidth, this.tileHeight);

    let edgeMax = Math.max(tile.right.length, tile.left.length, tile.up.length, tile.down.length);

    // Shift down by 40 pixels.
    y += 40;
    fill(255);
    noStroke();
    text("L", x + 6, y);
    text("U", x + 6 + this.tileWidth * 1.5, y);
    text("R", x + 6 + this.tileWidth * 3, y);
    text("D", x + 6 + this.tileWidth * 4.5, y);
    // Shift down a little more.
    y += 20;

    for (let i = 0; i < edgeMax; i++) {
      if (tile.left[i]) {
        tile.left[i].show(x, y + i * 1.5 * this.tileHeight, this.tileWidth, this.tileHeight)
      }
      if (tile.up[i]) {
        tile.up[i].show(x + 1.5 * this.tileWidth, y + i * 1.5 * this.tileHeight, this.tileWidth, this.tileHeight)
      }
      if (tile.right[i]) {
        tile.right[i].show(x + 3 * this.tileWidth, y + i * 1.5 * this.tileHeight, this.tileWidth, this.tileHeight)
      }
      if (tile.down[i]) {
        tile.down[i].show(x + 4.5 * this.tileWidth, y + i * 1.5 * this.tileHeight, this.tileWidth, this.tileHeight)
      }
    }
  }

  click(pos) {
    let x = Math.floor((pos.x - 20) / this.tileWidth);
    let y = Math.floor((pos.y - 20) / this.tileHeight);
    // Default to no selection.
    this.clicked = null;
    if (y >= 0 && y < this.tiles.length) {
      if (x >= 0 && x < this.tiles[0].length) {
        this.clicked = this.tiles[y][x];
      }
    }
    console.log("clicked on", this.clicked, pos.x, pos.y, x, y);
  }
}

function preload() {
  tileset = loadImage('/static/p5/game/tinytown/tilemap_packed.png');
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

  let allTiles = collapseFunction.getPossibleTiles();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      square = new Square(x, y);
      square.setPossible(allTiles);
      grid.setTileData(x, y, square);
    }
  }

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
  background(0);

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
