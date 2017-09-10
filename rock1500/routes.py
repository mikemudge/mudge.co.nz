from auth.provider import oauth
from flask import request
from rock1500.models import Rock1500Song, Rock1500Artist
from rock1500.views.importer import ImportView
from rock1500.views.picks import RockPicksView
from rock1500.serializers import Rock1500SongSchema
from shared.views.crud import DBModelView, crud
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

        query = query.limit(10)

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

def routes(app):
    crud(app, 'rock1500/song', Rock1500SongView)

    app.add_url_rule('/rock1500/import', view_func=ImportView.as_view('import_rock1500'))

    app.add_url_rule('/api/rock1500/picks', view_func=RockPicksView.as_view('rock1500_picks'))
