from .models import Tournament, Team, Round, Match
from .serialize import TournamentSchema, TeamSchema, RoundSchema, MatchSchema
from .views.tournament import tournament_bp
from shared.views.crud import DBModelView, crud

class TournamentView(DBModelView):
    model = Tournament
    schema = TournamentSchema

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
