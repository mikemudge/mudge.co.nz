class Player {
  constructor(name) {
    this.name = name;
    this.hand = [];
    this.score = '';
  }

  addCard(card) {
    this.hand.push(card);
  }

  setScore(score) {
    this.score = score;
  }

  showHand(x, y) {
    for (let i = 0; i < this.hand.length; i++) {
      this.hand[i].show(x + i * 15, y);
    }

    text(this.score, x + 5, y + 115);
  }
}

class Card {
  static SUITS = ["Hearts", "Diamonds", "Clubs", "Spades"];
  static VALUES = [0, '1','2','3','4','5','6','7','8','9','10','j','q','k'];
  constructor(image, suit, value) {
    this.image = image;
    this.suit = suit;
    this.value = value;
  }

  show(x, y) {
    image(this.image, x, y);
  };
}

class PokerGame {
  constructor(cards) {
    this.cards = cards;
    this.flop = [];
    this.players = [];
    this.deck = [];
    this.resetDeck();
  }

  resetDeck() {
    this.deck = [];
    for (let card of this.cards) {
      // put all cards in the deck.
      this.deck.push(card);
      // shuffle deck?
      this.shuffle(this.deck);
    }
  }

  shuffle(cards) {
    for (let i = 0; i < cards.length; i++) {
      let r = floor(random(cards.length));
      let tmp = cards[i];
      cards[i] = cards[r];
      cards[r] = tmp;
    }
  }

  draw(num) {
    let cards = [];
    for (let i = 0; i < num; i++) {
      let card = this.deck.pop();
      if (!card) {
        throw new Error("Draw from empty deck");
      }
      cards.push(card);
    }
    return cards;
  }

  makeGame() {
    this.players = [
      new Player('mike'),
      new Player('jane'),
      new Player('bob')
    ];

    this.resetDeck();

    // Deal 2 cards each.
    for (var i=0;i<2;i++) {
      for (let player of this.players) {
        player.addCard(this.deck.pop());
      }
    }

    this.flop = this.draw(5);

    for (let player of this.players) {
      this.calculateHand(player);
    }
  }

  calculateHand(player) {
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
      player.setScore('High card (' + bestCountCard.value + ')');
      return;
    }
    player.setScore(maxCount + ' of a kind (' + bestCountCard.value + '\'s)');
    if (flushSuit) {
      // If 4's then don't overwrite.
      player.setScore('Flush');
    }
  };

  show() {
    for (let i = 0; i < this.flop.length; i++) {
      this.flop[i].show(100 * i, 50);
    }

    for (let i = 0; i < this.players.length; i++) {
      this.players[i].showHand(120 * i, 250);
    }
  }
}

let game;
export function preload() {
  var cards = [];
  for (var i=0;i<52;i++) {
    let suit = Card.SUITS[Math.floor(i / 13)];
    let value = (i % 13) + 1;
    let image = loadImage('/static/img/cards_png/' + suit.charAt(0).toLowerCase() + Card.VALUES[value] + '.png');
    cards.push(new Card(image, suit, value));
  }
  game = new PokerGame(cards);

  // Start the first game.
  game.makeGame();
}

export function setup() {
  createCanvas(windowWidth, windowHeight);
}

export function draw() {
  background(255);

  game.show();
}
