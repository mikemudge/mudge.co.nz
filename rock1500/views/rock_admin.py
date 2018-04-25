from shared.admin import admin
from shared.admin import BaseView
from shared.database import db

from rock1500.models import Rock1500Album, Rock1500Song, Rock1500Artist, Rock1500Pick
from wtforms.fields import IntegerField

class RockArtistView(BaseView):
    column_exclude_list = ['date_created']

    column_searchable_list = ['name']

class RockSongView(BaseView):
    column_exclude_list = ['date_created']

    column_searchable_list = ['title', 'rank2017', 'rank2016', 'rank2015', 'artist.name', 'album.name']

    column_filters = ['rank2017', 'rank2016']

    form_overrides = dict(rank2016=IntegerField)

class RockAlbumView(BaseView):
    column_exclude_list = ['date_created']

    column_searchable_list = ['name']

    column_formatters = {
        'cover_art_url': BaseView.format_image,
    }

class RockPickView(BaseView):
    column_exclude_list = ['date_created']

    column_searchable_list = ['song.title']

def admin_routes():
    admin.add_view(RockAlbumView(Rock1500Album, db.session, category="Rock 1500"))
    admin.add_view(RockArtistView(Rock1500Artist, db.session, category="Rock 1500"))
    admin.add_view(RockSongView(Rock1500Song, db.session, category="Rock 1500"))
    admin.add_view(RockPickView(Rock1500Pick, db.session, category="Rock 1500"))
