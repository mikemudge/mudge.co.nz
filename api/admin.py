from api.models import Biker, Ride, Walk, Walker
from auth.custom_flask_admin import CustomAdminIndexView
from auth.login_manager import login_manager
from auth.models import Client, Scope, User, Profile
from flask_admin import Admin
from rock1500.models import Rock1500Album, Rock1500Song, Rock1500Artist, Rock1500Pick
from flask_admin.contrib.sqla import ModelView
from flask_login import current_user
from jinja2 import Markup
from shared.database import db
from tournament_app.models import Tournament, Team, Match, Round
from trail.models import Trail, TrailProgress, TrailProfile

from wtforms.fields import SelectField, IntegerField

class BaseView(ModelView):
    form_excluded_columns = ['date_created']
    can_view_details = True
    can_export = True
    # can_create = True
    # can_edit = True

    def is_accessible(self):
        if not current_user.is_authenticated:
            return False

        return True

    def format_image(view, context, model, name):
        value = getattr(model, name)
        if not value:
            return ''

        return Markup('<img class="img-admin-list-view" src="%s">' % getattr(model, name))

    def format_datetime(view, context, model, name):
        date = getattr(model, name)
        if not date:
            return ''

        timezone = current_user.get_preferred_timezone()
        # Change date into users preferred time.
        date = date.astimezone(timezone)
        result = date.strftime('%Y-%m-%d %H:%M %Z')
        return result

    # Creates a view formatter which links to a details endpoint.
    @classmethod
    def _to_view_url(cls, endpoint):
        def _instance_view_url(view, context, model, name):
            value = getattr(model, name)
            if not value:
                # No profile
                return ''

            return Markup('<a href="%s">%s</a>') % (view.get_url('%s.details_view' % endpoint, id=value.id), value)

        return _instance_view_url

    column_formatters = {
        'date_created': format_datetime,
        'date_updated': format_datetime,
    }

class UserView(BaseView):
    column_exclude_list = ['password_hash']
    form_excluded_columns = ['date_created', 'password_hash']
    can_create = False

    column_formatters = {
        'date_created': BaseView.format_datetime,
        'profile': BaseView._to_view_url('profile')
    }

class ClientView(BaseView):
    form_excluded_columns = ['date_created', 'client_id', 'client_secret']

class ProfileView(BaseView):
    column_formatters = {
        'date_created': BaseView.format_datetime,
        'image': BaseView.format_image,
    }

class TrailView(BaseView):
    form_extra_fields = {
        'activity': SelectField(label='Activity', choices=Trail.ACTIVITIES),
    }

    def on_form_prefill(self, form, id):
        # Select Fields don't prefill right.
        form.activity.data = form.activity.object_data.code


class RockArtistView(BaseView):
    column_exclude_list = ['date_created']

    column_searchable_list = ['name']

class RockSongView(BaseView):
    column_exclude_list = ['date_created']

    column_searchable_list = ['title', 'rank2017', 'rank2016', 'rank2015', 'artist.name', 'album.name']

    column_filters = ['rank2017', 'rank2016']

    def _int_format(view, context, model, name):
        value = getattr(model, name)
        if not value:
            return ''

        return int(value)

    column_formatters = {
        # 'rank2016': _int_format
    }

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

def routes(app):

    login_manager.init_app(app)

    admin = Admin(
        app,
        name='Mudge.co.nz',
        # name='Home',
        index_view=CustomAdminIndexView(
            url='/flask-admin',
            endpoint='admin'
        ),
        template_mode='bootstrap3',
        static_url_path="static",
        base_template='admin/master.html'
    )

    admin.add_view(ClientView(Client, db.session, category="Auth"))
    admin.add_view(BaseView(Scope, db.session, category="Auth"))
    admin.add_view(UserView(User, db.session, category="Auth"))
    admin.add_view(ProfileView(Profile, db.session, category="Auth"))

    admin.add_view(TrailView(Trail, db.session, category="Trail"))
    admin.add_view(BaseView(TrailProgress, db.session, category="Trail"))
    admin.add_view(BaseView(TrailProfile, db.session, category="Trail"))

    admin.add_view(BaseView(Tournament, db.session, category="Tournament"))
    admin.add_view(BaseView(Match, db.session, category="Tournament"))
    admin.add_view(BaseView(Round, db.session, category="Tournament"))
    admin.add_view(BaseView(Team, db.session, category="Tournament"))

    admin.add_view(BaseView(Walker, db.session, category="Old"))
    admin.add_view(BaseView(Walk, db.session, category="Old"))
    admin.add_view(BaseView(Biker, db.session, category="Old"))
    admin.add_view(BaseView(Ride, db.session, category="Old"))

    admin.add_view(RockAlbumView(Rock1500Album, db.session, category="Rock 1500"))
    admin.add_view(RockArtistView(Rock1500Artist, db.session, category="Rock 1500"))
    admin.add_view(RockSongView(Rock1500Song, db.session, category="Rock 1500"))
    admin.add_view(RockPickView(Rock1500Pick, db.session, category="Rock 1500"))
