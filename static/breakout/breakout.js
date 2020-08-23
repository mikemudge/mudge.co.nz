var Ball = {
  AVG_SPD: 1.8
}

var BreakoutController = function($routeParams) {
  this.canvas = document.createElement('canvas');
  this.canvas.setAttribute('class', 'canvas');
  document.body.appendChild(this.canvas);
  window.ctrl = this;

  this.scene = new THREE.Scene();
  this.scene.add(new THREE.AmbientLight(0xFFFFFF));
  this.renderer = new THREE.WebGLRenderer({'canvas': this.canvas, antialias: true});
  this.camera = new THREE.PerspectiveCamera( 75, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 1000 );
  this.camera.position.z = 500;

  if ($routeParams.flat) {
    width = this.canvas.clientWidth;
    height = this.canvas.clientHeight;
    this.camera = new THREE.OrthographicCamera( width / - 2, width / 2, height / 2, height / - 2);
  }

  this.keysDown = {};
  document.addEventListener('keydown', angular.bind(this, this.keyDown));
  document.addEventListener('keyup', angular.bind(this, this.keyUp));

  var geometry = new THREE.SphereGeometry(4, 10, 10);
  var material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0x1234DD,
  });
  this.ball = new THREE.Mesh(geometry, material);
  this.scene.add(this.ball);
  this.ball.position.y = -250
  this.ball.position.x = 50
  this.ball.vx = Ball.AVG_SPD;
  this.ball.vy = Ball.AVG_SPD;

  // Highlight the bricks when the ball is near.
  // var light = new THREE.PointLight( 0xffffff, 1, 0 );
  // light.position.set(0, 0, 100);
  // this.ball.add(light);

  var geometry = new THREE.CubeGeometry(2, 2, 2);
  var material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0xDD1234,
  });
  this.paddle = new THREE.Mesh(geometry, material);
  this.paddle.position.y = -300;
  this.paddle.scale.x = 50;
  this.scene.add(this.paddle);

  var geometry = new THREE.CubeGeometry(300, 600, 1);
  var material = new THREE.MeshBasicMaterial({
    color: 0xDD1234,
  });
  var edges = new THREE.EdgesGeometry( geometry );
  var line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: 0xDD1234 } ) );
  this.scene.add( line );
  this.bounds = {
    'top': 300,
    'bottom': -300,
    'left': -150,
    'right': 150
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
    for (x = 0; x < 14; x++) {
      var geometry = new THREE.CubeGeometry(16, 8, 1);
      var material = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        color: 0xDD1234,
      });
      var brick = new THREE.Mesh(geometry, material);

      var edges = new THREE.EdgesGeometry( geometry );
      var line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: 0x770000 } ) );
      brick.add( line );

      this.scene.add(brick);
      this.bricks.push(brick);
      brick.position.set(x * 16 - (14 / 2 * 16) + 8, y * 8, 0);
    }
  }
}

BreakoutController.prototype.update = function() {
  this.ball.position.x += this.ball.vx;
  this.ball.position.y += this.ball.vy;

  if (this.keysDown[ARROWS.LEFT] && this.paddle.position.x > -150 + this.paddle.scale.x * 2 / 2) {
    this.paddle.position.x-=2;
  }
  if (this.keysDown[ARROWS.RIGHT] && this.paddle.position.x < 150 - this.paddle.scale.x * 2 / 2) {
    this.paddle.position.x+=2;
  }

  var brick;
  for (brick of this.bricks) {
    if (!brick.visible) {
      continue;
    }
    if (this.ball.position.x + 4 >= brick.position.x - 8 && this.ball.position.x - 4 < brick.position.x + 8) {
      if (this.ball.position.y + 4 >= brick.position.y - 4&& this.ball.position.y - 4 < brick.position.y + 4) {
        // This brick is hit, so hide it.
        brick.visible = false;
        // TODO Decide which way the ball should bounce.
        if (Math.abs(this.ball.vx) > Math.abs(this.ball.vy)) {
          this.ball.vx *= -1;
        } else {
          this.ball.vy *= -1;
        }
        break;
      }
    }
  }

  if (this.ball.position.x + 4 > this.bounds.right && this.ball.vx > 0) {
    this.ball.vx *= -1;
  }
  if (this.ball.position.y + 4 > this.bounds.top && this.ball.vy > 0) {
    this.ball.vy *= -1;
  }
  if (this.ball.position.x - 4 < this.bounds.left && this.ball.vx < 0) {
    this.ball.vx *= -1;
  }
  // TODO move the paddle with keys or mouse?
  if (this.ball.position.x + 4 > this.paddle.position.x - 25 && this.ball.position.x - 4 < this.paddle.position.x + 25) {
    this.paddle.material.color.setHex(0xFF0000);
  } else {
    this.paddle.material.color.setHex(0x00FF00);
  }

  if (this.ball.position.y - 4 < this.bounds.bottom && this.ball.vy < 0) {
    var dx = (this.paddle.position.x - this.ball.position.x) / this.paddle.scale.x / 4;
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
