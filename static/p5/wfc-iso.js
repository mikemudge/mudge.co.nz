class IsoTile extends WFCTile {
  constructor(image, name, direction) {
    super(image, name + direction);
    this.direction = direction;
  }

  show(size) {
    // h is just the image height scaled to the current size.
    let h = size * 2 * this.image.height / this.image.width;
    let dirtDepth = size * .15;
    image(this.image, 0, size / 2 - h + dirtDepth, size * 2, h);
  }

  showTileAt(x, y, w, h) {
    let h2 = w * this.image.height / this.image.width;
    image(this.image, x, y + (h - h2) / 2, w, h2);
  }
}

let imageLoader
function preload() {
  let path = '/static/p5/game/tilesets/roadTiles_nova/png/';
  imageLoader = new ImageLoader(path);
  let diag = ['NE', 'ES', 'SW', 'NW'];
  let T = ['NES', 'ESW', 'NSW', 'NEW'];
  let cardinal = ['N', 'E', 'S', 'W'];
  let straight = ['NS', 'EW'];

  // 4 directional tiles.
  for (let t of ['road', 'crossroad', 'water', 'grass', 'grassWhole', 'dirt', 'beach']) {
    imageLoader.loadTiles(t, ['']);
  }

  // Corner tiles.
  for (let t of ['road', 'lot', 'water', 'river', 'riverBanked', 'waterCorner', 'beach', 'beachCorner', 'hill']) {
    imageLoader.loadTiles(t, diag);
  }
  // T tiles.
  for (let t of ['crossroad']) {
    imageLoader.loadTiles(t, T);
  }
  // Straight tiles..
  for (let t of ['road', 'bridge', 'river', 'riverBanked']) {
    imageLoader.loadTiles(t, straight);
  }
  // Edge tiles.
  for (let t of ['lot', 'water', 'exit', 'end', 'beach', 'hill', 'roadHill', 'roadHill2']) {
    imageLoader.loadTiles(t, cardinal);
  }
}

class ImageLoader {
  constructor(path) {
    this.path = path;
    this.images = [];
  }

  loadTiles(t, directions) {
    for (let d of directions) {
      this.images.push({
        name: t,
        direction: d,
        image: loadImage(this.path + t + d + '.png')
      });
    }
  }

  getImages() {
    return this.images;
  }
}

class EdgeSet {
  constructor(name) {
    this.name = name;
    this.north = [];
    this.east = [];
    this.south = [];
    this.west = [];
  }

  getDirections() {
    return [
      this.north,
      this.east,
      this.south,
      this.west
    ]
  }

  addEveryDir(t) {
    this.north.push(t);
    this.east.push(t);
    this.south.push(t);
    this.west.push(t);
  }
}

class IsoTownMatcher {
  constructor() {
    this.tiles = {};
    this.allTiles = [];
    this.allEdges = [];
  }

  addImages(images) {
    for (let img of images) {
      this.tiles[img.name] = this.tiles[img.name] || {};
      let tile = new IsoTile(img.image, img.name, img.direction);
      this.tiles[img.name][img.direction] = tile;
      this.allTiles.push(tile);
    }

    for (let t of Object.keys(this.tiles)) {
      this.allEdges[t] = new EdgeSet(t);
    }
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

  connectX(a, b) {
    a.addRight(b);
    b.addLeft(a);
  }

  connectY(a, b) {
    a.addDown(b);
    b.addUp(a);
  }

  connectNotDirString(dirString, tile, edges) {
    if (dirString === '') {
      // Empty means all, so nothing will not match.
      return;
    }
    if (!dirString.includes("N")) {
      edges.north.push(tile);
    }
    if (!dirString.includes("E")) {
      edges.east.push(tile);
    }
    if (!dirString.includes("S")) {
      edges.south.push(tile);
    }
    if (!dirString.includes("W")) {
      edges.west.push(tile);
    }
  }

  connectDirString(dirString, tile, edges) {
    if (dirString === '') {
      edges.addEveryDir(tile);
      return;
    }
    if (dirString.includes("N")) {
      edges.north.push(tile);
    }
    if (dirString.includes("E")) {
      edges.east.push(tile);
    }
    if (dirString.includes("S")) {
      edges.south.push(tile);
    }
    if (dirString.includes("W")) {
      edges.west.push(tile);
    }
  }

  processType(t, edgeType, externalType) {
    for (let dirString of Object.keys(this.tiles[t])) {
      this.connectDirString(dirString, this.tiles[t][dirString], this.allEdges[edgeType]);
      this.connectNotDirString(dirString, this.tiles[t][dirString], this.allEdges[externalType]);
    }
  }

  processTransitionAll(t, mainType, otherType, transitionTypes) {
    // Process the cardinal directions.
    this.processTransitionEdges(t, mainType, otherType, transitionTypes);
    // And then process the corners.
    this.processTransitionCorners(t, otherType, transitionTypes);
  }

  processTransitionEdges(t, mainType, otherType, transitionTypes) {
    let main = this.allEdges[mainType];
    let other = this.allEdges[otherType];
    let main_other = this.allEdges[transitionTypes[0] + '_' + transitionTypes[1]];
    let other_main = this.allEdges[transitionTypes[1] + '_' + transitionTypes[0]];

    let n = this.tiles[t]['N'];
    let e = this.tiles[t]['E'];
    let s = this.tiles[t]['S'];
    let w = this.tiles[t]['W'];

    // Other type is in the named direction.
    other.north.push(n);
    other.east.push(e);
    other.south.push(s);
    other.west.push(w);

    // Main type is in the opposite direction.
    main.south.push(n);
    main.west.push(e);
    main.north.push(s);
    main.east.push(w);

    // Each tile has grass towards the label, and lot everywhere else.
    other_main.east.push(n);
    other_main.west.push(n);
    main_other.north.push(e);
    main_other.south.push(e);
    main_other.east.push(s);
    main_other.west.push(s);
    other_main.north.push(w);
    other_main.south.push(w);
  }

  processTransitionCorners(t, otherType, transitionTypes) {
    let other = this.allEdges[otherType];
    let main_other = this.allEdges[transitionTypes[0] + '_' + transitionTypes[1]];
    let other_main = this.allEdges[transitionTypes[1] + '_' + transitionTypes[0]];

    let ne = this.tiles[t]['NE'];
    let es = this.tiles[t]['ES'];
    let sw = this.tiles[t]['SW'];
    let nw = this.tiles[t]['NW'];

    other.north.push(ne, nw);
    other.east.push(ne, es);
    other.south.push(es, sw);
    other.west.push(sw, nw);

    main_other.south.push(ne);
    other_main.west.push(ne);
    main_other.north.push(es);
    main_other.west.push(es);
    other_main.north.push(sw);
    main_other.east.push(sw);
    other_main.east.push(nw);
    other_main.south.push(nw);
  }

  // Internal corners
  processTransitionCorners2(t, mainType, transitionTypes) {
    let main = this.allEdges[mainType];
    let main_other = this.allEdges[transitionTypes[0] + '_' + transitionTypes[1]];
    let other_main = this.allEdges[transitionTypes[1] + '_' + transitionTypes[0]];

    let ne = this.tiles[t]['NE'];
    let es = this.tiles[t]['ES'];
    let sw = this.tiles[t]['SW'];
    let nw = this.tiles[t]['NW'];

    // Add edges in the non named directions to be main.
    main.north.push(es, sw);
    main.east.push(sw, nw);
    main.south.push(ne, nw);
    main.west.push(ne, es);

    // Add edges in the named directions to be transitions.
    main_other.north.push(ne);
    other_main.east.push(ne);
    main_other.east.push(es);
    main_other.south.push(es);
    other_main.south.push(sw);
    main_other.west.push(sw);
    other_main.north.push(nw);
    other_main.west.push(nw);
  }

  connectAll(t1, t2) {
    this.connectY(t1, t2);
    this.connectX(t1, t2);
    this.connectY(t2, t1);
    this.connectX(t2, t1);
  }
  connectEdge(a, b) {
    let edgeSetA = this.allEdges[a];
    let edgeSetB = this.allEdges[b];
    for (let t1 of edgeSetA.north) {
      for (let t2 of edgeSetB.south) {
        this.connectY(t2, t1);
      }
    }
    for (let t1 of edgeSetB.north) {
      for (let t2 of edgeSetA.south) {
        this.connectY(t2, t1);
      }
    }
    for (let t1 of edgeSetA.east) {
      for (let t2 of edgeSetB.west) {
        this.connectX(t1, t2);
      }
    }
    for (let t1 of edgeSetB.east) {
      for (let t2 of edgeSetA.west) {
        this.connectX(t1, t2);
      }
    }
  }

  connectAllowed(a, b, allowed) {
    let edgeSetA = this.allEdges[a];
    let edgeSetB = this.allEdges[b];
    for (let t1 of edgeSetA.north) {
      if (allowed.includes(t1.direction)) {
        for (let t2 of edgeSetB.south) {
          if (allowed.includes(t2.direction)) {
            this.connectY(t2, t1);
          }
        }
      }
    }
    for (let t1 of edgeSetB.north) {
      if (allowed.includes(t1.direction)) {
        for (let t2 of edgeSetA.south) {
          if (allowed.includes(t2.direction)) {
            this.connectY(t2, t1);
          }
        }
      }
    }
    for (let t1 of edgeSetA.east) {
      if (allowed.includes(t1.direction)) {
        for (let t2 of edgeSetB.west) {
          if (allowed.includes(t2.direction)) {
            this.connectX(t1, t2);
          }
        }
      }
    }
    for (let t1 of edgeSetB.east) {
      if (allowed.includes(t1.direction)) {
        for (let t2 of edgeSetA.west) {
          if (allowed.includes(t2.direction)) {
            this.connectX(t1, t2);
          }
        }
      }
    }

  }

  connectAllowedTile(a, tile, allowed) {
    let directions = this.allEdges[a].getDirections();
    for (let [d, edgeSetDirection] of directions.entries()) {
      for (let t1 of edgeSetDirection) {
        if (allowed.includes(t1.direction)) {
          this.connectDirection(d, tile, t1);
        }
      }
    }
  }

  connectAllEdges() {
    for (let edgeType of Object.keys(this.allEdges)) {
      if (edgeType === "grassOnly") {
        continue;
      }
      if (edgeType === "waterOnly") {
        continue;
      }
      let edgeSet = this.allEdges[edgeType];
      for (let t1 of edgeSet.north) {
        for (let t2 of edgeSet.south) {
          this.connectY(t2, t1);
        }
      }
      for (let t1 of edgeSet.east) {
        for (let t2 of edgeSet.west) {
          this.connectX(t1, t2);
        }
      }
    }
  }

  processAllTiles() {

    // This tile is not really a road.
    let lot = this.tiles['road'][''];
    let grass = this.tiles['grass'][''];
    let water = this.tiles['water'][''];

    this.tiles['road'][''] = this.tiles['crossroad'][''];

    // Add the single tiles which connect in all directions.
    // this.allEdges['lot'].addEveryDir(lot);
    this.allEdges['grass'].addEveryDir(grass);
    this.allEdges['water'].addEveryDir(water);

    // TODO ensure combination edges?
    this.allEdges['grass_lot'] = new EdgeSet("grass_lot");
    this.allEdges['lot_grass'] = new EdgeSet("grass_lot");
    this.allEdges['grass_water'] = new EdgeSet("grass_water");
    this.allEdges['water_grass'] = new EdgeSet("water_grass");
    this.allEdges['beach_water'] = new EdgeSet("beach_water");
    this.allEdges['water_beach'] = new EdgeSet("water_beach");
    this.allEdges['grassOnly'] = new EdgeSet("grassOnly");
    this.allEdges['waterOnly'] = new EdgeSet("waterOnly");

    let allDirections = ["", "N", "E", "S", "W", "EW", "NS", "NE", "ES", "SW", "NW","NES", "NEW", "NSW", "ESW"];
    let straightEdges = ["N", "E", "S", "W", "EW", "NS"];

    this.processTransitionAll('water', 'water', 'grass', ['water', 'grass']);
    // This uses opposite direction logic, E.g ES are the transition edges instead.
    this.processTransitionCorners2('waterCorner', 'water', ['water', 'grass']);
    // beach is weird, cardinal directions align with others. but corners are flipped.
    this.processTransitionEdges('beach', 'water', 'grass', ['water', 'beach']);
    this.processTransitionCorners2('beach', 'grass', ['beach', 'water']);
    this.processTransitionCorners2('beachCorner', 'water', ['water', 'beach']);

    this.processTransitionAll('lot', 'lot', 'grass', ['lot', 'grass']);
    this.processTransitionEdges('exit', 'lot', 'road', ['lot', 'grass']);
    this.processType("road", "road", "grass");
    this.processType("crossroad", "road", "grass");
    // TODO is there a way to prevent a dead end which connects to another dead end?
    this.processType("end", "road", "grass");

    this.processType("bridge", "road", "waterOnly");

    // river can cause joins with 1 or 3 which are impossible.
    this.processType("river", "river", "grassOnly");
    this.processType("riverBanked", "riverBanked", "grassOnly");


    // Allow beach edges to connect to grass edges?
    // TODO this doesn't look great when it happens often, perhaps just straight edges should?.
    this.connectAllowedTile('beach', grass, straightEdges);
    // this.connectAllowed('water_beach', 'water_grass', straightEdges);
    // this.connectAllowed('beach_water', 'grass_water', straightEdges);
    this.connectAllowed('river', 'riverBanked', straightEdges);


    // Need ends for beach?
    this.connectAllowedTile('water_beach', water, straightEdges);
    this.connectAllowedTile('beach_water', water, straightEdges);
    // Side effect that water can join to grass directly?
    this.connectAll(water, grass);

    this.connectAllowedTile('grassOnly', grass, allDirections);
    this.connectAllowedTile('waterOnly', water, allDirections);

    // Need ends for rivers?
    this.connectAllowedTile('river', water, straightEdges);
    this.connectAllowedTile('riverBanked', water, straightEdges);
    this.connectAllEdges();

    return this.allTiles;
  }
}

let renderer;
let view;
function setup() {

  let matcher = new IsoTownMatcher();
  matcher.addImages(imageLoader.getImages());
  // Create a grid, and use the matched tiles to fill it in.
  view = new IsoMapView(50);
  view.createCanvas();


  let useMinimum = true;
  let allTiles = matcher.processAllTiles();
  let layers = [allTiles];
  collapseFunction = new CollapseFunction(35, 25, view.getMapSize(), layers, useMinimum);
  view.setCenter(createVector(1400, 0));
  view.setSize(0.5);

  // collapseFunction.reset();
  // This is ~2x1 with a little extra height for the tile depth.
  let size = createVector(32, 19);
  // How many tiles to show across/down
  let grid = new Grid(10, 10);
  for (let [i, t] of allTiles.entries()) {
    grid.setTileData(i % grid.getWidth(), Math.floor(i / grid.getWidth()), t);
  }

  renderer = new WFCOverlay(collapseFunction, view, size, grid);
}

function draw() {
  background(127);

  noSmooth();
  renderer.update();
  renderer.draw();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);
  if (view) {
    view.setScreen(windowWidth, windowHeight - 18);
  }
}

function keyPressed() {
  if (view) {
    view.keys();
  }
}

function keyReleased() {
  if (view) {
    view.keys();
  }
}

function mouseWheel(event) {
  if (view) {
    view.scale(event.delta);
  }
}

function mouseMoved() {
  if (renderer) {
    renderer.mouseMove(mouseX, mouseY);
  }
}

function mouseReleased() {
  renderer.click(mouseX, mouseY);
}
