
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x000000 );
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

params = new URLSearchParams(window.location.search);

var linkText = document.createTextNode("Download obj");
var downloadButton = document.createElement('a');
downloadButton.appendChild(linkText);
setTimeout(function() {
	let links = document.getElementsByClassName("links");
	links[0].appendChild(downloadButton);
}, 1000);

function setup() {
	if (!window.loadGeometry) {
		alert("Choose a sample, E.g ?sample=straight");
	}
	geometry = loadGeometry();

	// Render the geometry on screen using lighting to show edges more clearly.
	const material = new THREE.MeshPhongMaterial( {
		color: 0xaaaaaa, specular: 0xffffff, shininess: 10,
		side: THREE.FrontSide, vertexColors: true, transparent: true
	} );
	const cube = new THREE.Mesh( geometry, material );
	scene.add( cube );

	// Parse the input and generate the OBJ output
	const data = exporter.parse( scene );

	name = params.get('sample');
	name = name.charAt(0).toUpperCase() + name.slice(1);
	downloadButton.download=name + '.obj';
	downloadButton.href = 'data:application/x-json;base64,' + btoa(data);
}

function draw() {
	noLoop();
}

// Up on my 3d printer is +Z.
// This is important to orientate exported files in slicers.
// Initially start the camera in front of the printer +Y.
camera.up = new THREE.Vector3(0,0,1);
camera.position.z = 50;
camera.position.y = -100;

scene.add( new THREE.AmbientLight(0xC0C0C0) );
// White light at 50% intensity
const dirLight = new THREE.DirectionalLight( 0xffffff, 0.5 ) ;
dirLight.position.set( 20, 20, 20 );
scene.add( dirLight );

const light1 = new THREE.PointLight(0x404040);
light1.position.set( 20, 40, 80 );
scene.add( light1 );

const light2 = new THREE.PointLight(0x404040);
light2.position.set( -20, 40, -80 );
scene.add( light2 );

controls = new THREE.OrbitControls(camera);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Instantiate an exporter
const exporter = new OBJExporter();

// Render the thing locally
const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

function animate() {
	requestAnimationFrame( animate );
	controls.update();
	renderer.render( scene, camera );
}
animate();

angular.module('3dprint', [
	'config',
	'ngRoute'
])
.config(function($routeProvider, config) {
	$routeProvider
	.otherwise({
		templateUrl: '/static/3dprint/3dprint.tpl.html',
	});
});
