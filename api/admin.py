import config

from api import models
from auth.models import Client, Scope, User, Profile
from tournament_app.models import Tournament, Team, Match, Round
from shared.database import db
from flask_admin import Admin, AdminIndexView
from flask_admin.contrib.sqla import ModelView

class BaseView(ModelView):
    form_excluded_columns = ['date_created']

class UserView(BaseView):
    column_exclude_list = ['hash']

def routes(app):

    if not config.ENABLE_TEST:
        # Don't enable the flask admin on prod.
        # Can enable this once auth is in place.
        return

    flaskAdmin = Admin(app, name='Mudge.co.nz', template_mode='bootstrap3', index_view=AdminIndexView(
        name='Home',
        template='admin/master.html',
        url='/flask-admin'
    ))

    flaskAdmin.add_view(BaseView(models.Walker, db.session, category="Walk"))
    flaskAdmin.add_view(BaseView(models.Walk, db.session, category="Walk"))

    flaskAdmin.add_view(BaseView(models.Biker, db.session, category="Bike"))
    flaskAdmin.add_view(BaseView(models.Ride, db.session, category="Bike"))

    # flaskAdmin.add_view(BaseView(models.Rock1500, db.session, category="Rock1500"))
    # flaskAdmin.add_view(BaseView(models.Rock1500Song, db.session, category="Rock1500"))

    flaskAdmin.add_view(BaseView(Tournament, db.session, category="Tournament"))
    flaskAdmin.add_view(BaseView(Match, db.session, category="Tournament"))
    flaskAdmin.add_view(BaseView(Round, db.session, category="Tournament"))
    flaskAdmin.add_view(BaseView(Team, db.session, category="Tournament"))

    flaskAdmin.add_view(BaseView(Client, db.session, category="Auth"))
    flaskAdmin.add_view(BaseView(Scope, db.session, category="Auth"))
    flaskAdmin.add_view(BaseView(User, db.session, category="Auth"))
    flaskAdmin.add_view(BaseView(Profile, db.session, category="Auth"))
