from auth.provider import oauth
from flask import request
from flask.views import MethodView
from ..models import Rock1500Pick
from ..serializers import Rock1500PicksSchema, Rock1500SongSchema
from shared.database import db

class RockPicksView(MethodView):

    @oauth.require_oauth('rock')
    def get(self):

        query = Rock1500Pick.query.filter_by(user=request.oauth.user)

        result = query.all()

        schema = Rock1500PicksSchema()

        return schema.response({'picks': result})

    @oauth.require_oauth('rock')
    def post(self):
        # Passed up songs in order?
        # create/update picks for a user?
        schema = Rock1500PicksSchema()

        song_schema = Rock1500SongSchema()
        picks = []
        for i, pick in enumerate(request.json['picks']):
            song = song_schema.parse(pick['song'])
            if not song:
                raise Exception('No song')
            picks.append(Rock1500Pick(
                song=song,
                position=i + 1,
                user=request.oauth.user
            ))

        # TODO verify no duplicate songs?
        print(picks)

        request.oauth.user.rock_picks = picks
        db.session.commit()

        return schema.response({'picks': picks})