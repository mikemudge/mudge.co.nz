from auth.provider import oauth

from tournament_app.models import Tournament, Team, Round, Match, MatchResult
from tournament_app.serialize import TournamentSchema, TeamSchema, RoundSchema, MatchSchema, MatchResultSchema
from tournament_app.views.tournament import tournament_bp
from shared.views.crud import DBModelView, crud

class TournamentView(DBModelView):
    model = Tournament
    schema = TournamentSchema

    @oauth.require_oauth('tournament')
    def get(self, pk=None):
        return super(TournamentView, self).get(pk)

    @oauth.require_oauth('tournament')
    def delete(self, pk):
        return self.remove(pk)

    @oauth.require_oauth('tournament')
    def post(self, pk=None):
        # Edit or Create.
        if pk:
            return self.edit(Tournament.query.get(pk))
        else:
            return self.create()

class TeamView(DBModelView):
    model = Team
    schema = TeamSchema

class RoundView(DBModelView):
    model = Round
    schema = RoundSchema

class MatchView(DBModelView):
    model = Match
    schema = MatchSchema

    @oauth.require_oauth('tournament')
    def post(self, pk=None):
        # Edit or Create.
        if pk:
            instance = Match.query.get(pk)
            print instance
            return self.edit(instance=instance)
        else:
            return self.create()

class MatchResultView(DBModelView):
    model = MatchResult
    schema = MatchResultSchema

def routes(app):
    crud(app, 'tournament/tournament', TournamentView)
    crud(app, 'tournament/team', TeamView)
    crud(app, 'tournament/match', MatchView)
    crud(app, 'tournament/round', RoundView)
    crud(app, 'tournament/matchresult', MatchResultView)

    app.register_blueprint(tournament_bp, url_prefix='/api/tournament/')
