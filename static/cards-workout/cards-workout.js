var MainController = function($scope, $interval, $location, setupService) {
  window.ctrl = this;
  this.config = setupService.getConfig();
  var suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
  var values = ['0', '1','2','3','4','5','6','7','8','9','10','j','q','k'];
  var cards = [];
  for (var i=0;i<52;i++) {
    var card = {
      value: (i % 13) + 1,
      suit: suits[Math.floor(i / 13)]
    }
    card['img'] = '/static/img/cards_png/' + card.suit[0].toLowerCase() + values[card.value] + '.png';
    cards.push(card);
  }
  if ($location.search().joker) {
    // Override with the param.
    this.config.jokers = $location.search().joker;
  }
  if (this.config.jokers) {
    cards.push({
      img: '/static/img/cards_png/jr.png'
    });
    cards.push({
      img: '/static/img/cards_png/jb.png'
    });
  }
  this.shuffle(cards);
  this.cards = cards;
  // Show the top card.
  this.card = cards.pop();
  // No autoplay on the first card, because we need a user input to play sound.
  this.timeToNextCard = 0;

  this.fast_mode = this.config.fast;
  this.autoPlay = this.config.autoPlay;
  this.removed = [];

  $interval(this.countdown.bind(this), 1000);

  // TODO add audio here?
  // var x = new Audio();
  var x = document.createElement("AUDIO");
  x.type = 'audio/mpeg';
  x.addEventListener('canplaythrough', function(audio) {
    // Loaded but we can't play it until a user interaction has happened.
    this.beepAudio = audio.target;
  }.bind(this));
  x.src = '/static/cards-workout/mp3/beep1.mp3';
};

MainController.prototype.shuffle = function(array) {
  var currentIndex = array.length;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    var randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    var temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

MainController.prototype.countdown = function() {
  console.log('counting');
  if (this.timeToNextCard > 0) {
    this.timeToNextCard--;
    if (this.timeToNextCard === 0) {
      this.removeCard();
    }
  }
}

MainController.prototype.stopAutoPlay = function() {
  this.autoPlay = false;
  this.timeToNextCard = 0;
}

MainController.prototype.startAutoPlay = function() {
  this.autoPlay = true;
  // give 5 seconds of leeway before flipping to the next card.
  this.timeToNextCard = 5;
}

MainController.prototype.removeCard = function() {
  this.removed.push(this.card);
  this.card = this.cards.pop();
  this.beepAudio.currentTime = 0;
  if (this.beepAudio.paused) {
    this.beepAudio.play();
  }

  if (this.autoPlay && this.card.value) {
    // 20 * 52 = 1040 seconds.
    // 4 * 4 * 91 = 1456 seconds.
    // which is about 40 minutes for a whole workout (excluding jokers).
    this.timeToNextCard = 20 + 4 * Math.min(10, this.card.value);
    if (this.fast_mode) {
      this.timeToNextCard = 5;
    }
  }
}

MainController.prototype.undo = function() {
  var item = this.removed.pop();
  if (item) {
    // Add the current card back onto the deck.
    this.cards.push(this.card);
    // Set the current card to the removed one.
    this.card = item;
  }
}

var SetupController = function(setupService, $location) {
  this.setupService = setupService;
  this.config = setupService.getConfig();
  this.$location = $location;
  this.suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
  // Default to not fast, as that is just a testing thing.
  this.fast = false;
}

SetupController.prototype.start = function() {
  this.setupService.setConfig(this.config);
  this.$location.path("play");
}

var SetupService = function() {
  this.config = {};
  var config = sessionStorage.getItem("cards-workout.config");
  if (config) {
    this.config = JSON.parse(config);
  }
}

SetupService.prototype.setConfig = function(config) {
  this.config = config;
  sessionStorage.setItem("cards-workout.config", JSON.stringify(config))
}

SetupService.prototype.getConfig = function() {
  return this.config;
}


angular.module("cards-workout", [
  'config',
  'ngRoute',
])
.controller('MainController', MainController)
.controller('SetupController', SetupController)
.service('setupService', SetupService)
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/play', {
    templateUrl: '/static/cards-workout/cards.tpl.html?v=' + config.version
  }).otherwise({
    templateUrl: '/static/cards-workout/setup.tpl.html?v=' + config.version
  })
})
;