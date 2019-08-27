from auth.provider import oauth
from flask import request
from flask.views import MethodView
from ..models import Rock1500Pick, Rock1500Song
from ..serializers import Rock1500PickSchema
from shared.database import db

class RockPicksView(MethodView):

    @oauth.require_oauth('rock')
    def get(self):

        query = Rock1500Pick.query.filter_by(user=request.oauth.user)

        result = query.all()

        schema = Rock1500PickSchema(many=True)

        return schema.response(result)

    @oauth.require_oauth('rock')
    def post(self):
        # Passed up songs in order?
        # Replace all picks for a user with these?

        picks = []
        for i, pick in enumerate(request.json['picks']):
            song = Rock1500Song.query.get(pick['song']['id'])
            if not song:
                raise Exception('No song found')
            picks.append(Rock1500Pick(
                song=song,
                position=i + 1,
                user=request.oauth.user
            ))

        # TODO verify no duplicate songs?
        print(picks)

        request.oauth.user.rock_picks = picks
        db.session.commit()

        schema = Rock1500PickSchema(many=True)
        return schema.response(picks)
