// Loads all required files for a frontend application.

const SCRIPTS = {
  'threejs': [
    '/static/js/three.js/84/three.min.js',
    '/static/js/three.js/OrbitControls.js'
  ],
  'jquery': [
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
  ],
  'api': [
    '/static/shared/api.js',
  ],
  'login': [
    '/static/shared/login.js'
  ],
  'p5': [
    'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.1/p5.min.js',
  ],
  'p5_local': [
    '/static/p5/p5.min.js',
  ],
  'gridview': [
    "/static/p5/lib/grid.js",
    "/static/p5/lib/view.js"
  ],
  'wfc': [
    "/static/p5/wfc/tile.js",
    "/static/p5/wfc/tileset.js",
    "/static/p5/wfc/collapse.js",
    "/static/p5/wfc/overlay.js",
    "/static/p5/wfc/renders.js",
  ],
  'rts': [
    '/static/p5/rts/map.js',
    '/static/p5/rts/units.js',
    '/static/p5/rts/buildings.js',
    '/static/p5/rts/actions.js',
  ],
}

const STYLES = {
  'font-awesome': [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css'
  ],
  'common': [
    'https://fonts.googleapis.com/css?family=Roboto',
    '/static/shared/common.css',
  ],
  'style1': [
    '/static/shared/theme1.css',
  ]
}

// Represents a single frontend app.
class App {
  constructor(path, name) {
    this.path = path;
    this.name = name;
    // TODO support debug mode?
    this.version = 0;
  }

  loadMain() {
    // Replace the base url with the path to static files.
    let path = this.path.replace("/games/", "/static/");

    let parts = this.path.split("/");
    if (parts.length === 3) {
      // If the path is a single name like 3dprint, then load from a folder.
      // E.g /static/3dprint/3dprint.js
      this.loadScript(path + '/' + this.name + '.js?v=' + this.version)
    } else {

      if (parts[2] === 'p5' || parts[2] === 'p5_test') {
        this.loadTags(['p5']);
      }
      this.loadScript(path + '.js?v=' + this.version);
    }
  }

  loadTags(tags) {
    for (let key of tags) {
      for (let script of SCRIPTS[key]) {
        this.loadScript(script);
      }
    }
  }

  loadStyleTags(tags) {
    if (tags.contains('font-awesome')) {
      this.loadStyle('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css');
    }
    if (tags.contains('common')) {
      this.loadStyle('https://fonts.googleapis.com/css?family=Roboto');
      this.loadStyle('/static/shared/common.css');
    }
  }

  loadAngular() {
    this.loadScript("/static/js/angular/angular.js");
    this.loadScript("/static/js/angular/angular-cookies.js");
    this.loadScript("/static/js/angular/angular-resource.min.js");
    this.loadScript("/static/js/angular/angular-route.min.js");
    this.loadScript("/static/js/angular/angular-sanitize.js");
  }

  loadScript(src) {
    let script = document.createElement('script');
    script.src = src;
    script.onload = function() {
      console.log(src + ' loaded successfully!');
    };
    script.onerror = function() {
      console.error('Error loading ' + src);
    };
    document.head.appendChild(script);
  }

  loadStyle(href) {
    var link = document.createElement('link');
    link.href = href;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.onload = function() {
      console.log('CSS file loaded successfully!');
    };
    link.onerror = function() {
      console.error('Error loading CSS file.');
    };
    document.head.appendChild(link);
  }
}

class AppInit {
  // Map tags to a sets of scripts

  constructor(windowLocation) {
    this.path = windowLocation.pathname;
    this.query = windowLocation.search;
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
    if (parts.length === 3 && name === '') {
      // This is the "list" page, show all the projects?
      // TODO is this something the backend should do, with images?
      console.log("TODO Show all projects");
      return;
    }
    this.app = new App(this.path, name);
    // Support overriding some config here?
    this.app.loadMain();
  }
}

let init = new AppInit(window.location);
// Init the app in the window for global access.
window.mudgemi = window.mudgemi || {};
window.mudgemi.init = init;
init.loadApp();