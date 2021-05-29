
var MainController = function() {
  var canvas = document.getElementById('canvas');
  // You can't share a canvas for 3d and 2d rendering.
  this.canvas2d = document.getElementById('canvas2d');

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

  // load track will asynchronously assign this.pixelData for collision detection.
  this.track = new Track();
  this.scene.add(this.loadTrack());

  this.generation = 0;
  this.updatables = [];

  this.nextGeneration();

  // this.updatables = [];
  window.addEventListener('resize', angular.bind(this, this.resize));

  window.addEventListener('blur', function() {
    // This will prevent updates from happening if you lose focus.
    // Good for CPU usage during development.
    console.log("pause");
    this.pause = true;
  }.bind(this), false);

  // Just for now.
  // this.debug = true;

  window.addEventListener('focus', function() {
    console.log("unpause");
    this.pause = false;
    this.start();
  }.bind(this), false);
  this.start();
}

MainController.prototype.fixNN = function(idx) {
    // this.updatables[0].verbose = true;
  // Test run of the selected car NN
  var nn = this.updatables[idx].nn;
  // this.nn.verbose = true;

  // First feature
  // bias is 3rd "input".
  nn.weights1[3][0] = -50;
  // 0 is the input for left distance.
  nn.weights1[0][0] = 100;

  // Sencond feature
  // bias is 3rd "input".
  nn.weights1[3][1] = -50;
  // 2 is the input for right distance.
  nn.weights1[2][1] = 100;

  // This just says turn left when feature 1 is on, right when feature 2 is on.
  nn.weights2[5][0] = -5;
  nn.weights2[5][1] = -5;

  nn.weights2[0][0] = 10;
  nn.weights2[1][1] = 10;

  var result;

  // result = nn.play([0,0,5]);
  // console.log(nn.normalInputs, nn.hiddens, result);
  // result = nn.play([0,5,0]);
  // console.log(nn.normalInputs, nn.hiddens, result);
  // result = nn.play([5,0,0]);
  // console.log(nn.normalInputs, nn.hiddens, result);
}

MainController.prototype.loadTrack = function() {
  // Load the track image for collision detection
  var img = new Image();
  img.src = '/static/img/Track.jpg?v=1';
  img.onload = function() {
    // create a canvas to manipulate the image
    var canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);

    console.log("Track image is", img.width, img.height);
    // get the pixel data
    this.pixelData = canvas.getContext('2d');
    this.track.pixelData = this.pixelData;
  }.bind(this);

  // Load for rendering.
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
    if (this.debug) {
      var fps = 1;
      setTimeout(function(){ 
        // throttle requestAnimationFrame to fps
        requestAnimationFrame(render);
      }, 1000/fps)
    } else {
      // When not debugging request animation immediately.
      requestAnimationFrame(render);
    }
    this.render();
  }.bind(this);
  render();
};

MainController.prototype.resize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize( window.innerWidth, window.innerHeight );
}

MainController.prototype.nextGeneration = function() {
  this.generation++;

  this.updatables.forEach(function(aiControl) {
    this.scene.remove(aiControl.mesh);
  }.bind(this));
  // TODO find existing updatables for reuse?
  this.updatables = [];

  var mesh = new THREE.CubeGeometry( 10, 1, 20 );
  var material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0xff0000
  });
  var selectedMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    color: 0x00ff00
  });

  var numCars = 20;
  for (i = 0; i < numCars; i++) {
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
    this.updatables.push(new AIControls(cube, this.track))
  }


  this.fixNN(1);
}

MainController.prototype.render = function(time) {

  var stillRunning = 0;
  this.updatables.forEach(function(x) {
    if (!x.crashed) {
      stillRunning++;
    }
    x.update(time);
  }.bind(this));

  this.renderer.render(this.scene, this.camera);

  // render overlay?
  if (this.canvas2d) {
    var ctx = this.canvas2d.getContext('2d');
    ctx.canvas.width  = window.innerWidth;
    ctx.canvas.height = window.innerHeight;
    ctx.clearRect(0,0,100,100)
    ctx.fillStyle = 'white';
    ctx.font = '24px san-serif';
    ctx.fillText('Gen: ' + this.generation + ' live: ' + stillRunning, 10, 24);


    for (var i = 0; i < 5; i++) {
      this.renderNN(ctx, 0, 100 + 100 * i, this.updatables[i]);
    }
  }

  if (stillRunning == 0) {
    this.nextGeneration();
  }
}

MainController.prototype.renderNN = function(ctx, x, y, car) {
  nn = car.nn
  ctx.clearRect(x,y,100,100)
  ctx.strokeStyle = 'white';
  ctx.beginPath();
  ctx.rect(x, y, 100, 100);
  ctx.stroke();

  if (car.crashed) {
    ctx.fillStyle = 'white';
    ctx.font = '16px san-serif';
    ctx.fillText('Crashed', x + 10, y + 24);
    return;
  }
  ctx.lineWidth = 2;

  for (var i = 0; i < nn.weights1.length; i++) {
    for (var h = 0; h < nn.weights1[i].length; h++) {
      colStrength = nn.weights1[i][h] * 10 + 127;
      // Limit the col between 0-255
      g = Math.min(Math.max(colStrength, 0), 255);
      r = 255 - g;
      ctx.strokeStyle = 'rgba(' + r + ', ' + g + ', 0, 1)';

      ctx.beginPath();
      ctx.moveTo(x + 20 + i * 20, y + 15);
      ctx.lineTo(x + 10 + h * 15 , y + 55);
      ctx.stroke();
    }
  }


  for (var h = 0; h < nn.weights2.length; h++) {
    for (var o = 0; o < nn.weights2[h].length; o++) {
      colStrength = nn.weights2[h][o] * 10 + 127;
      // Limit the col between 0-255
      g = Math.min(Math.max(colStrength, 0), 255);
      r = 255 - g;
      ctx.strokeStyle = 'rgba(' + r + ', ' + g + ', 0, 1)';

      ctx.beginPath();
      ctx.moveTo(x + 10 + h * 15 , y + 55);
      ctx.lineTo(x + 30 + o * 40, y + 90);
      ctx.stroke();
    }
  }
}

var NN = function(ins, hiddens, outs) {
  this.weights1 = [];
  for (var i = 0; i < ins + 1; i++) {
    this.weights1.push([]);
    for (var h = 0; h < hiddens; h++) {
      this.weights1[i].push(10 * Math.random() - 5);
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
    this.normalInputs[i] = this.sigmoid(inputs[i] / 200);
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


var Track = function() {

}

Track.prototype.getPixel = function(loc) {
  // Convert the location in 3d space to the image space.
  var px = Math.round(512 + loc.x * 2);
  var pz = Math.round(512 - loc.z * 2);

  var pixelData = this.pixelData.getImageData(px, pz, 1, 1).data
  pixelData = [pixelData[0], pixelData[1], pixelData[2]];
  return pixelData
}

Track.prototype.getRayDistances = function(mesh) {
  // px, pz is the pixel on the track image where the car currently is.
  var px = Math.round(512 + mesh.position.x * 2);
  var pz = Math.round(512 - mesh.position.z * 2);

  var inputs = [200, 200, 200];
  for (var d = 1; d < 200; d+=5) {
    x = px + d * 2 * Math.sin(mesh.rotation.y - Math.PI / 4);
    z = pz - d * 2 * Math.cos(mesh.rotation.y - Math.PI / 4);  
    var imageData = this.pixelData.getImageData(x, z, 1, 1).data
    if (imageData[0] > 192) {
      inputs[0] = d;
      break;
    }
  }

  // Angle change
  for (var d = 1; d < 200; d += 5) {
    // * 2 because the image data is at a different scale to the 3 js space.
    x = px + d * 2 * Math.sin(mesh.rotation.y);
    z = pz - d * 2 * Math.cos(mesh.rotation.y);
    var imageData = this.pixelData.getImageData(x, z, 1, 1).data
    if (imageData[0] > 192) {
      // / 2 to render the line in 3d space.
      inputs[1] = d;
      break;
    }
  }

  // Angle change
  for (var d = 1; d < 200; d+=5) {
    x = Math.round(px + d * 2 * Math.sin(mesh.rotation.y + Math.PI / 4));
    z = Math.round(pz - d * 2 * Math.cos(mesh.rotation.y + Math.PI / 4));
    var imageData = this.pixelData.getImageData(x, z, 1, 1).data
    if (imageData[0] > 192) {
      inputs[2] = d;
      break;
    }
  }

  return inputs;
}

var AIControls = function(mesh, track) {
  this.mesh = mesh;
  this.track = track;
  this.enabled = true;
  this.speed = 0.9;
  this.theta = 0;

  // Create a line for the radar.
  var material = new THREE.LineBasicMaterial( { color: 0x0000ff } );
  var geometry = new THREE.Geometry();

  // Put the ray tracer lines higher than the object its coming from.
  height = 10;
  // 3 lines (pairs of vertices) for the raytracer visualization.
  geometry.vertices.push(
    new THREE.Vector3( 0, height, 0 ),
    new THREE.Vector3( 10, height, 10 ),
    new THREE.Vector3( 0, height, 0 ),
    new THREE.Vector3( 0, height, 10 ),
    new THREE.Vector3( 0, height, 0 ),
    new THREE.Vector3( -10, height, 10 )
  );
  this.lines = new THREE.Line( geometry, material );

  // Add a line showing the ray cast.
  this.mesh.add(this.lines);

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

  if (!this.track.pixelData) {
    // The track has not been loaded yet.
    return;
  }

  if (this.crashed) {
    return;
  }

  var loc = this.mesh.position;

  // This is the pixel color for that location px, pz.
  pixel = this.track.getPixel(loc);
  if (pixel[0] > 192) {
    this.crashed = true;
  }

  inputs = this.track.getRayDistances(this.mesh);

  if (this.lines) {
    // Update the line lengths based on raytraced distances.
    this.lines.geometry.vertices[1].set( -1, 0, 1 ).normalize().multiplyScalar(inputs[0] / 2);
    this.lines.geometry.vertices[3].set(0, 0, inputs[1] / 2 );
    this.lines.geometry.vertices[5].set(1, 0, 1 ).normalize().multiplyScalar(inputs[2] / 2);
    this.lines.geometry.verticesNeedUpdate = true;
  }

  if (this.enabled) {
    turnSignals = this.nn.play(inputs);

    if (this.verbose) {
      console.log("distances", inputs, "->", turnSignals);
    }

    if (turnSignals[0] > 0.5 && turnSignals[0] > turnSignals[1]) {
      // Must be more than 0.5 and more than the signal to turn right.
      this.theta -= 3;
    } else if (turnSignals[1] > 0.5) {
      this.theta += 3;
    } else {
      // Not turning
      // console.log("AI has", turnSignals);
    }

    this.mesh.position.x += this.speed * Math.sin(this.mesh.rotation.y);
    this.mesh.position.z += this.speed * Math.cos(this.mesh.rotation.y);  
  } else {
    // If not enabled then use keys to control.
    var keyValues = this.keyControls.get();

    if (keyValues.left) {
      this.theta += 5;
    }
    if (keyValues.right) {
      this.theta -= 5;
    }

    if (keyValues.up) {
      // Move the postion based on the angle
      this.mesh.position.x += this.speed * Math.sin(this.mesh.rotation.y);
      this.mesh.position.z += this.speed * Math.cos(this.mesh.rotation.y);  
    }
    if (keyValues.down) {
      // Move the postion based on the angle
      this.mesh.position.x -= this.speed * Math.sin(this.mesh.rotation.y);
      this.mesh.position.z -= this.speed * Math.cos(this.mesh.rotation.y);  
    }
  }

  // Turn the car to theta.
  this.mesh.rotation.y = THREE.Math.degToRad( this.theta );

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
