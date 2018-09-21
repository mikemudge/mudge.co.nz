from shared.views.crud import crud
from .views.importer import ImportView
from .views.songs import Rock1500SongView
from .views.picks import RockPicksView
from .views.next import NextSongsView
from .views.next import RecentSongsView

def routes(app):
    crud(app, 'rock1500/song', Rock1500SongView)

    app.add_url_rule('/rock1500/import', view_func=ImportView.as_view('import_rock1500'))

    app.add_url_rule('/api/rock1500/picks', view_func=RockPicksView.as_view('rock1500_picks'))

    app.add_url_rule('/api/rock1500/next', view_func=NextSongsView.as_view('rock1500_next'))

    app.add_url_rule('/api/rock1500/recent', view_func=RecentSongsView.as_view('rock1500_recent'))
