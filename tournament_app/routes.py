from auth.provider import oauth

from tournament_app.models import Tournament, Team, Round, Match
from tournament_app.serialize import TournamentSchema, TeamSchema, RoundSchema, MatchSchema
from tournament_app.views.tournament import tournament_bp
from shared.views.crud import DBModelView, crud

class TournamentView(DBModelView):
    model = Tournament
    schema = TournamentSchema

    @oauth.require_oauth('tournament')
    def get(self, pk=None):
        super(TournamentView, self).get(pk)

class TeamView(DBModelView):
    model = Team
    schema = TeamSchema

class RoundView(DBModelView):
    model = Round
    schema = RoundSchema

class MatchView(DBModelView):
    model = Match
    schema = MatchSchema

def routes(app):
    crud(app, 'tournament/tournament', TournamentView)
    crud(app, 'tournament/team', TeamView)
    crud(app, 'tournament/match', MatchView)
    crud(app, 'tournament/round', RoundView)

    app.register_blueprint(tournament_bp, url_prefix='/api/tournament/')
