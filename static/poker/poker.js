var MyController = function($scope, $timeout) {
  this.players = [];

  // Use timeout to disconnect construction of this controller with init logic.
  $timeout(this.redeal.bind(this), 0);
}

MyController.prototype.redeal = function() {
  this.players = [];
  this.makeGame();

  this.players.forEach(this.calculateHand.bind(this));
}

MyController.prototype.makeGame = function() {
  this.players.push({name: 'mike', hand: []});
  this.players.push({name: 'jane', hand: []});
  this.players.push({name: 'bob', hand: []});
  var suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
  var values = [0, '1','2','3','4','5','6','7','8','9','10','j','q','k'];
  var cards = [];
  for (var i=0;i<52;i++) {
    var card = {
      value: (i % 13) + 1,
      suit: suits[Math.floor(i / 13)]
    }
    card['img'] = '/static/img/cards_png/' + card.suit[0].toLowerCase() + values[card.value] + '.png';
    cards.push(card);
  }
  shuffle(cards);
  // Deal 2 cards each.
  for (var i=0;i<2;i++) {
    angular.forEach(this.players, function(player) {
      player.hand.push(cards.pop());
    });
  }

  this.flop = [
    cards.pop(), cards.pop(), cards.pop(), cards.pop(), cards.pop()
  ];

  this.cards = cards;
};

MyController.prototype.calculateHand = function(player) {
  var cards = player.hand.concat(this.flop);
  var values = Array.apply(null, new Array(14)).map(Number.prototype.valueOf,0);
  var suits = {
    'Hearts': 0,
    'Diamonds': 0,
    'Clubs': 0,
    'Spades': 0
  };
  var maxCount = 0;
  var bestCountCard = cards[0];
  var flushSuit = null;
  cards.forEach(function(card) {
    values[card.value]++;
    var count = values[card.value];
    if (count > maxCount) {
      maxCount = count;
      bestCountCard = card;
    } else if (count == maxCount) {
      if (bestCountCard.value < card.value) {
        bestCountCard = card;
      }
    }
    suits[card.suit]++;
    var count = suits[card.suit];
    if (count >= 5) {
      // high card for this suit?
      flushSuit = card.suit;
    }
  });

  // Straight check?
  // Full house check?

  if (maxCount == 1) {
    player.handValue = 'High card (' + bestCountCard.value + ')';
    return;
  }
  player.handValue = maxCount + ' of a kind (' + bestCountCard.value + '\'s)';
  if (flushSuit) {
    // If 4's then don't overwrite.
    player.handValue = 'Flush';
  }
};

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

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

angular.module("poker", [
  'ngRoute',
])
.controller('MyController', MyController)
.config(function($locationProvider, $routeProvider) {
  // $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    templateUrl: '/static/poker/poker.tpl.html'
  })
})
;