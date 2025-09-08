// Represents a single frontend app.
class App {
  constructor(path, name, query) {
    this.path = path;
    this.name = name;
    this.query = query;
    this.version = 0;
  }

  async loadMain() {
    // Replace the base url with the path to static files.
    let path = this.path.replace("/games/", "/static/");

    const app = await import(path + '.js?v=' + this.version);
    // Expose these so that the p5 library can call them.
    // TODO find a nicer way to do this.
    globalThis.setup = app.setup;
    globalThis.draw = app.draw;
    globalThis.preload = app.preload;
    globalThis.windowResized = app.windowResized;
    globalThis.keyPressed = app.keyPressed;
    globalThis.keyReleased = app.keyReleased;
    globalThis.touchStarted = app.touchStarted;
    globalThis.touchMoved = app.touchMoved;
    globalThis.touchEnded = app.touchEnded;

    globalThis.doubleClicked = app.doubleClicked;
    globalThis.mousePressed = app.mousePressed;
    globalThis.mouseMoved = app.mouseMoved;
    globalThis.mouseDragged = app.mouseDragged;
    globalThis.mouseReleased = app.mouseReleased;
    globalThis.mouseWheel= app.mouseWheel;
    globalThis.mouseClicked = app.mouseClicked;

    // Automatically load p5 for files within the p5 or p5_test folder.
    let parts = this.path.split("/");
    if (parts[2] === 'p5' || parts[2] === 'p5_test') {
      if (this.query.get("offline")) {
        // Can use a local version of p5 for offline development?
        this.loadScript('/static/p5/p5.min.js');
      } else {
        // TODO support version control for this?
        this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.5/p5.min.js');
      }
    }
  }

  loadTags(tags) {
    for (let key of tags) {
      for (let script of SCRIPTS[key]) {
        this.loadScript(script);
      }
    }
  }

  loadScript(src) {
    let script = document.createElement('script');
    script.src = src;
    script.type = 'module';
    script.onload = function() {
      console.log(src + ' loaded successfully!');
    };
    script.onerror = function() {
      console.error('Error loading ' + src);
    };
    document.head.appendChild(script);
  }
}

class AppInit {

  constructor(windowLocation) {
    this.path = windowLocation.pathname;
    this.query = new URLSearchParams(windowLocation.search);
    this.local = windowLocation.hash;
  }

  loadApp() {
    console.log("Loading app for " + this.path);

    // Always starts with a /games/
    let parts = this.path.split("/");
    if (parts[1] !== 'games') {
      console.log("Unknown base url", parts[1]);
      return;
    }

    let name = parts[parts.length - 1];
    this.app = new App(this.path, name, this.query);
    // Support overriding some config here?
    this.app.loadMain();
  }
}

let init = new AppInit(window.location);
// Init the app in the window for global access.
window.mudgemi = window.mudgemi || {};
window.mudgemi.init = init;
init.loadApp();