var MainController = function($scope, $timeout, $location, setupService) {
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
  this.removed = [];
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

MainController.prototype.removeCard = function() {
  this.removed.push(this.card);
  this.card = this.cards.pop();
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