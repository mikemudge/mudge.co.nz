import config

from app import models
from app.database import db
from flask_admin import Admin, AdminIndexView
from flask_admin.contrib.sqla import ModelView

class UserView(ModelView):
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

    flaskAdmin.add_view(UserView(models.User, db.session, category="User"))
    flaskAdmin.add_view(ModelView(models.Friendship, db.session, category="User"))
    flaskAdmin.add_view(ModelView(models.UserAuth, db.session, category="User"))

    flaskAdmin.add_view(ModelView(models.Walker, db.session, category="Walk"))
    flaskAdmin.add_view(ModelView(models.Walk, db.session, category="Walk"))

    flaskAdmin.add_view(ModelView(models.Biker, db.session, category="Bike"))
    flaskAdmin.add_view(ModelView(models.Ride, db.session, category="Bike"))

    flaskAdmin.add_view(ModelView(models.Rock1500, db.session, category="Rock1500"))
    flaskAdmin.add_view(ModelView(models.Rock1500Song, db.session, category="Rock1500"))
