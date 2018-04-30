var Ball = {
  AVG_SPD: 0.8
}

var BreakoutController = function() {
  this.canvas = document.createElement('canvas');
  this.canvas.setAttribute('class', 'canvas');
  document.body.appendChild(this.canvas);
  window.ctrl = this;

  this.scene = new THREE.Scene();
  this.scene.add(new THREE.AmbientLight(0xFFFFFF));
  this.renderer = new THREE.WebGLRenderer({'canvas': this.canvas, antialias: true});
  this.camera = new THREE.PerspectiveCamera( 75, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 1000 );
  this.camera.position.z = 80;

  this.keysDown = {};
  document.addEventListener('keydown', angular.bind(this, this.keyDown));
  document.addEventListener('keyup', angular.bind(this, this.keyUp));

  var geometry = new THREE.SphereGeometry(1, 10, 10);
  var material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0x1234DD,
    wireframe: true,
  });
  this.ball = new THREE.Mesh(geometry, material);
  this.scene.add(this.ball);
  this.ball.vx = Ball.AVG_SPD;
  this.ball.vy = Ball.AVG_SPD;

  var geometry = new THREE.CubeGeometry(1, 1, 1);
  var material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0xDD1234,
    wireframe: true,
  });
  this.paddle = new THREE.Mesh(geometry, material);
  this.paddle.position.y = -50;
  this.paddle.scale.x = 25;
  this.scene.add(this.paddle);

  var geometry = new THREE.CubeGeometry(50, 100, 1);
  var material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0xDD1234,
    wireframe: true,
  });
  this.scene.add(new THREE.Mesh(geometry, material))
  this.bounds = {
    'top': 50,
    'bottom': -50,
    'left': -25,
    'right': 25
  }
  this.bricks = [];
  this.addBricks();

  window.addEventListener('resize', angular.bind(this, this.resize));
  this.resize();

  var render = angular.bind(this, function() {
    requestAnimationFrame(render);
    this.render();
  });
  render();
}
var ARROWS = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40
}

BreakoutController.prototype.keyDown = function($event) {
  this.keysDown[$event.keyCode] = 1;
}

BreakoutController.prototype.keyUp = function($event) {
  this.keysDown[$event.keyCode] = 0;
}

BreakoutController.prototype.addBricks = function() {
  var x, y;
  for (y = 0; y < 5; y++) {
    for (x = 0; x < 5; x++) {
      var geometry = new THREE.CubeGeometry(4, 2, 1);
      var material = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        color: 0xDD1234,
        wireframe: true,
      });
      var brick = new THREE.Mesh(geometry, material);
      this.scene.add(brick);
      this.bricks.push(brick);
      brick.position.set(x * 4 - 6, y * 2, 0);
    }
  }
}

BreakoutController.prototype.update = function() {
  this.ball.position.x += this.ball.vx;
  this.ball.position.y += this.ball.vy;

  if (this.keysDown[ARROWS.LEFT] && this.paddle.position.x > -25 + this.paddle.scale.x / 2) {
    this.paddle.position.x--;
  }
  if (this.keysDown[ARROWS.RIGHT] && this.paddle.position.x < 25 - this.paddle.scale.x / 2) {
    this.paddle.position.x++;
  }

  var brick;
  for (brick of this.bricks) {
    if (this.ball.position.x > brick.position.x - 1 && this.ball.position.x <= brick.position.x + 5) {
      if (this.ball.position.y > brick.position.y - 1 && this.ball.position.y <= brick.position.y + 3) {
        if (brick.visible) {
          // TODO Decide which way the ball should bounce.
          brick.visible = false;
          this.ball.vx *= -1;
          this.ball.vy *= -1;
        }
      }
    }
  }

  if (this.ball.position.x > this.bounds.right && this.ball.vx > 0) {
    this.ball.vx *= -1;
  }
  if (this.ball.position.y > this.bounds.top && this.ball.vy > 0) {
    this.ball.vy *= -1;
  }
  if (this.ball.position.x < this.bounds.left && this.ball.vx < 0) {
    this.ball.vx *= -1;
  }
  // TODO move the paddle with keys or mouse?
  if (this.paddle.position.x > this.ball.position.x - (25 + 1) / 2 && this.paddle.position.x <= this.ball.position.x + (25 + 1) / 2) {
    this.paddle.material.color.setHex(0xFF0000);
  } else {
    this.paddle.material.color.setHex(0x00FF00);
  }
  if (this.ball.position.y < this.bounds.bottom && this.ball.vy < 0) {
    var dx = (this.paddle.position.x - this.ball.position.x) / this.paddle.scale.x;
    // -0.5 < dx < 0.5
    // set the speed based on where it hits + 50% of its previous momentum.
    this.ball.vx = dx * -Ball.AVG_SPD + 0.5 * this.ball.vx; // -.1 < .1
    this.ball.vy *= -1;
  }
}

BreakoutController.prototype.resize = function() {
  this.width = this.canvas.clientWidth;
  this.height = this.canvas.clientHeight;
  this.camera.aspect = this.width / this.height;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize(this.width, this.height, false);
}

BreakoutController.prototype.render = function(time) {
  this.update();

  this.renderer.render(this.scene, this.camera);
}

angular.module('breakout', [
  'config',
  'ngRoute'
])
.controller('BreakoutController', BreakoutController)
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    template: '<div></div>',
    controller: 'BreakoutController'
  })
})
;
