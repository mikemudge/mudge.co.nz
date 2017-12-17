// Little hack to return to the top of the page before leaving.
// This prevents refresh from trying to auto scroll to the last location.
$(window).on('beforeunload', function() {
    $(window).scrollTop(0);
});
var NotFoundController = function($location, $route, $scope) {
  var routes = [];
  for (r in $route.routes) {
    var route = $route.routes[r];
    if (route.originalPath && !route.redirectTo) {
      var path = route.originalPath.substr(1)
      if (route.originalPath === '/') {
        path = '.'
      }
      routes.push({
        'path': path,
        'template': route.templateUrl.substr(route.templateUrl.lastIndexOf('/'))
      });
    }
  }
  $scope.routes = routes;
  $scope.path = $location.path();
}

var CardController = function($resource, $scope) {
  this.Card = $resource(config.API_URL + '/api/personal');
  $scope.cards = this.Card.query();
}

var FooterController = function() {}

FooterController.prototype.click = function(page) {
  ga('send', 'event', 'Click', 'footer', page);
}

var SocialController = function() {}

SocialController.prototype.clickHome = function(which, url) {
  ga('send', 'event', 'Click', 'social-home', which, {
    'transport': 'beacon',
    'hitCallback': function() {
      document.location = url;
    }
  });
}

SocialController.prototype.click = function(which, url) {
  ga('send', 'event', 'Click', 'social', which, {
    'transport': 'beacon',
    'hitCallback': function() {
      document.location = url;
    }
  });
}

var CreateController = function($scope, $timeout, $window, playerService) {
  this.$scope = $scope;
  this.$timeout = $timeout;
  this.playerService = playerService;
  this.$scope.scrollPos = this.scrollPos = 0;
  window.ctrl = this;

  this.selected = -1;
  this.firstTime = true;
  var resize = angular.bind(this, function() {
    // When screens are small the text is rendered under images instead of next to them.
    // This means we always show it instead of conditionally displaying it.
    this.smallScreen = window.innerWidth < 600;
  });
  resize();

  var scroll = angular.bind(this, this.scroll);
  $window.addEventListener('scroll', scroll);
  $window.addEventListener('resize', resize);
  $scope.$on('$destroy', angular.bind(this, function () {
    window.removeEventListener('scroll', scroll)
    window.removeEventListener('resize', resize)
    this.playerService.cleanup();
  }));
};

CreateController.prototype.addBackground = function() {
  if (this.firstTime) {
    this.playerService.controls.autoRotate = true;
    this.playerService.controls.autoRotateSpeed = 2.0;
    this.firstTime = false;
  }

  this.playerService.background.expectedOpacity = 1;
  this.displayBackground_();
};

CreateController.prototype.hideBackground = function() {
  this.playerService.background.expectedOpacity = 0;
  this.displayBackground_();
};

CreateController.prototype.displayBackground_ = function() {
  var background = this.playerService.background;
  if (background.threeMesh.material.opacity < background.expectedOpacity) {
    background.threeMesh.material.opacity = Math.min(1, background.threeMesh.material.opacity + 0.1);
    this.playerService.viewportChanged = true;
    if (background.threeMesh.material.opacity < background.expectedOpacity) {
      this.$timeout(this.displayBackground_.bind(this), 200);
    }
  } else if (background.threeMesh.material.opacity > background.expectedOpacity) {
    background.threeMesh.material.opacity = Math.max(0, background.threeMesh.material.opacity - 0.1);
    this.playerService.viewportChanged = true;
    if (background.threeMesh.material.opacity > background.expectedOpacity) {
      this.$timeout(this.displayBackground_.bind(this), 200);
    }
  }
};

CreateController.prototype.scroll = function() {
  this.$scope.scrollPos = this.scrollPos = window.scrollY;

  this.selected = -1;
  if (this.visibleOnPage_('.record')) {
    this.selected = 0;
  }
  if (this.visibleOnPage_('.transform')) {
    this.selected = 1;
  }
  // This hits when the player is fully displayed on the screen.
  offset = -204;
  if (this.smallScreen) {
    offset = -104;
  }
  if (this.visibleOnPage_('.transform', window.innerHeight + offset)) {
    this.selected = 2;
    this.addBackground();
  } else {
    this.hideBackground();
  }
  this.$scope.$apply();
}

/* The scroll position when an element is considered to be shown on the page */
CreateController.prototype.visibleOnPage_ = function(elem, additional) {
  additional = additional || 0
  // This will wait until 200 px are displayed on the page.
  return window.scrollY >= $(elem).offset().top - window.innerHeight + 200 + additional;
}

var MainController = function(config, $scope) {
  this.video = {
    show: false
  };
  this.$scope = $scope;
  window.ctrl = this;

  var iOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
  var orientationSupported = (typeof window.orientation !== 'undefined')
  $scope.smallScreen = window.innerWidth < 600;

  // Mobile device can't auto play the background video so we use an image instead.
  $scope.backgroundVideo = !iOS && !orientationSupported && !$scope.smallScreen;
  $scope.backgroundVideoSrc = config.AMAZON_S3_URL + '8i+Website/Videos/home_background_sm.mp4';

  this.$scope.scrollPos = 0;
  var scroll = angular.bind(this, function() {
    this.$scope.scrollPos = window.scrollY;
    this.findSelected();
    this.$scope.$apply();
  });
  var resize = angular.bind(this, function() {
    // When the screen gets thin we can show portrait images instead.
    $scope.portrait = window.innerWidth < 500 && window.innerHeight > window.innerWidth;
  });
  resize();
  window.addEventListener('scroll', scroll);
  window.addEventListener('resize', resize);
  $scope.$on('$destroy', function () {
    window.removeEventListener('scroll', scroll)
    window.removeEventListener('resize', resize)
  });

  // Load youtube player javascript
  var tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  var firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  this.allQuotes = [{
    who: '/static/img/new_site/quotes/upload-vr.png',
    link: 'http://uploadvr.com/8i-new-ceo-hologram-research-seattle/',
    what: '8i Appoints New CEO, hints at Holographic Telepresence Research in Seattle.'
  }, {
    who: '/static/img/new_site/quotes/wsj.png',
    link: 'http://www.wsj.com/articles/former-game-of-thrones-effects-chief-creates-virtual-reality-studio-1462534206',
    what: 'This is the journalist’s dream come true,” Ms. [Nonny] de la Pena said of 8i’s technology.'
  },{
    who: '/static/img/new_site/quotes/bloomberg.png',
    link: 'http://www.bloomberg.com/features/2016-hello-world-new-zealand/',
    what: '8i is developing software that will bring VR to the masses. The day you can capture a loved one in virtual space is almost here.'
  }, {
    who: '/static/img/new_site/quotes/wired.png',
    link: 'http://www.wired.com/2016/01/sundance-volumetric-vr-8i/',
    what: '...a fully navigable 3-D VR movie that’s far more immersive than the 360-degree videos most have seen.'
  }, {
    who: '/static/img/new_site/quotes/fast-company.png',
    link: 'http://www.fastcompany.com/3054317/why-volumetric-vr-is-the-real-future-of-virtual-reality',
    what: 'What 8i is doing is absolutely, fundamentally innovative.'
  }, {
    who: '/static/img/new_site/quotes/cnn.png',
    link: 'http://www.cnn.com/2016/01/28/entertainment/virtual-reality-movies-sundance-film-festival-feat/index.html?eref=rss_showbiz',
    what: '..you\'re going to be able to go from a two-dimensional screen and actually walk into a website. It\'s going to change everything.'
  }, {
    who: '/static/img/new_site/quotes/tech-crunch.png',
    link: 'http://techcrunch.com/2015/10/14/8i-raises-13-5m-to-chase-the-human-side-of-virtual-reality/',
    what: 'I’ve never seen that much human detail with a VR getup on my face.'
  }, {
    who: '/static/img/new_site/quotes/financial-times.png',
    link: 'http://www.ft.com/intl/cms/s/0/62182d16-7248-11e5-a129-3fcc4f641d98.html',
    what: '...the result is an image that would take hundreds of artists and complicated motion-capture technology to create for Hollywood movies.'
  }, {
    who: '/static/img/new_site/quotes/fortune.png',
    link: 'http://fortune.com/2016/01/04/8i-3d-holographic-technology/',
    what: 'Unlike those Star Wars holograms, 8i provides high-definition video that’s not transparent.'
  }, {
    who: '/static/img/new_site/quotes/new-york-times.png',
    link: 'http://www.nytimes.com/2015/12/14/technology/in-virtual-reality-headsets-investors-glimpse-the-future.html',
    what: 'technology that lets people interact with video of humans as though they were in the same room.'
  }, {
    who: '/static/img/new_site/quotes/the-hollywood-reporter.png',
    link: 'http://www.hollywoodreporter.com/behind-screen/sundance-looking-tarantino-virtual-reality-859550',
    what: 'a VR content creation system to produce what it calls "volumetric VR" to "enable a presence and freedom of movement.'
  }, {
    who: '/static/img/new_site/quotes/los-angeles-times.png',
    link: 'http://www.latimes.com/business/technology/la-fi-tn-virtual-reality-8i-20151014-story.html',
    what: 'Anyone watching the recording through a headset could move their head or walk around and feel as if the person in the video was in the same room.'
  }];
  this.quoteIndex = 0;
  this.updateQuotes();

  this.selected = -1;
}

MainController.prototype.quoteLeft = function() {
  if (this.quoteIndex > 0) {
    this.quoteIndex--;
  } else {
    this.quoteIndex = this.allQuotes.length - 1;
  }
  this.updateQuotes();
}

MainController.prototype.quoteRight = function() {
  if (this.quoteIndex < this.allQuotes.length - 1) {
    this.quoteIndex++;
  } else {
    this.quoteIndex = 0;
  }
  this.updateQuotes();
}

MainController.prototype.updateQuotes = function() {
  this.quotes = [
    this.allQuotes[this.quoteIndex],
    this.allQuotes[(this.quoteIndex + 1) % this.allQuotes.length],
    this.allQuotes[(this.quoteIndex + 2) % this.allQuotes.length]
  ];
}

MainController.prototype.findSelected = function() {
  this.selected = -1;
  if (this.visibleOnPage_('.record')) {
    this.selected = 0;
  }
  if (this.visibleOnPage_('.playback')) {
    this.selected = 1;
  }
  if (this.visibleOnPage_('.movement')) {
    this.selected = 2;
  }
}

/* The scroll position when an element is considered to be shown on the page */
MainController.prototype.visibleOnPage_ = function(elem, additional) {
  additional = additional || 0
  // This will wait until 200 px are displayed on the page.
  return window.scrollY >= $(elem).offset().top - window.innerHeight + 200 + additional;
}

MainController.prototype.goto = function(loc) {
  window.location = loc;
}

MainController.prototype.onPlayerStateChange = function(event) {
  console.log('onPlayerStateChange', event);
  if(event.data == YT.PlayerState.ENDED) {
    this.video.show = false;
    this.$scope.$digest();
  }
};

MainController.prototype.hideVideo = function() {
  this.video.show = false;
  this.ytPlayer.destroy();
}

MainController.prototype.showVideo = function() {
  console.log('here');
  this.video.show = true;
  var w = window.innerWidth;
  var h = window.innerHeight;
  var width = 320;
  var height = 240;
  var rezs = [[560, 315], [640, 360], [853, 480], [1280, 720]]
  for (var i=0; i < rezs.length; i++){
     if (w > rezs[i][0] && h > rezs[i][1])
     {
        width = rezs[i][0];
        height = rezs[i][1];
     }
  }
  $("#yt_video").css({
    width: width + 'px',
    height: height + 'px',
    margin: "-" + height / 2 + " 0 0 -" + width/2 + "px"
  });
  this.ytPlayer = new YT.Player('yt_video', {
    height: 720,
    width: 1280,
    videoId: 'LPkvSQ44baM',
    playerVars: {'autoplay': 1, 'rel':0},
    events: {
      'onReady': function(event) {},
      'onStateChange': angular.bind(this, this.onPlayerStateChange)
    }
  });
}


var HeaderController = function($scope) {
  this.$scope = $scope;
  this.$scope.scrollPos = 0;
  var scroll = angular.bind(this, function() {
    this.$scope.scrollPos = window.scrollY;
    this.$scope.$apply();
  });
  window.addEventListener('scroll', scroll);
  $scope.$on('$destroy', function () {
    window.removeEventListener('scroll', scroll)
  });
}

HeaderController.prototype.click = function(page) {
  ga('send', 'event', 'Click', 'header', page);
}

var SceneService = function(config, $resource) {
  this.Tag = $resource(config.API_URL + '/api/v2/tag/scene/:tag_name');
}

SceneService.prototype.getFeatured = function() {
  return this.getTagged('featured');
}

SceneService.prototype.getTagged = function(tag_name) {
  return this.Tag.get({tag_name: tag_name}).$promise.then(function(response) {
    return response.scenes;
  }.bind(this))
}

var ExperienceController = function($location, sceneService, $route, $scope) {
  this.$location = $location;
  window.ctrl = this;
  $scope.mobile = window.innerWidth < 600 && window.innerWidth < window.innerHeight;

  // The main experience page will only show featured experiences.
  if ($route.current.$$route.originalPath == '/experience') {
    sceneService.getFeatured().then(function(scenes) {
      this.scenes = scenes;
    }.bind(this));
  } else {
    sceneService.getTagged('web').then(function(scenes) {
      this.scenes = scenes;
    }.bind(this));
  }
}

ExperienceController.prototype.showMore = function() {
  this.$location.path('/experience_web');
}

var JobController = function($timeout) {

  var ready = function() {
    if (window.whr) {
      whr(document).ready(function(){
        whr_embed(40071, {
          detail: 'titles',
          base: 'jobs',
          zoom: 'country',
          grouping: 'none'
        });
      });
    } else {
      // Keep calling until someone answers.
      $timeout(ready, 500);
    }
  }
  $timeout(ready);
}

var TeamController = function(
    config, $interval, $location, $resource, $scope, $timeout) {

  var Team = $resource(config.API_URL + '/api/v2/team')
  this.teamMembers = Team.query(function() {
    if ($location.hash() == 'contact') {
      // Wait for teamMembers to get updated/inserted before scrolling to the locations.
      $timeout(function() {
        $('.locations')[0].scrollIntoView();
      })
    }
  });

  this.setupInvestors();

  var resize = angular.bind(this, function() {
    // When the screen gets thin we can show portrait images instead.
    $scope.mobile = window.innerWidth < 1100;
    if (!$scope.$$phase) {
      $scope.$apply();
    }
  });
  resize();
  window.addEventListener('resize', resize);

  var interval = $interval(angular.bind(this, function() {
    if (window.google) {
      $interval.cancel(interval);
      this.showMaps();
    }
  }), 100)
  $scope.$on('$destroy', function() {
    $interval.cancel(interval);
    window.removeEventListener('resize', resize)
  });
}

TeamController.prototype.setupInvestors = function() {
  this.investors = [{
    class: 'extra_padding',
    link: 'http://www.timewarner.com/company/time-warner-investments',
    img: '/static/img/new_site/investors/time_warner.png'
  }, {
    class: 'extra_padding',
    link: 'http://usa.baidu.com/',
    img: '/static/img/new_site/investors/baidu.png'
  }, {
    link: 'http://www.rre.com/',
    img: '/static/img/new_site/investors/rre.png'
  }, {
    class: 'extra_padding',
    link: 'http://www.verizonventures.com/',
    img: '/static/img/new_site/investors/verizon_ventures.png'
  }, {
    class: 'extra_padding',
    link: 'http://www.hearst.com/ventures',
    img: '/static/img/new_site/investors/hearst.png'
  }, {
    link: 'http://foundersfund.com/',
    img: '/static/img/new_site/investors/founders.png'
  }, {
    link: 'http://www.samsungventures.com/',
    img: '/static/img/new_site/investors/samsung.png'
  }, {
    link: 'http://signiaventurepartners.com/',
    img: '/static/img/new_site/investors/signia.png'
  }, {
    link: 'http://www.bdmifund.com/',
    img: '/static/img/new_site/investors/bdmi.png'
  }]
}

TeamController.prototype.showMaps = function() {
  // Google maps stuff.
  var styles = [
    {
      stylers: [
        { "saturation": -100 },
      ]
    }
  ];

  var myLatLng = {lat: -41.2983333, lng: 174.7810676};
  var mapW = new google.maps.Map(document.getElementById('wellington'), {
    center: myLatLng,
    zoom: 17,
    draggable: false,
    scrollwheel: false,
    panControl: false,
    disableDefaultUI: true
  });
  mapW.setOptions({styles: styles});
  var markerW = new google.maps.Marker({
    position: myLatLng,
    map: mapW,
    title: 'Wellington Office, 74 Cambridge Terrace, Te Aro, Wellington 6011, NZ'
  });
  var infowindowWgtn = new google.maps.InfoWindow({
    content: 'Wellington Office, 74 Cambridge Terrace, Te Aro, Wellington 6011, NZ'
  });
  infowindowWgtn.open(mapW, markerW);
  markerW.addListener('click', function() {
    infowindowWgtn.open(mapW, markerW);
  });
  mapW.addListener('click', function() {
    window.open('https://www.google.com/maps?ll=-41.298333,174.781068&z=17&t=m&hl=en-US&gl=US&mapclient=apiv3');
  })
  var myLatLng = {lat: 33.9774942, lng: -118.4249668};
  myLatLng = {lat: 34.023871, lng: -118.391823};
  var map = new google.maps.Map(document.getElementById('los-angeles'), {
    center: myLatLng,
    zoom: 17,
    draggable: false,
    scrollwheel: false,
    panControl: false,
    disableDefaultUI: true
  });
  map.setOptions({styles: styles});
  var marker = new google.maps.Marker({
    position: myLatLng,
    map: map,
    title: '9336 West Washington Boulevard, Building O · Culver City, CA 90232'
    // title: '5340 Alla Rd, Los Angeles, CA 90066'
  });
  var infowindow = new google.maps.InfoWindow({
    content: '9336 West Washington Boulevard, Building O · Culver City, CA 90232'
    // content: '5340 Alla Rd, Los Angeles, CA 90066'
  });
  infowindow.open(map, marker);
  marker.addListener('click', function() {
    infowindow.open(map, marker);
  });

  map.addListener('click', function() {
    window.open('https://www.google.com/maps?ll=34.023871,-118.391823&z=17&t=m&hl=en-US&gl=US&mapclient=apiv3');
    // window.open('https://www.google.com/maps?ll=33.9774942,-118.4249668&z=17&t=m&hl=en-US&gl=US&mapclient=apiv3');
  });
}
var Carousel = function($interval, $scope) {
  var interval = $interval(angular.bind(this, this.update), 1000 * 5 /* millis */)

  // TODO should get the specific carousel element to allow multiple on a page.
  // TODO should get this from a directive property.
  this.total = $('.carousel .item').length
  this.current = 0;
  $scope.$on('$destroy', function() {
    $interval.cancel(interval);
  });
}

var InstallController = function() {};
InstallController.prototype.showLightbox = function(i) {
  this.lightbox = i;
}
InstallController.prototype.hideLightbox = function() {
  this.lightbox = 0;
};

Carousel.prototype.update = function() {
  // TODO should get this from a directive property.
  this.total = $('.carousel .item').length
  this.current++;
  if (this.current >= this.total) {
    this.current = 0;
  }
};

var PlayController = function(config, playerService) {
  this.playerService = playerService;
  this.textureLoader = new THREE.TextureLoader();
  this.objLoader = new THREE.OBJLoader();

  this.playerService
      .setAsset({
        url: config.AMAZON_S3_URL + '8i Website/Create Page Chuuwee Asset/BAND_PingPong_400_15_75_85.hvrs',
        framerate: 15,
        resolution: 400
      })
      .load(angular.bind(this, function() {
        this.deviceListen = angular.bind(this, this.setOrientationControls);
        window.addEventListener('deviceorientation', this.deviceListen);
      }));

  // Has to happen after playerService.load() as it needs the three js objects.
  this.addExtraStand();

  this.playerService.controls.rotateSpeed = 0.4;

  // restrict uppy downy rotation
  this.playerService.controls.minPolarAngle = Math.PI * .45;
  this.playerService.controls.maxPolarAngle = Math.PI * .65;

  // prevent the controls from zooming.
  this.playerService.controls.noZoom = true;
  this.playerService.controls.noTouch = true;
  this.playerService.controls.noPan = true;

  // Update camera and target after load as well.
  this.playerService.camera.position.y = 130;
  this.playerService.camera.position.z = 130;

  // To get the rotation target just right.
  this.playerService.controls.target.x = -5;
  this.playerService.controls.target.y = this.playerService.camera.position.y;
  this.playerService.controls.target.z = -23;

  var back = this.addSphereBackground();
  back.material.transparent = true;
  back.material.opacity = 0;
  // TODO this is not ideal way to share data between 2 controllers. Refactor.
  // See also CreateController above which uses this as well.
  playerService.background = {
    expectedOpacity: 0,
    threeMesh: back
  };
};

/**
 * Adds a stand/platform to the scene, for the rapper (Chuuwee) to be sitting on.
 */
PlayController.prototype.addExtraStand = function() {
  this.objLoader.load(
    '/static/img/new_site/stage.obj',
    function (seat) {
      this.textureLoader.load('/static/img/new_site/stage.jpg', angular.bind(this, function(texture) {
        seat.traverse( function (child) {
          if (child instanceof THREE.Mesh) {
            child.material = new THREE.MeshBasicMaterial({map: texture});
          };
        });
        seat.scale.set(40, 40, 40);
        // Esta's second seat.
        seat.position.set(60, 32, -168);

        this.seat = seat;
        this.playerService.threeScene.add(seat);
      }));
    }.bind(this)
  );
}

// Used for Chuuwee/Create page.
PlayController.prototype.addSphereBackground = function() {
  // Surrounding room from spherical image.
  var radius = 400;
  var segments = 50;
  var sphere = new THREE.SphereGeometry(radius, segments, segments);
  sphere.applyMatrix(new THREE.Matrix4().makeScale(-1, 0.5, 1));

  // creation of the sphere material
  var sphereMaterial = new THREE.MeshBasicMaterial();
  this.textureLoader.load('/static/img/backgroundScenes/venice_beach2.jpg', function(texture) {
    sphereMaterial.map = texture
  });

  // geometry + material = mesh (actual object)
  window.sphereMesh = new THREE.Mesh(sphere, sphereMaterial);
  window.sphereMesh.position.y = 200;
  this.playerService.threeScene.add(window.sphereMesh);
  return window.sphereMesh;
}

PlayController.prototype.setOrientationControls = function(e) {
  if (!e.alpha) {
    this.playerService.orientationControls = false;
    return;
  }
  // This should only happen once, check that removeEventListener is working.
  console.log('removeEventListener');
  // Assuming this is a device, and it want's to use orientation controls.
  window.removeEventListener('deviceorientation', this.deviceListen);
  this.playerService.orientationControls = true;

  // Disable normal controls when DeviceOrientationControls are available.
  // This is important to allow mobile devices to scroll (rather than rotate).
  this.playerService.controls.enabled = false;

  // New controls should check camera position? or get the infomation from settings?
  this.playerService.controls = new THREE.DeviceOrientationControls(
      this.playerService.camera,
      this.playerService.controls.target, {
        alphaOnly: true
      });
  this.playerService.controls.connect();
  this.playerService.controls.update();
};

EightI.Env.registerFileURL("eighti.lib.js.mem", "/js/eighti/eighti.lib.js.mem");

require('api.js')
require('websites/8i/8iTemplate.js')
require('websites/8i/holo.js')
require('websites/angular/scene/player2Service.js')
require('websites/8i/main.tpl.html')

angular.module("8i", [
  '8iTemplate',
  'config',
  'holo',
  'ngResource',
  'ngRoute',
  'player2Service',
  'websites/8i/main.tpl.html',
])
.controller('Carousel', Carousel)
.controller('CardController', CardController)
.controller('CreateController', CreateController)
.controller('ExperienceController', ExperienceController)
.controller('InstallController', InstallController)
.controller('JobController', JobController)
.controller('MainController', MainController)
.controller('PlayerController', PlayController)
.controller('TeamController', TeamController)
.service('sceneService', SceneService)
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode({
    enabled: true,
    requireBase: false
  });
  $routeProvider
    .when('/', {
      templateUrl: 'websites/8i/main.tpl.html',
      title: '8i | Home'
    })
    .when('/experience', {
      templateUrl: '/static/new_site/experience.html',
      title: '8i | Experience'
    })
    .when('/experience_web', {
      templateUrl: '/static/new_site/experience_web.html',
      title: '8i | Experience'
    })
    .when('/create', {
      templateUrl: '/static/new_site/create.html',
      title: '8i | Create'
    })
    .when('/jobs', {
      templateUrl: '/static/new_site/jobs.html?v=1',
      title: '8i | Careers'
    })
    .when('/ads', {
       templateUrl: '/static/new_site/ads.html',
       title: '8i | Ads'
    })
    .when('/holo', {
      templateUrl: '/static/new_site/holo.html?v=1',
      title: '8i | Holo App'
    })
    .when('/holo/beta', {
      templateUrl: '/static/new_site/holo_beta.html',
      title: '8i | Holo Beta'
    })
    .when('/install', {
      templateUrl: '/static/new_site/install.html',
      title: '8i | Install'
    })
    .when('/about', {
      templateUrl: '/static/new_site/team.html?v=2',
      title: '8i | Team'
    })
    .when('/privacy', {
      templateUrl: '/static/new_site/privacy.html',
      title: '8i | Privacy Policy'
    })
    .when('/terms', {
      templateUrl: '/static/new_site/terms.html',
      title: '8i | Terms of Use'
    })
    .when('/holo/privacy', {
      templateUrl: '/static/new_site/privacy.html',
      title: '8i | Holo Privacy Policy'
    })
    .when('/holo/terms', {
      templateUrl: '/static/new_site/terms.html',
      title: '8i | Holo Terms of Use'
    })
    .otherwise({
      templateUrl: '/static/new_site/404.html',
      title: '8i | Page not found'
    });
})
.filter('trusted', function ($sce) {
  return function(url) {
    return $sce.trustAsResourceUrl(url);
  };
})
.run(function($location, $rootScope, config) {
  // variables on $rootScope will be available for reading from all $scopes
  // through scope inheritance.
  if (config.jobsUrl) {
    console.info("%cAre you a developer? We're hiring, check out " + config.jobsUrl, "color: #D43A65;");
  }
  $rootScope.goto = function(loc) {
    window.location = loc;
  }
  $rootScope.config = config;
  $rootScope.api_url = config.API_URL;
  $rootScope.$on('$routeChangeSuccess', function (event, current, previous) {
    ga('send', 'pageview', $location.path());
    if (current.hasOwnProperty('$$route')) {
      $rootScope.title = current.$$route.title;
    }
  });
})
.config(function($httpProvider) {
  // So we remain logged in when making ajax requests to the API_URL.
  $httpProvider.interceptors.push('AuthInterceptor');
})
.factory('AuthInterceptor', function ($injector, $q) {
  return {
    response: function(response) {
      if (response.data.data) {
        // Handle API's which always return json with a data object.
        response.data = response.data.data
      }
      return $q.resolve(response);
    },
    responseError: function (response) {
      console.error('Bad API call', response)
      // Fail the request.
      return $q.reject(response);
    }
  };
});
