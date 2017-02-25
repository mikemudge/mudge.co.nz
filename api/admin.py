import config

from api.custom_flask_admin import CustomAdminIndexView
from api.login_manager import login_manager
from api.models import Biker, Ride, Walk, Walker
from auth.models import Client, Scope, User, Profile
from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from flask_login import current_user
from shared.database import db
from tournament_app.models import Tournament, Team, Match, Round
from trail.models import TrailBiker, TrailRide, TrailWalk, TrailWalker


class BaseView(ModelView):
    form_excluded_columns = ['date_created']

    def is_accessible(self):
        if not current_user.is_authenticated:
            return False

        return True

class UserView(BaseView):
    column_exclude_list = ['password_hash']
    form_excluded_columns = ['date_created', 'password_hash']
    can_create = False

class ClientView(BaseView):
    form_excluded_columns = ['date_created', 'client_id', 'client_secret']

def routes(app):

    login_manager.init_app(app)

    flaskAdmin = Admin(
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

    flaskAdmin.add_view(BaseView(Walker, db.session, category="Old"))
    flaskAdmin.add_view(BaseView(Walk, db.session, category="Old"))

    flaskAdmin.add_view(BaseView(Biker, db.session, category="Old"))
    flaskAdmin.add_view(BaseView(Ride, db.session, category="Old"))

    flaskAdmin.add_view(BaseView(TrailWalker, db.session, category="Walk"))
    flaskAdmin.add_view(BaseView(TrailWalk, db.session, category="Walk"))

    flaskAdmin.add_view(BaseView(TrailBiker, db.session, category="Bike"))
    flaskAdmin.add_view(BaseView(TrailRide, db.session, category="Bike"))

    # flaskAdmin.add_view(BaseView(models.Rock1500, db.session, category="Rock1500"))
    # flaskAdmin.add_view(BaseView(models.Rock1500Song, db.session, category="Rock1500"))

    flaskAdmin.add_view(BaseView(Tournament, db.session, category="Tournament"))
    flaskAdmin.add_view(BaseView(Match, db.session, category="Tournament"))
    flaskAdmin.add_view(BaseView(Round, db.session, category="Tournament"))
    flaskAdmin.add_view(BaseView(Team, db.session, category="Tournament"))

    flaskAdmin.add_view(ClientView(Client, db.session, category="Auth"))
    flaskAdmin.add_view(BaseView(Scope, db.session, category="Auth"))
    flaskAdmin.add_view(UserView(User, db.session, category="Auth"))
    flaskAdmin.add_view(BaseView(Profile, db.session, category="Auth"))
