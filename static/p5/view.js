
class DisplayMenu {
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

class ChatMenu {
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

class ButtonMenu {
  constructor() {
    this.buttons = [];
    this.subMenu = null;
    this.buttonSize = 60;
  }

  show() {
    // TODO can we handle submenus better?
    if (this.subMenu) {
      this.subMenu.show();
    } else {
      stroke('white')
      noFill();
      this.buttons.forEach(function(button, i) {
        rect(this.buttonSize * i, 0, this.buttonSize, this.buttonSize);
      }, this);
      fill('white');
      textAlign(CENTER);
      noStroke();
      this.buttons.forEach(function(button, i) {
        text(button.name, this.buttonSize * i, 10, this.buttonSize, this.buttonSize - 20);
      }, this);
    }
  }

  click(mx, my) {
    if (this.subMenu) {
      this.subMenu.click(mx, my);
      return;
    }

    if (my > this.buttonSize) {
      console.log("my > buttonSize", my, this.buttonSize);
      // Didn't click the button?
      return;
    }
    let buttonIdx = Math.floor(mx / this.buttonSize);
    let button = this.buttons[buttonIdx];
    if (button) {
      button.click(button.name);
    } else {
      console.log("clicked menu on no button");
    }
  }

  registerSubMenu(name) {
    let subMenu = new ButtonMenu();
    this.addButton(name, function() {
      this.subMenu = subMenu;
    }.bind(this));
    return subMenu;
  }

  reset() {
    this.buttons = [];
  }
f
  addButton(name, clickHandler) {
    this.buttons.push({
      'name': name,
      'click': clickHandler
    });
  }
}

class MapView {
  constructor(size) {
    // Have an area of the screen which shows the game.
    this.offsetLeft = 100;
    this.offsetTop = 50;
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
    this.screenWidth = width - 2 * this.offsetLeft;
    this.screenHeight = height - this.offsetTop - this.offsetBottom;

    this.halfScreen = createVector(this.screenWidth / 2, this.screenHeight / 2);
  }

  getCanvasWidth() {
    return this.offsetLeft * 2 + this.screenWidth;
  }

  getCanvasHeight() {
    return this.offsetTop + this.offsetBottom + this.screenHeight;
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

  toScreen(pos) {
    return pos.copy().sub(this.center).mult(this.size)
      .add(this.halfScreen).add(this.offsetLeft, this.offsetTop);
  }

  toScreenX(x) {
    // Take the difference from the current map center scaled by the size.
    let mapping = (x - this.center.x) * this.size;
    return this.offsetLeft + this.halfScreen.x + mapping;
  }

  toScreenY(y) {
    // Take the difference from the current map center scaled by the size.
    let mapping = (y - this.center.y) * this.size;
    // Then locate that from the center of the screen.
    return this.offsetTop + this.halfScreen.y + mapping;
  }

  /** map a screen position to its closest grid position. Aligned to map grid */
  toGameGrid(pos) {
    return createVector(
        Math.round(this.toGameX(pos.x) / this.mapSize) * this.mapSize,
        Math.round(this.toGameY(pos.y) / this.mapSize) * this.mapSize)
  }
  toGameGridFloor(pos) {
    return createVector(
        Math.floor(this.toGameX(pos.x) / this.mapSize) * this.mapSize,
        Math.floor(this.toGameY(pos.y) / this.mapSize) * this.mapSize)
  }

  /** map a screen position to its in game location. Not aligned to grid */
  toGame(pos) {
    // TODO can this use vector math instead?
    return createVector(this.toGameX(pos.x), this.toGameY(pos.y));
  }

  toGameX(x) {
    return (x - this.offsetLeft - this.halfScreen.x) / this.size + this.center.x;
  }

  toGameY(y) {
    return (y - this.offsetTop - this.halfScreen.y) / this.size + this.center.y;
  }

  setCenter(pos) {
    this.center.set(pos);
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

  click() {
    if (mouseY < this.offsetTop) {
      this.topMenu.click(mouseX, mouseY);
      return true;
    }
    let my = mouseY - this.screenHeight - this.offsetTop;
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
    let x2 = this.toGameX(mouseX);
    let y2 = this.toGameY(mouseY);
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
    let influence = 1;
    if (preSize > this.size) {
      // Focus on center when zooming out.
      influence = 0;
    }
    x2 = (x2 - this.center.x) * influence + this.center.x;
    y2 = (y2 - this.center.y) * influence + this.center.y;

    // We want x2, y2 to be in the same location.
    // Need distance from center to x2, y2 to get scaled.
    this.center.sub(x2, y2).mult(preSize / this.size).add(x2, y2);
    // let off = createVector(x2, y2).sub(this.center).mult( -preSize / this.size);
    // this.center.add(off);
  }

  update() {
    // TODO should vel be scaled by size?
    // Otherwise we move fast when zoomed in, and slow when zoomed out.
    this.center.add(this.vel);
  }

  show(thing) {
    this.showAtPos(thing, thing.pos);
  }

  showAtGridLoc(loc, method) {
    push();
    let x = this.toScreenX(loc.x * this.mapSize);
    let y = this.toScreenY(loc.y * this.mapSize);
    translate(x, y);
    method(this.mapSize * this.size / 2);
    pop();
  }

  showAtPos(thing, pos) {
    push();
    let x = this.toScreenX(pos.x);
    let y = this.toScreenY(pos.y);
    translate(x, y);
    thing.show(this.mapSize * this.size / 2);
    pop();
  }

  draw(map) {
    this.drawMap(map);
  }

  drawMap(map) {
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
        push();
        translate(this.toScreenX(x * this.mapSize), this.toScreenY(y * this.mapSize));
        square.show(this.mapSize * this.size / 2);
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
    rect(0, 0, this.offsetLeft, this.getCanvasHeight());
    rect(0, 0, this.getCanvasWidth(), this.offsetTop);
    rect(this.screenWidth + this.offsetLeft, 0, this.offsetLeft, this.getCanvasHeight());
    rect(0, this.screenHeight + this.offsetTop, this.getCanvasWidth(), this.offsetBottom);

    // After covering up the map, draw the menus overtop.
    this.topMenu.show();

    push()
    translate(this.offsetLeft, this.offsetTop);
    this.overlayMenu.show();
    pop();

    for (let i = 0; i < this.bottomMenus.length; i++) {
      let x = (i * this.getCanvasWidth() / this.bottomMenus.length);
      push()
      translate(x, this.screenHeight + this.offsetTop);
      this.bottomMenus[i].show();
      pop();
    }
  }
}
