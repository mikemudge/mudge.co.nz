
export class DisplayMenu {
  constructor(showMethod) {
    this.showMethod = showMethod;
  }

  show() {
    this.showMethod();
  }

  click(mx, my) {
    // Nothing to do for clicks as this is a display only menu.
  }
}

export class ChatMenu {
  constructor(view) {
    this.view = view;
    this.lines = [];
  }

  addMessage(message) {
    this.lines.push({
      'time': Date.now(),
      'message': message
    });
  }

  show() {
    noStroke();
    fill('white');
    textSize(16);
    textAlign(LEFT);
    let expire = Date.now() - 10000;
    let spliceIdx = 0;
    let y = this.view.getInnerHeight() - this.lines.length * 16 + 10;
    for (let i = 0; i < this.lines.length; i++) {
      text(this.lines[i].message, 5, y + i * 16);
      if (this.lines[i].time < expire) {
        spliceIdx = i + 1;
      }
    }
    // Will auto splice to ensure max 10 lines.
    spliceIdx = Math.max(spliceIdx, this.lines.length - 10);
    this.lines.splice(0, spliceIdx);
  }
}

export class Button {
  constructor(name, action) {
    this.name = name;
    this.action = action;
  }

  show(x, y, size) {
    // For a simple button display a rectangle with text inside it.
    stroke('white')
    noFill();
    rect(x, y, size, size);
    fill('white');
    noStroke();
    textAlign(CENTER);
    text(this.name, x, y + 10, size, size - 20);
  }

  click(name) {
    this.action(name);
  }
}
export class ButtonMenu {
  constructor() {
    this.buttons = [];
    this.subMenu = null;
    this.buttonSize = 60;

    this.backButton = new Button("Back", function() {
      this.subMenu = null;
    }.bind(this));
  }

  addButton(button, clickHandler) {
    this.buttons.push(button);
  }

  addSubMenu(name, buttons) {
    let nestedMenu = new ButtonMenu();
    nestedMenu.addButton(this.backButton);
    for (let button of buttons) {
      nestedMenu.addButton(button);
    }
    this.buttons.push(new Button(name, function() {
      this.subMenu = nestedMenu;
    }.bind(this)));
  }

  show() {
    if (this.subMenu) {
      this.subMenu.show();
      return;
    }
    for (let [i, button] of this.buttons.entries()) {
      button.show(this.buttonSize * i, 0, this.buttonSize);
    }
  }

  click(mx, my) {
    if (this.subMenu) {
      this.subMenu.click(mx, my);
      return;
    }

    let bx = Math.floor(mx / this.buttonSize);
    let by = Math.floor(bx / this.buttonSize);

    if (by > 1) {
      // Not currently supported.
      console.log("Clicked on a second row", by, my, this.buttonSize);
      return;
    }
    if (bx < this.buttons.length) {
      this.buttons[bx].click(this.buttons[bx].name);
    } else {
      console.log("clicked menu on no button", mx, this.buttonSize);
    }
  }

  reset() {
    this.buttons = [];
  }
}

export class MapView {
  constructor(size) {
    // Have an area of the screen which shows the game.
    this.offset = createVector(100, 50);
    this.offsetBottom = 100;

    // The size of a map tile (number of units across a single map tile is).
    this.mapSize = size;

    // This represents the current scale to render everything at.
    this.size = 1;
    this.minSize = 0.25;
    this.maxSize = 10;

    // default to use the whole window.
    this.setScreen(windowWidth, windowHeight);
    this.center = createVector(0, 0);
    this.bottomMenus = [];
    this.topMenu = new ButtonMenu();
    this.overlayMenu = new ChatMenu(this);
  }

  addBottomMenu(menu) {
    this.bottomMenus.push(menu);
  }

  getMapSize() {
    return this.mapSize;
  }

  setScreen(width, height) {
    this.screenWidth = width - 2 * this.offset.x;
    this.screenHeight = height - this.offset.y - this.offsetBottom;

    this.halfScreen = createVector(this.screenWidth / 2, this.screenHeight / 2);
  }

  getCanvasWidth() {
    return this.offset.x * 2 + this.screenWidth;
  }

  getCanvasHeight() {
    return this.offset.y + this.offsetBottom + this.screenHeight;
  }

  createCanvas() {
    return createCanvas(
        this.offset.x * 2 + this.screenWidth,
        this.offset.y + this.offsetBottom + this.screenHeight
    );
  }

  getInnerWidth() {
    return this.screenWidth;
  }

  getInnerHeight() {
    return this.screenHeight;
  }

  getSize() {
    return this.size;
  }

  setSize(size) {
    this.size = size;
  }

  toScreen(pos) {
    return pos.copy().sub(this.center).mult(this.size)
      .add(this.halfScreen).add(this.offset);
  }

  /** map a screen position to its closest grid position. Aligned to map grid */
  toGameGrid(pos) {
    let newpos = this.toGame(pos).div(this.mapSize);
    return createVector(Math.floor(newpos.x), Math.floor(newpos.y))
  }

  toGameSnappedToGrid(pos) {
    let newpos = this.toGame(pos).div(this.mapSize);
    return createVector(Math.floor(newpos.x), Math.floor(newpos.y)).mult(this.mapSize)
  }

  /** map a screen position to its in game location. Not aligned to grid */
  toGame(pos) {
    return pos.copy()
        .sub(this.offset)
        .sub(this.halfScreen)
        .div(this.size)
        .add(this.center);
  }

  setCenter(pos) {
    this.center.set(pos);
  }

  // Center view on the center of a grid.
  setGridCenter(grid) {
    this.setCenter(createVector(grid.getWidth(), grid.getHeight()).mult(this.mapSize / 2));
  }

  translate(vel) {
    this.center.add(vel);
  }

  keys() {
    let vel = createVector(0, 0);
    if (keyIsDown(LEFT_ARROW)) {
      vel.x -= 20 / this.size;
    }
    if (keyIsDown(RIGHT_ARROW)) {
      vel.x += 20 / this.size;
    }
    if (keyIsDown(UP_ARROW)) {
      vel.y -= 20 / this.size;
    }
    if (keyIsDown(DOWN_ARROW)) {
      vel.y += 20 / this.size;
    }
    this.vel = vel;
  }

  // When using view, all mouse interactions should be registered by default?
  // some settings to enable/disable certain interactions can be possible as well?
  // E.g scaling on mouseWheel?
  // clicks (mousePressed, mouseDragged, mouseReleased, mouseClicked etc should all be automatic)

  click() {
    if (mouseY < this.offset.y) {
      this.topMenu.click(mouseX, mouseY);
      return true;
    }
    let my = mouseY - this.screenHeight - this.offset.y;
    if (my > 0) {
      let index = Math.floor(this.bottomMenus.length * mouseX / this.getCanvasWidth());
      let mx = mouseX - (index * this.getCanvasWidth() / this.bottomMenus.length);
      // TODO test with multiple menus?
      this.bottomMenus[index].click(mx, my);
      return true;
    }
    // TODO otherwise click on the game?
  }

  scale(amount) {
    let mouseGamePos = this.toGame(createVector(mouseX, mouseY));
    // Still scale the same amount
    let preSize = this.size;

    // Reverse direction for zoom.
    amount *= -1;
    // how to interpret the amount?
    // It can get largish for fast scrolling, based on my simple testing. -100, 100
    // But its also small for slow scrolling -2, 2.

    // Scale based on amount (which contains a direction -/+).
    // Using a max/min to avoid the amount being too little/slow.
    if (amount > 0) {
      amount = Math.max(1, amount / 40)
    } else {
      amount = Math.min(-1, amount / 40);
    }
    // Also based on the current size, so we scale quicker when larger.
    this.size += amount * (this.size / 50);

    // Limit scaling to some sensible min/max
    this.size = Math.max(this.minSize, this.size);
    this.size = Math.min(this.maxSize, this.size);

    // TODO controversial zooming?
    if (preSize < this.size) {
      // Focus on mouse when zooming in.
      // We want mouseGamePos to remain under the mouse.
      let mouseGamePos2 = this.toGame(createVector(mouseX, mouseY));
      this.center.add(mouseGamePos.sub(mouseGamePos2));
    }
  }

  update() {
    this.center.add(this.vel);
  }

  showHighlight(size) {
    rect(0, 0, size, size);
  }

  show(thing) {
    this.showInternal(thing.pos.copy(), thing.show.bind(thing), this.size);
  }

  showAtGridLoc(loc, method) {
    // A grid location needs to be scaled up by mapSize.
    this.showInternal(createVector(loc.x, loc.y).mult(this.mapSize), method, this.size * this.mapSize);
  }

  showAtPos(thing, pos) {
    this.showInternal(pos.copy(), thing.show.bind(thing), this.size);
  }

  showMethodAtPos(method, pos) {
    this.showInternal(pos.copy(), method, this.size);
  }

  showInternal(pos, method, size) {
    let screenLoc = this.toScreen(pos.copy());
    push();
    translate(screenLoc.x, screenLoc.y);
    method(size);
    pop();
  }

  drawMap(map) {
    this.drawMapWith(map, function(sq, size) {
      sq.show(size);
    });
  }

  draw(map) {
    this.drawMap(map);
  }

  drawMapWith(map, renderFunc) {
    // This is the number of map tiles required to draw in each direction.
    let halfMapTileHeight = (this.halfScreen.y / this.size);
    let halfMapTileWidth = (this.halfScreen.x / this.size);

    let top = Math.round((this.center.y - halfMapTileHeight) / this.mapSize);
    let left = Math.round((this.center.x - halfMapTileWidth) / this.mapSize);

    let bottom = Math.round((this.center.y + halfMapTileHeight) / this.mapSize) + 1;
    let right = Math.round((this.center.x + halfMapTileWidth) / this.mapSize) + 1;

    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let square = map.getTile(x, y).getData();
        if (!square) {
          continue;
        }
        let pos = this.toScreen(createVector(x, y).mult(this.mapSize));
        push();
        translate(pos);
        renderFunc(square, this.mapSize * this.size);
        pop();
      }
    }
  }

  coverEdges(debug) {
    if (debug) {
      noFill();
      stroke("#333333");
    } else {
      fill("#333333");
      noStroke();
    }
    rect(0, 0, this.offset.x, this.getCanvasHeight());
    rect(0, 0, this.getCanvasWidth(), this.offset.y);
    rect(this.screenWidth + this.offset.x, 0, this.offset.x, this.getCanvasHeight());
    rect(0, this.screenHeight + this.offset.y, this.getCanvasWidth(), this.offsetBottom);

    // After covering up the map, draw the menus overtop.
    this.topMenu.show();

    push()
    translate(this.offset);
    this.overlayMenu.show();
    pop();

    for (let i = 0; i < this.bottomMenus.length; i++) {
      let x = (i * this.getCanvasWidth() / this.bottomMenus.length);
      push()
      translate(x, this.screenHeight + this.offset.y);
      this.bottomMenus[i].show();
      pop();
    }
  }
}

export class IsoMapView extends MapView {
  constructor(size) {
    super(size);
  }

  // convert to iso space
  toScreen(pos) {
    let x2 = (pos.y + pos.x);
    // we use half because ISO is 30deg, and sin(30deg) is 0.5.
    let y2 = (pos.y - pos.x)/ 2;
    return createVector(x2, y2).sub(this.center).mult(this.size)
        .add(this.halfScreen).add(this.offset);
  }

  // Pos is in screen space (E.g mouse pointer), and we want the grid space.
  // Opposite of toScreen
  /** map a screen position to its in game location. Not aligned to grid */
  toGame(pos) {
    let tmp = pos.copy()
        .sub(this.offset)
        .sub(this.halfScreen)
        .div(this.size)
        .add(this.center);
    tmp.set(tmp.x / 2 - tmp.y, tmp.y + tmp.x / 2);
    return tmp;
  }

  showHighlight(size) {
    beginShape()
    vertex(0, 0);
    vertex(size, -size / 2);
    vertex(size * 2, 0);
    vertex(size, size / 2);
    endShape(CLOSE);
  }

  drawMapWith(map, renderFunc) {
    let top = 0;
    let left = 0;
    let bottom = map.getHeight();
    let right = map.getWidth();
    // TODO ISO will have different requirements for how much do we render?
    // Y in iso perspective is 0 at the top left, and higher at bottom right.
    // X in iso perspective is 0 at the bottom left and positive at top right.
    // This means that the screen Y increases with y but decreases with x.
    for (let y = top; y < bottom; y++) {
      for (let x = right - 1; x >= left; x--) {
        let square = map.getTile(x, y).getData();
        if (!square) {
          continue;
        }
        push();
        let screenLoc = this.toScreen(createVector(x, y).mult(this.mapSize));
        translate(screenLoc.x, screenLoc.y);
        renderFunc(square, this.mapSize * this.size);
        pop();
      }
    }
  }
}
