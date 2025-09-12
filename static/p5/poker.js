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
  static NAME_VALUES = [0, 'Ace','2','3','4','5','6','7','8','9','10','Jack','Queen','King'];
  static IMAGE_VALUES = [0, '1','2','3','4','5','6','7','8','9','10','J','Q','K'];
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
    var values = [];
    for (var i = 0; i <= 14; i++) {
      values.push(0);
    }
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
      let count = values[card.value];
      if (count > maxCount) {
        maxCount = count;
        bestCountCard = card;
      } else if (count === maxCount) {
        // Ace is high, so nothing is bigger than 1.
        if (bestCountCard.value > 1) {
          if (bestCountCard.value < card.value || card.value === 1) {
            bestCountCard = card;
          }
        }
      }
      suits[card.suit]++;
      count = suits[card.suit];
      if (count >= 5) {
        // high card for this suit?
        flushSuit = card.suit;
      }
    });

    // Straight check?

    if (maxCount === 1) {
      player.setScore('High card ' + Card.NAME_VALUES[bestCountCard.value]);
      return;
    }

    // Check 2,3 of a kind
    if (maxCount === 2) {
      let pair2 = false;
      for (let [num, value] of values.entries()) {
        if (num === bestCountCard.value) {
          // Skip the same value as we know we have a pair of them.
          continue;
        }
        // If there is a pair of anything else, then its a 2 pair.
        if (value === 2) {
          pair2 = num;
          break;
        }
      }
      if (pair2) {
        player.setScore('2 Pair of ' + Card.NAME_VALUES[bestCountCard.value] + '\'s and ' + Card.NAME_VALUES[pair2] + '\'s');
      } else {
        player.setScore('Pair of ' + Card.NAME_VALUES[bestCountCard.value] + '\'s');
      }

    }
    if (maxCount === 3) {
      let fullHouse = false;
      for (let [num, value] of values.entries()) {
        // If there is a pair of anything else, then its a full house.
        if (value === 2) {
          fullHouse = num;
          break;
        }
      }
      if (fullHouse) {
        player.setScore('Full House ' + Card.NAME_VALUES[bestCountCard.value] + '\'s and ' + Card.NAME_VALUES[fullHouse] + '\'s');
      } else {
        player.setScore('3 of a kind ' + Card.NAME_VALUES[bestCountCard.value] + '\'s');
      }
    }
    if (flushSuit) {
      player.setScore('Flush ' + flushSuit + ' ' + Card.NAME_VALUES[bestCountCard.value] + ' high');
    }
    // Check 4 of a kind.
    if (maxCount === 4) {
      player.setScore('4 of a kind (' + Card.NAME_VALUES[bestCountCard.value] + '\'s)');
    }

    // TODO check straight flush/royal flush?
  };

  click(x, y) {
    if (x > 100 && x < 200) {
      if (y > 150 && y < 170) {
        this.makeGame();
      }
    }
  }

  show() {

    //button
    stroke(0);
    noFill();
    rect(100, 150, 100, 20);
    fill(0);
    noStroke();
    text("Deal again", 105, 165);

    for (let i = 0; i < this.flop.length; i++) {
      this.flop[i].show(100 * i, 50);
    }

    for (let i = 0; i < this.players.length; i++) {
      this.players[i].showHand(150 * i, 250);
    }
  }
}

let game;
export function preload() {
  var cards = [];
  for (var i=0;i<52;i++) {
    let suit = Card.SUITS[Math.floor(i / 13)];
    let value = (i % 13) + 1;
    let name = (suit.charAt(0) + Card.IMAGE_VALUES[value]).toLowerCase();
    let image = loadImage('/static/img/cards_png/' + name + '.png');
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

export function mouseClicked() {
  game.click(mouseX, mouseY);
}