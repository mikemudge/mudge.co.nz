from auth.provider import oauth
from flask import request
from flask.views import MethodView
from ..models import Rock1500Song
from ..serializers import Rock1500SongSchema

class NextSongsView(MethodView):

    @oauth.require_oauth('rock')
    def get(self):

        limit = request.args.get('count', 25)

        query = Rock1500Song.query
        query = query.filter(
            Rock1500Song.rankThisYear.is_(None))

        # Not working?
        aboveRank = request.args.get('worst_rank', 1500)
        query = query.filter(
            Rock1500Song.rank2016 < aboveRank)

        # Order by the position they ranked last time.
        # 2016 is the last year we got all the ranks for.
        query.order_by(Rock1500Song.rank2016)

        result = query.limit(limit).all()

        schema = Rock1500SongSchema(many=True)

        return schema.response(result)

class RecentSongsView(MethodView):

    @oauth.require_oauth('rock')
    def get(self):

        limit = request.args.get('count', 25)

        query = Rock1500Song.query
        query = query.filter(
            Rock1500Song.rankThisYear.isnot(None))

        query = query.order_by(Rock1500Song.rankThisYear)

        result = query.limit(limit).all()

        schema = Rock1500SongSchema(many=True)

        return schema.response(result)
