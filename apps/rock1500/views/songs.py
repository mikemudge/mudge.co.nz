from auth.provider import oauth
from flask import request
from ..models import Rock1500Song, Rock1500Artist
from ..serializers import Rock1500SongSchema
from shared.views.crud import DBModelView
from sqlalchemy import or_

class Rock1500SongView(DBModelView):
    model = Rock1500Song
    schema = Rock1500SongSchema

    @oauth.require_oauth('rock')
    def get(self, pk=None):
        if pk is None:
            return self.get_multiple()
        else:
            return self.get_one(pk)

    def get_multiple(self):
        query = Rock1500Song.query

        search = request.args.get('search')

        if search:
            query = query.join(Rock1500Artist)
            query = query.filter(or_(
                Rock1500Song.title.ilike("%" + search + "%"),
                Rock1500Artist.name.ilike("%" + search + "%")
            ))
            query = query.order_by(Rock1500Song.rank2017)
        else:
            # Support override for sort?
            query = query.order_by(Rock1500Song.rankThisYear)

            limit = request.args.get('limit', 20)
            query = query.limit(limit)

            start = request.args.get('start', 0)
            query = query.offset(start)

        results = query.all()
        listSchema = self.schema(many=True)
        return listSchema.response(results)

    @oauth.require_oauth('rock')
    def delete(self, pk):
        return self.remove(pk)

    @oauth.require_oauth('rock')
    def post(self, pk=None):
        # Edit or Create.
        if pk:
            return self.edit(Rock1500Song.query.get(pk))
        else:
            return self.create()
