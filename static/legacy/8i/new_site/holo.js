var HoloController = function(config, $scope, $window) {
  this.$scope = $scope;
  window.ctrl = this;

  var iOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
  var orientationSupported = (typeof window.orientation !== 'undefined')
  $scope.smallScreen = window.innerWidth < 600;

  // Mobile device can't auto play the background video so we use an image instead.
  $scope.backgroundVideo = !iOS && !orientationSupported && !$scope.smallScreen;
  $scope.backgroundVideoSrc = config.AMAZON_S3_URL + '8i+Website/Videos/holo_bg_v9.mp4';

  $scope.mainVideoSrc = config.AMAZON_S3_URL + '8i+Website/Videos/holo_v6.mp4';

  // Register this only once per controller load.
  var exitHandler = this.exitHandler.bind(this);
  document.addEventListener('webkitfullscreenchange', exitHandler);
  document.addEventListener('mozfullscreenchange', exitHandler);
  document.addEventListener('fullscreenchange', exitHandler);
  document.addEventListener('MSFullscreenChange', exitHandler);

  this.logos = [{
    imgSrc: '/static/img/new_site/holo/logos/01_cnet.png',
    link: 'https://www.cnet.com/news/holo-app-is-like-a-cross-between-pokemon-go-and-snapchat/'
  }, {
    imgSrc: '/static/img/new_site/holo/logos/02_theverge.png',
    link: 'http://www.theverge.com/2017/2/13/14600662/8i-holograms-ar-vr-mobile-app-holo-google-tango'
  }, {
    imgSrc: '/static/img/new_site/holo/logos/03_variety.png',
    link: 'http://variety.com/2017/digital/news/9i-series-b-holo-app-1201986988/'
  }, {
    imgSrc: '/static/img/new_site/holo/logos/04_fastcompany.png',
    link: 'https://www.fastcompany.com/3068114/innovation-agents/photo-realistic-holograms-are-about-to-get-a-whole-lot-more-real'
  }, {
    imgSrc: '/static/img/new_site/holo/logos/05_recode.png',
    link: 'https://www.recode.net/2017/3/20/14982882/8i-hologram-lauren-goode-code-media'
  }]

  this.limitedReleaseCountry = config.limitedReleaseCountry;
}

HoloController.prototype.exitHandler = function() {
  var isFullscreen = document.webkitIsFullScreen;
  isFullscreen |= document.mozFullScreen;
  isFullscreen |= document.msFullscreenElement;
  console.log(isFullscreen);
  if (!isFullscreen) {
    // pause on exit fullscreen.
    this.mainVideo.pause();
    // And return to the start.
    this.mainVideo.currentTime = 0;
  }
}

HoloController.prototype.trackGA = function(label) {
  ga('send', 'event', 'Click', 'holo', label);
}

HoloController.prototype.playVideoFullscreen = function() {
  ga('send', 'event', 'Click', 'holo', 'playVideo');

  // Make a video full screen and start playing it.
  this.mainVideo = $('#mainVideo')[0];
  // Start from the beginning.
  this.mainVideo.currentTime = 0;
  this.mainVideo.play();
  this.mainVideo.addEventListener('ended', function() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }, false);

  if (this.mainVideo.requestFullscreen) {
    this.mainVideo.requestFullscreen();
  } else if (this.mainVideo.mozRequestFullScreen) {
    this.mainVideo.mozRequestFullScreen();
  } else if (mainVideo.webkitRequestFullscreen) {
    this.mainVideo.webkitRequestFullscreen();
  } else {
    // Maybe just add a fullscreen class?
    // Make the video top and visible.
    // Test on mobile first.
  }
}

angular.module("holo", [
  '8iTemplate',
  'config',
  'ngRoute'
])
.controller('HoloController', HoloController)
;
