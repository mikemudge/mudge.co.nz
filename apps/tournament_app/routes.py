from auth.provider import oauth
from flask import current_app, request

from .models import Tournament, Team, Round, Match, MatchResult
from .serialize import TournamentSchema, TeamSchema, RoundSchema, MatchSchema, MatchResultSchema
from .views.tournament import tournament_bp
from shared.views.crud import DBModelView, crud
from shared.database import db

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
            data = self.get_data()

            # Turn data into a DB object.
            s = TournamentSchema(session=db.session)
            instance = s.load(data)

            # instance is a map? not a Model?
            current_app.logger.debug("Created Tournament %s" % instance)

            db.session.add(instance)
            instance.creator = request.oauth.user
            self.save(instance)
            return s.response(instance)

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
            print(instance)
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
