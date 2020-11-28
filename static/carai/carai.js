
var MainController = function() {
  var canvas = document.getElementById('canvas');

  this.renderer = new THREE.WebGLRenderer({'canvas': canvas, antialias: true});
  this.renderer.setSize( window.innerWidth, window.innerHeight );

  this.scene = new THREE.Scene();

  var ambient = new THREE.AmbientLight( 0xFFFFFF );
  this.scene.add( ambient );

  // this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  var width = window.innerWidth;
  var height = window.innerHeight;
  this.camera = new THREE.OrthographicCamera( width / - 2, width / 2, height / 2, height / - 2);
  this.camera.position.y = 300;

  this.raycaster = new THREE.Raycaster();


  // Init the camera to look at the cube. Makes x,y look like the screen pixels.
  this.camera.lookAt(new THREE.Vector3(0, 0, 0));

  this.scene.add(this.loadTrack());


  var mesh = new THREE.CubeGeometry( 10, 1, 20 );
  var material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0xff0000
  });
  var selectedMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0x00ff00
  });

  this.updatables = [];

  for (i = 0; i < 2; i++) {
    var cube;
    if (i == 0) {
      cube = new THREE.Mesh(mesh, selectedMaterial);
      this.cube = cube;
    } else {
      cube = new THREE.Mesh(mesh, material);
    }

    this.scene.add(cube);
    cube.position.set(10, 0, 70);
    cube.scale.set(2,2,2);

    // Make an AI control for the cube object.
    this.updatables.push(new AIControls(cube))
  }

  this.updatables[0].verbose = true;
  // Test run of the selected car NN
  this.nn = this.updatables[0].nn;
  this.nn.verbose = true;

  // First feature
  // bias is 3rd "input".
  this.nn.weights1[3][0] = -50;
  // 0 is the input for left distance.
  this.nn.weights1[0][0] = 100;

  // Sencond feature
  // bias is 3rd "input".
  this.nn.weights1[3][1] = -50;
  // 2 is the input for right distance.
  this.nn.weights1[2][1] = 100;

  // This just says turn left when feature 1 is on, right when feature 2 is on.
  this.nn.weights2[5][0] = -5;
  this.nn.weights2[5][1] = -5;

  this.nn.weights2[0][0] = 10;
  this.nn.weights2[1][1] = 10;

  var result;

  result = this.nn.play([0,0,5]);
  console.log(this.nn.normalInputs, this.nn.hiddens, result);
  result = this.nn.play([0,5,0]);
  console.log(this.nn.normalInputs, this.nn.hiddens, result);
  result = this.nn.play([5,0,0]);
  console.log(this.nn.normalInputs, this.nn.hiddens, result);

  // this.updatables = [];
  window.addEventListener('resize', angular.bind(this, this.resize));

  window.addEventListener('blur', function() {
    // This will prevent updates from happening if you lose focus.
    // Good for CPU usage during development.
    console.log("pause");
    this.pause = true;
  }.bind(this), false);

  window.addEventListener('focus', function() {
    console.log("unpause");
    this.pause = false;
    this.start();
  }.bind(this), false);
  this.start();
}

MainController.prototype.loadTrack = function() {
  var geometry = new THREE.PlaneGeometry(1024, 1024, 100, 100);
  var texture = new THREE.TextureLoader().load("/static/img/Track.jpg?v=1" );
  var material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });
  var plane = new THREE.Mesh(geometry, material);
  plane.scale.set(0.5, 0.5, 0.5);
  plane.rotation.x = Math.PI * 0.50;
  plane.position.y = -1;
  // plane.rotation.z = Math.PI * 0.50;
  return plane;
}


MainController.prototype.start = function() {
  var render = function() {
    if (this.pause) {
      return;
    }
    requestAnimationFrame(render);
    this.render();
  }.bind(this);
  render();
};

MainController.prototype.resize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize( window.innerWidth, window.innerHeight );
}

MainController.prototype.render = function(time) {

  this.updatables.forEach(function(x) {
    x.update(time);
  });

  this.renderer.render(this.scene, this.camera);
}

var NN = function(ins, hiddens, outs) {
  this.weights1 = [];
  for (var i = 0; i < ins + 1; i++) {
    this.weights1.push([]);
    for (var h = 0; h < hiddens; h++) {
      this.weights1[i].push(Math.random() - 0.5);
    }
  }
  this.weights2 = [];
  for (var h = 0; h < hiddens + 1; h++) {
    this.weights2.push([]);
    for (var o = 0; o < outs; o++) {
      this.weights2[h].push(10 * Math.random() - 5);
    }
  }
}

NN.prototype.sigmoid = function(x) {
  return 1 / (1 + Math.exp(-x));
}

NN.prototype.play = function(inputs) {

  this.normalInputs = [0, 0, 0];
  for (var i = 0; i < inputs.length; i++) {
    this.normalInputs[i] = this.sigmoid(inputs[i]);
  }

  if (this.verbose) { 
    console.log("ins", this.normalInputs);
  }
  this.hiddens = [];
  // TODO bias?
  for (var h = 0; h < this.weights1[inputs.length].length; h++) {
    var sum = this.weights1[inputs.length][h];
    for (var i = 0; i < inputs.length; i++) {
      sum += this.weights1[i][h] * this.normalInputs[i];
    }
    this.hiddens.push(this.sigmoid(sum));
  }
  if (this.verbose) { 
    console.log("hiddens", this.hiddens);
  }

  var result = [0, 0];
  // TODO bias
  for (var o = 0; o < result.length; o++) {
    result[o] = this.weights2[this.hiddens.length][o];
    for (var h = 0; h < this.hiddens.length; h++) {
      result[o] += this.weights2[h][o] * this.hiddens[h];
    }
    result[o] = this.sigmoid(result[o]);
  }

  if (this.verbose) { 
    console.log("result", result);
  }

  return result;
}

var AIControls = function(mesh) {
  this.mesh = mesh;
  this.speed = 0.9;
  this.theta = 0;

  // Create a line for the radar.
  var material = new THREE.LineBasicMaterial( { color: 0x0000ff } );
  var geometry = new THREE.Geometry();

  geometry.vertices.push(
    new THREE.Vector3( 0,  0, 0 ),
    (new THREE.Vector3( -50, 50, 0 )).normalize().multiplyScalar(50),
    new THREE.Vector3( 0,  0, 0 ),
    new THREE.Vector3( 0, 50, 0 ),
    new THREE.Vector3( 0,  0, 0 ),
    (new THREE.Vector3( 50, 50, 0 )).normalize().multiplyScalar(50)
  );
  var line = new THREE.Line( geometry, material );

  // Load the track image for collision detection
  // TODO share one of these for all AI Controls.
  var img = new Image();
  img.src = '/static/img/Track.jpg?v=1';
  img.onload = function() {
    // create a canvas to manipulate the image
    var canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);

    // get the pixel data
    this.pixelData = canvas.getContext('2d');
  }.bind(this);

  // Add a line showing the ray cast.
  this.mesh.add(line);

  this.nn = new NN(3, 5, 2);

  this.crashed = false;

  this.keyControls = new KeyControls({
    // WASD
    left: 65,
    up: 87,
    right: 68,
    down: 83
  });
};

AIControls.prototype.update = function(time) {
  // var scene = this.mesh.parent;

  if (!this.pixelData) {
    return;
  }

  if (this.crashed) {
    return;
  }

  var loc = this.mesh.position;

  // px, pz is the pixel on the track image where the car currently is.
  var px = Math.round(512 + this.mesh.position.x * 2);
  var pz = Math.round(512 - this.mesh.position.z * 2);

  // This is the pixel color for that location px, pz.
  pixel = this.pixelData.getImageData(px, pz, 1, 1).data;
  pixel = [pixel[0], pixel[1], pixel[2]];
  if (pixel[0] > 192) {
    this.crashed = true;
  }

  var inputs = [200, 200, 200];
  for (var d = 1; d < 200; d+=5) {
    x = px + d * Math.sin(this.mesh.rotation.y - 0.75);
    z = pz - d * Math.cos(this.mesh.rotation.y - 0.75);  
    var imageData = this.pixelData.getImageData(x, z, 1, 1).data
    if (imageData[0] > 192) {
      inputs[0] = d / 20;
      break;
    }
  }

  // Angle change
  for (var d = 1; d < 200; d+=5) {
    x = px + d * Math.sin(this.mesh.rotation.y);
    z = pz - d * Math.cos(this.mesh.rotation.y);
    var imageData = this.pixelData.getImageData(x, z, 1, 1).data
    if (imageData[0] > 192) {
      inputs[1] = d / 20;
      break;
    }
  }

  // Angle change
  for (var d = 1; d < 200; d+=5) {
    x = px + d * Math.sin(this.mesh.rotation.y + 0.75);
    z = pz - d * Math.cos(this.mesh.rotation.y + 0.75);  
    var imageData = this.pixelData.getImageData(x, z, 1, 1).data
    if (imageData[0] > 192) {
      inputs[2] = d / 20;
      break;
    }
  }

  turnSignals = this.nn.play(inputs);
  if (turnSignals[0] > 0.5 && turnSignals[0] > turnSignals[1]) {
    // Must be more than 0.5 and more than the signal to turn right.
    this.theta -= .5;
  } else if (turnSignals[1] > 0.5) {
    this.theta += .5;
  } else {
    // Not turning
    // console.log("AI has", turnSignals);
  }

  if (this.verbose) {
    console.log("distances", inputs, "->", turnSignals);
  }

  // Turn the car to theta.
  this.mesh.rotation.y = THREE.Math.degToRad( this.theta );

  this.mesh.position.x += this.speed * Math.sin(this.mesh.rotation.y);
  this.mesh.position.z += this.speed * Math.cos(this.mesh.rotation.y);  

  // var keyValues = this.keyControls.get();

  // var log = false;
  // if (keyValues.left) {
  //   this.theta -= .5;
  //   log = true;
  // }
  // if (keyValues.right) {
  //   this.theta += .5;
  //   log = true;
  // }

  // if (keyValues.up) {
  //   // Move the postion based on the angle
  //   this.mesh.position.x += this.speed * Math.sin(this.mesh.rotation.y);
  //   this.mesh.position.z += this.speed * Math.cos(this.mesh.rotation.y);  
  //   log = true;
  // }
  // if (keyValues.down) {
  //   // Move the postion based on the angle
  //   this.mesh.position.x -= this.speed * Math.sin(this.mesh.rotation.y);
  //   this.mesh.position.z -= this.speed * Math.cos(this.mesh.rotation.y);  
  //   log = true;
  // }

  // if (log) {
  //   // Log the values
  //   console.log(this.mesh.position.x.toFixed(0), this.mesh.position.z.toFixed(0), inputs);
  //   console.log(px, pz, "color", pixel)
  // }
}

angular.module('carai', [
  'ngRoute',
  'config'
])
.controller('MainController', MainController)
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    templateUrl: '/static/carai/carai.tpl.html?v=' + config.version,
    controller: 'MainController',
    controllerAs: 'ctrl'
  })
})
;