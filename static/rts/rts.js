var MainController = function($scope) {
  this.$scope = $scope;
  var canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('No #canvas found');
    return;
  }

  window.ctrl = this;
  this.renderer = new THREE.WebGLRenderer({'canvas': canvas, antialias: true});
  this.renderer.setSize( window.innerWidth, window.innerHeight );

  this.scene = new THREE.Scene();

  var ambient = new THREE.AmbientLight( 0xFFFFFF );
  this.scene.add( ambient );

  this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  this.camera.position.z = 80;
  this.camera.position.y = 80;
  // This is 45 degrees down onto the map.
  this.camera.rotation.x = -Math.PI / 4;

  var gridHelper = new THREE.GridHelper(100, 1);
  this.scene.add(gridHelper);

  this.raycaster = new THREE.Raycaster();
  this.mouse = new THREE.Vector2();

  this.game = new Game(this.scene);

  this.keyControls = new KeyControls({
    // WASD
    left: 65,
    up: 87,
    right: 68,
    down: 83
  });

  this.controls = new THREE.OrbitControls(this.camera);
  // this.controls = new THREE.OrbitControls(this.camera, canvas);
  // this.controls.maxDistance = 3;

  window.addEventListener('resize', angular.bind(this, this.resize));
  this.resize();

  window.addEventListener('blur', function() {
    this.pause = true;
    this.$scope.$apply();
  }.bind(this), false);

  this.start();
}

MainController.prototype.start = function() {
  // game.start???
  this.pause = false;
  var render = function() {
    if (this.pause) {
      return;
    }
    requestAnimationFrame(render);
    this.render();
  }.bind(this);
  render();
}

MainController.prototype.resize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize( window.innerWidth, window.innerHeight );
}

MainController.prototype.render = function(time) {
  this.game.update(time);

  if (this.controls) {
    this.controls.update(time);
  }

  this.renderer.render(this.scene, this.camera);
}

window.mmRts = {
  units: {}
}
// TODO enable brunch on this an ar???
// require('../threejs/OrbitControls')
// require('./rts.tpl.html')
// require('./game.js')
// require('./units.js')

// require('./device_orientation.js')

angular.module('rts', [
	'config',
	'ngRoute',
  'orientation',
  'rts/rts.tpl.html',
])
.controller('MainController', MainController)
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('rts', {
    controller: 'MainController',
    controllerAs: 'ctrl',
    templateUrl: 'rts/rts.tpl.html'
  })
})
