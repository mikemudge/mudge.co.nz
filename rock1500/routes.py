from shared.views.crud import crud
from rock1500.views.importer import ImportView
from rock1500.views.songs import Rock1500SongView
from rock1500.views.picks import RockPicksView

def routes(app):
    crud(app, 'rock1500/song', Rock1500SongView)

    app.add_url_rule('/rock1500/import', view_func=ImportView.as_view('import_rock1500'))

    app.add_url_rule('/api/rock1500/picks', view_func=RockPicksView.as_view('rock1500_picks'))
