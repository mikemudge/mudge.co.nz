from marshmallow import fields
from .models import Tournament, Team, Round, Match, MatchResult
from shared.marshmallow import BaseSchema

class TeamSchema(BaseSchema):
    class Meta:
        model = Team
        exclude = ['date_created', 'tournament']

class MatchResultSchema(BaseSchema):
    class Meta:
        model = MatchResult

class MatchSchema(BaseSchema):
    class Meta:
        model = Match
        exclude = ['date_created', 'round']
    awayTeam = fields.Nested(TeamSchema)
    homeTeam = fields.Nested(TeamSchema)

    result = fields.Nested(MatchResultSchema)

class RoundSchema(BaseSchema):
    class Meta:
        model = Round
        exclude = ['date_created', 'id', 'tournament']
    matches = fields.Nested(MatchSchema, many=True)

class TournamentSchema(BaseSchema):
    class Meta:
        model = Tournament
        exclude = ['date_created']

    name = fields.Str(required=True)
    teams = fields.Nested(TeamSchema, many=True)
    rounds = fields.Nested(RoundSchema, many=True, dump_only=True)
