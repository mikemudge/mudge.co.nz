import models

from base_test_case import BaseTestCase
from cards import card_logic
from cards.card_models import Card, CardGame, CardPlayer
from models import db

class TestFirst(BaseTestCase):

    def test_card_enum(self):
        (value, value_name, suit) = Card.fourspades.value
        self.assertEquals(value, 4)
        self.assertEquals(value_name, 'four')
        self.assertEquals(suit, 'spades')

    def test_card_player(self):
        self.newUser('mike', 'mike')

        user = models.User.query.one()

        player1 = CardPlayer(user=user)
        player2 = CardPlayer(user=user)
        game = CardGame(players=[player1, player2])

        card_logic.shuffleAndDeal(game, 5)

        db.session.add(game)
        db.session.commit()

        out = CardPlayer.query.first()
        game = CardGame.query.one()

        self.assertEquals(models.simpleSerialize(out), {
            'id': 1,
            'game_id': 1,
            'user_id': game.id,
            'cards': 'Card.acespades'
        })
