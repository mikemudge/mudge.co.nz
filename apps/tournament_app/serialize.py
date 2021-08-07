from marshmallow import fields
from .models import Tournament, Team, Round, Match, MatchResult
from shared.marshmallow import BaseSchema
from shared.database import db

class TeamSchema(BaseSchema):
    class Meta:
        model = Team
        include_relationships = True
        load_instance = True
        exclude = ['date_created', 'tournament']

class MatchResultSchema(BaseSchema):
    class Meta:
        model = MatchResult
        include_relationships = True
        load_instance = True

class MatchSchema(BaseSchema):
    class Meta:
        model = Match
        exclude = ['date_created', 'round']
        include_relationships = True
        load_instance = True

    awayTeam = fields.Nested(TeamSchema)
    homeTeam = fields.Nested(TeamSchema)

    result = fields.Nested(MatchResultSchema)

class RoundSchema(BaseSchema):
    class Meta:
        model = Round
        exclude = ['date_created', 'id', 'tournament']
        include_relationships = True
        load_instance = True

    matches = fields.Nested(MatchSchema, many=True)

class TournamentSchema(BaseSchema):
    class Meta:
        model = Tournament
        exclude = ['date_created']
        include_relationships = True
        load_instance = True

    name = fields.Str(required=True)
    teams = fields.Nested(TeamSchema, many=True)
    rounds = fields.Nested(RoundSchema, many=True, dump_only=True)
