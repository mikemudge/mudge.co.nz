from auth.provider import oauth
from flask import request
from ..models import Rock1500Artist
from ..serializers import Rock1500ArtistSchema
from shared.views.crud import DBModelView

class Rock1500ArtistView(DBModelView):
    model = Rock1500Artist
    schema = Rock1500ArtistSchema

    @oauth.require_oauth('rock')
    def get(self, pk=None):
        if pk is None:
            return self.get_multiple()
        else:
            return self.get_one(pk)

    def get_multiple(self):
        query = Rock1500Artist.query

        query = query.order_by(Rock1500Artist.name)

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
            return self.edit(Rock1500Artist.query.get(pk))
        else:
            return self.create()
