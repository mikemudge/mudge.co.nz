from cards.card_models import Card

def shuffleAndDeal(cardGame, cards=None):
    print cardGame.players, cards

    for player in cardGame.players:
        player.setCards([
            Card.acespades
        ])
