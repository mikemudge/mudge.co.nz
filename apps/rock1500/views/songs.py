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
        orderField = Rock1500Song.rankThisYear

        if search:
            query = query.join(Rock1500Artist)
            query = query.filter(or_(
                Rock1500Song.title.ilike("%" + search + "%"),
                Rock1500Artist.name.ilike("%" + search + "%")
            ))
            orderField = Rock1500Song.rank2018

        artist_id = request.args.get('artist_id', None)
        if artist_id:
            query = query.filter_by(artist_id=artist_id)
            orderField = Rock1500Song.rank2018

        album_id = request.args.get('album_id', None)
        if album_id:
            query = query.filter_by(album_id=album_id)
            orderField = Rock1500Song.rank2018

        query = query.order_by(orderField)

        start = request.args.get('start', 0)
        if start:
            query = query.offset(start)

        limit = request.args.get('limit', 20)
        query = query.limit(limit)

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
