import enum

from models import db
from sqlalchemy.orm import relationship

def createCard():
    values = ['ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king']
    suits = ['hearts', 'dimonds', 'clubs', 'spades']
    enums = {v + s: (i + 1, v, s) for s in suits for i, v in enumerate(values)}
    return type('Card', (enum.Enum,), enums)

Card = createCard()


class CardGame(db.Model):
    __tablename__ = 'card_game'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

class CardPlayer(db.Model):
    __tablename__ = 'card_player'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    user = relationship("User")

    game_id = db.Column(db.Integer, db.ForeignKey('card_game.id'))
    game = relationship("CardGame", backref="players")

    # List of Card.
    hand = db.Column(db.String)

    def setCards(self, cards):
        # Convert to string.
        self.cards = ','.join([str(c) for c in cards])

    def getCards(self):
        # Convert to list of Card.
        return [getattr(Card, c) for c in self.cards.split(',')]
