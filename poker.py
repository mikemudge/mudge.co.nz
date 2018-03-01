from flask import Blueprint, jsonify

poker_bp = Blueprint('poker', __name__)

@poker_bp.route('/')
def main_page():
    return jsonify({
        'thing': 'yup'
    })

class Suit:
    HEARTS = 0
    DIMONDS = 1
    SPADES = 2
    CLUBS = 3

@poker_bp.route('/getOdds')
def calculateValue():
    # data = request.json
    # cards = data['cards']
    cards = [{
        'value': 1, 'suit': Suit.HEARTS
    }, {
        'value': 1, 'suit': Suit.DIMONDS
    }, {
        'value': 1, 'suit': Suit.SPADES
    }, {
        'value': 1, 'suit': Suit.CLUBS
    }]

    print(cards)
