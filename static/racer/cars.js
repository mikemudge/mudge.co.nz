function loadCar(callback) {
  var loader = new THREE.BinaryLoader();
  //obj/veyron/VeyronNoUv_bin.js
  loader.load("/static/racer/assets/veyron/F50NoUv_bin.js", angular.bind(this, function( geometry ) {
    geometry.sortFacesByMaterialIndex();

    var m = new THREE.MultiMaterial();

    var r = "/static/img/";
    var urls = [
      r + "posz.jpg", r + "posz.jpg",
      r + "posz.jpg", r + "posz.jpg",
      r + "posz.jpg", r + "posz.jpg"
    ];

    var textureCube = new THREE.CubeTextureLoader().load( urls );
    textureCube.format = THREE.RGBFormat;

    var mlib = {
      "Orange":   new THREE.MeshLambertMaterial( { color: 0xff6600, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.3 } ),
      "Blue":   new THREE.MeshLambertMaterial( { color: 0x001133, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.3 } ),
      "Red":    new THREE.MeshLambertMaterial( { color: 0x660000, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.25 } ),
      "Black":  new THREE.MeshLambertMaterial( { color: 0x000000, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.15 } ),
      "White":  new THREE.MeshLambertMaterial( { color: 0xffffff, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.25 } ),

      "Carmine":  new THREE.MeshPhongMaterial( { color: 0x770000, specular:0xffaaaa, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Gold":   new THREE.MeshPhongMaterial( { color: 0xaa9944, specular:0xbbaa99, shininess:50, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Bronze": new THREE.MeshPhongMaterial( { color: 0x150505, specular:0xee6600, shininess:10, envMap: textureCube, combine: THREE.MixOperation, reflectivity: 0.25 } ),
      "Chrome":   new THREE.MeshPhongMaterial( { color: 0xffffff, specular:0xffffff, envMap: textureCube, combine: THREE.MultiplyOperation } ),

      "Orange metal": new THREE.MeshLambertMaterial( { color: 0xff6600, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Blue metal":   new THREE.MeshLambertMaterial( { color: 0x001133, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Red metal":  new THREE.MeshLambertMaterial( { color: 0x770000, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Green metal":  new THREE.MeshLambertMaterial( { color: 0x007711, envMap: textureCube, combine: THREE.MultiplyOperation } ),
      "Black metal":  new THREE.MeshLambertMaterial( { color: 0x222222, envMap: textureCube, combine: THREE.MultiplyOperation } ),

      "Pure chrome":  new THREE.MeshLambertMaterial( { color: 0xffffff, envMap: textureCube } ),
      "Dark chrome":  new THREE.MeshLambertMaterial( { color: 0x444444, envMap: textureCube } ),
      "Darker chrome":new THREE.MeshLambertMaterial( { color: 0x222222, envMap: textureCube } ),

      "Black glass":  new THREE.MeshLambertMaterial( { color: 0x101016, envMap: textureCube, opacity: 0.975, transparent: true } ),
      "Dark glass": new THREE.MeshLambertMaterial( { color: 0x101046, envMap: textureCube, opacity: 0.25, transparent: true } ),
      "Blue glass": new THREE.MeshLambertMaterial( { color: 0x668899, envMap: textureCube, opacity: 0.75, transparent: true } ),
      "Light glass":  new THREE.MeshBasicMaterial( { color: 0x223344, envMap: textureCube, opacity: 0.25, transparent: true, combine: THREE.MixOperation, reflectivity: 0.25 } ),

      "Red glass":  new THREE.MeshLambertMaterial( { color: 0xff0000, opacity: 0.75, transparent: true } ),
      "Yellow glass": new THREE.MeshLambertMaterial( { color: 0xffffaa, opacity: 0.75, transparent: true } ),
      "Orange glass": new THREE.MeshLambertMaterial( { color: 0x995500, opacity: 0.75, transparent: true } ),

      "Orange glass 50":  new THREE.MeshLambertMaterial( { color: 0xffbb00, opacity: 0.5, transparent: true } ),
      "Red glass 50":   new THREE.MeshLambertMaterial( { color: 0xff0000, opacity: 0.5, transparent: true } ),

      "Fullblack rough":  new THREE.MeshLambertMaterial( { color: 0x000000 } ),
      "Black rough":    new THREE.MeshLambertMaterial( { color: 0x050505 } ),
      "Darkgray rough": new THREE.MeshLambertMaterial( { color: 0x090909 } ),
      "Red rough":    new THREE.MeshLambertMaterial( { color: 0x330500 } ),

      "Darkgray shiny": new THREE.MeshPhongMaterial( { color: 0x000000, specular: 0x050505 } ),
      "Gray shiny":   new THREE.MeshPhongMaterial( { color: 0x050505, shininess: 20 } )
    };

    var material = mlib['Red']; new THREE.MeshBasicMaterial( { color: 0xff0000 } );

    var mmap = {
      0:  mlib[ "Dark chrome" ],    // interior + rim
      1:  mlib[ "Pure chrome" ],    // wheels + gears chrome
      2:  mlib[ "Blue glass" ],     // glass
      3:  material,      // torso mid + front spoiler
      4:  mlib[ "Darkgray shiny" ],   // interior + behind seats
      5:  mlib[ "Darkgray shiny" ],   // tiny dots in interior
      6:  material,      // back torso
      7:  material,      // right mirror decal
      8:  material,      // front decal
      9:  material,      // front torso
      10: material,      // left mirror decal
      11: mlib[ "Pure chrome" ],    // engine
      12: mlib[ "Darkgray rough" ], // tires side
      13: mlib[ "Darkgray rough" ], // tires bottom
      14: mlib[ "Darkgray shiny" ],   // bottom
      15: mlib[ "Black rough" ],    // ???
      16: mlib[ "Orange glass" ],   // front signals
      17: mlib[ "Dark chrome" ],    // wheels center
      18: mlib[ "Red glass" ],    // back lights
      19: mlib[ "Black rough" ],    // ???
      20: mlib[ "Red rough" ],    // seats
      21: mlib[ "Black rough" ],    // back plate
      22: mlib[ "Black rough" ],    // front light dots
      23: material,      // back torso
      24: material       // back torso center
    }

    for ( var i in mmap ) {
      m.materials[ i ] = mmap[ i ];
    }

    var mesh = new THREE.Mesh( geometry, m );

    // This model is big.
    mesh.scale.x = mesh.scale.y = mesh.scale.z = 0.0002;

    callback(mesh);
  }));
}
window.loadCar = loadCar;
