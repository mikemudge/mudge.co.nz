from flask_marshmallow import Marshmallow
from runner import app
from tournament.models import Tournament, Team, Round, Match

ma = Marshmallow(app)

class TournamentSchema(ma.ModelSchema):
    class Meta:
        model = Tournament

class TeamSchema(ma.ModelSchema):
    class Meta:
        model = Team

class RoundSchema(ma.ModelSchema):
    class Meta:
        model = Round

class MatchSchema(ma.ModelSchema):
    class Meta:
        model = Match
