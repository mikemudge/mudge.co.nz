var MyController = function($scope, $timeout, $location) {
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
    cards.push({
      img: '/static/img/cards_png/jr.png'
    })
    cards.push({
      img: '/static/img/cards_png/jb.png'
    })
  }
  this.shuffle(cards);
  this.cards = cards;
    cards.pop();
  this.removed = [];
};

MyController.prototype.shuffle = function(array) {
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

MyController.prototype.removeCard = function() {
  item = this.cards.pop();
  if (item) {
    this.removed.push(item);
  }
}

MyController.prototype.undo = function() {
  var item = this.removed.pop();
  if (item) {
    this.cards.push(item);
  }
}

angular.module("cards-workout", [
  'ngRoute',
])
.controller('MyController', MyController)
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    templateUrl: '/static/cards-workout/cards.tpl.html'
  })
})
;