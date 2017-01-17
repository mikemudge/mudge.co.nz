from flask import jsonify
from flask.views import MethodView

from tournament.models import Tournament

class DBModelView(MethodView):
    model = None

    def get(self, pk):
        print self.model
        if pk is None:
            # return a list of users
            result = self.model.query.all()
            # Use serializer on result.
            result, errors = self.schema.dump(result)
            return jsonify(result)
            pass
        else:
            # expose a single user
            result = DBModelView.model.get(pk=pk)
            # Use serializer on result.
            result, errors = self.schema.dump(result, many=True)
            return jsonify(result)

    def post(self):
        # create a new user
        pass

    def delete(self, user_id):
        # delete a single user
        pass

    def put(self, user_id):
        # update a single user
        pass

class TournamentView(DBModelView):
    model = Tournament

def routes(app):
    app.add_url_rule('/api/tournament', view_func=TournamentView.as_view('tournament'), defaults={'pk': None})
