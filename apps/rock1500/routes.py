from shared.views.crud import crud
from .views.album import Rock1500AlbumView
from .views.artist import Rock1500ArtistView
from .views.importer import ImportView
from .views.songs import Rock1500SongView
from .views.picks import RockPicksView
from .views.next import NextSongsView

def routes(app):
    crud(app, 'rock1500/album', Rock1500AlbumView)
    crud(app, 'rock1500/artist', Rock1500ArtistView)
    crud(app, 'rock1500/song', Rock1500SongView)

    app.add_url_rule('/rock1500/import', view_func=ImportView.as_view('import_rock1500'))

    app.add_url_rule('/api/rock1500/picks', view_func=RockPicksView.as_view('rock1500_picks'))

    app.add_url_rule('/api/rock1500/next', view_func=NextSongsView.as_view('rock1500_next'))
