from auth.provider import oauth

from rock1500.models import Rock1500Song
from rock1500.views.importer import ImportView
from rock1500.views.picks import RockPicksView
from rock1500.serializers import Rock1500SongSchema
from shared.views.crud import DBModelView, crud

class Rock1500SongView(DBModelView):
    model = Rock1500Song
    schema = Rock1500SongSchema

    @oauth.require_oauth('rock')
    def get(self, pk=None):
        return super(Rock1500SongView, self).get(pk)

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
