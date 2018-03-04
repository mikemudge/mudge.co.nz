var OrientationController = function($scope) {
  this.$scope = $scope;
  var canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('No #canvas found');
    return;
  }

  window.ctrl = this;
  this.renderer = new THREE.WebGLRenderer({'canvas': canvas, antialias: true});
  this.renderer.setSize( window.innerWidth, window.innerHeight );

  this.renderer.setClearColor(0x000000);
  this.scene = new THREE.Scene();

  var ambient = new THREE.AmbientLight( 0xFFFFFF );
  this.scene.add( ambient );

  this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  this.camera.position.z = 80;
  this.camera.position.y = 80;
  // This is 45 degrees down onto the map.
  this.camera.rotation.x = -Math.PI / 4;

  var gridHelper = new THREE.GridHelper(100, 10);
  this.scene.add(gridHelper);

  var mesh = new THREE.CubeGeometry( 20, 20, 20 );
  var material = new THREE.MeshNormalMaterial();
  this.cube = new THREE.Mesh(mesh, material);
  this.cube.position.y = 15;

  this.scene.add(this.cube);

  this.raycaster = new THREE.Raycaster();
  this.mouse = new THREE.Vector2();

  this.keyControls = new KeyControls({
    // WASD
    left: 65,
    up: 87,
    right: 68,
    down: 83
  });

  if (window.orientation !== undefined) {
    // TODO better integration between these
    this.device_controls = new THREE.DeviceOrientationControls(this.camera, this.cube.position);
  } else {
    this.controls = new THREE.OrbitControls(this.camera, canvas);
  }

  window.addEventListener('resize', angular.bind(this, this.resize));
  this.resize();

  window.addEventListener('blur', function() {
    this.pause = true;
    this.$scope.$apply();
  }.bind(this), false);

  this.start();
}

OrientationController.prototype.start = function() {
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

OrientationController.prototype.resize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize( window.innerWidth, window.innerHeight );
}

OrientationController.prototype.render = function(time) {
  if (this.controls) {
    this.controls.update(time);
  }

  this.renderer.render(this.scene, this.camera);
}

require('../threejs/device_orientation_controls.js')

angular.module('orientation', [
	'config',
	'ngRoute',
  'rts/rts.tpl.html',
])
.controller('OrientationController', OrientationController)
.config(function($locationProvider, $routeProvider) {
  $routeProvider.when('/orientation', {
    controller: 'OrientationController',
    controllerAs: 'ctrl',
    templateUrl: 'rts/rts.tpl.html'
  })
})
