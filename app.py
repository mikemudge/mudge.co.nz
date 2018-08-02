from auth.provider import oauth, setup as setup_auth
from flask import Flask
from flask_admin import Admin
from flask_cors import CORS
from shared import exceptions
from shared.database import db
from shared.marshmallow import ma, Session

# Import routes.
# from admin.routes import routes as mudge_admin_routes
from api.routes import routes as api_routes
from auth.custom_flask_admin import CustomAdminIndexView
from auth.login_manager import login_manager
from auth.routes import routes as auth_routes
from auth.views import auth_admin
from flask_migrate import Migrate
from apps.project_manager.routes import routes as project_routes
from apps.project_manager.views import project_admin
from apps.rock1500.routes import routes as rock_routes
from apps.rock1500.views import rock_admin
from apps.tournament_app.routes import routes as tournament_routes
from apps.tournament_app.views import tournament_admin
from apps.trail.routes import routes as trail_routes
from apps.trail.views import trail_admin

from shared.exceptions import sentry

import os

migrate = Migrate()

def routes(app):
    api_routes(app)
    auth_routes(app)
    project_routes(app)
    rock_routes(app)
    trail_routes(app)
    tournament_routes(app)
    # mudge_admin_routes(app)

    # Add flask admin for each app.
    auth_admin.admin_routes(app)
    project_admin.admin_routes(app)
    rock_admin.admin_routes(app)
    trail_admin.admin_routes(app)
    tournament_admin.admin_routes(app)


def get_version():
    with open(".commithash", "r") as myfile:
        lines = myfile.readlines()
        version = ''.join(lines)
        print('loading version:', version)
        return version
    raise Exception('Couldn\'t read commithash file')

def create_app(config=None):

    app = Flask(__name__)

    version = get_version()
    app.version = version

    if not config:
        if os.environ.get('APP_SETTINGS'):
            config = os.environ.get('APP_SETTINGS')
        else:
            raise Exception('Can\'t determine which config file to use. Specify via argument or environment variable APP_SETTINGS')

    print("Using config %s" % config)
    app.config.from_object(config)

    required_settings = [
        # See settings/base.py
        'SQLALCHEMY_DATABASE_URI',
        'JWT_TOKEN_SECRET_KEY',
        'SECRET_KEY',
    ]
    for setting in required_settings:
        if not app.config.get(setting):
            raise Exception('Missing required setting in local_config.py ' + setting)

    setup_auth(app)

    sentry.init_app(app, logging=True)

    login_manager.init_app(app)

    # If we don't create this each time here we get duplicate Blueprint errors in tests.
    Admin(
        app=app,
        name='Mudge.co.nz',
        index_view=CustomAdminIndexView(
            url='/flask-admin',
            endpoint='admin'
        ),
        template_mode='bootstrap3',
        static_url_path="static",
        base_template='admin/master.html'
    )

    routes(app)

    db.init_app(app)
    migrate.init_app(app, db)

    exceptions.registerHandlers(app)

    # This should be updating the session objects.
    # But it doesn't seem too?
    Session.configure(binds=db.get_binds(app))
    ma.init_app(app)

    oauth.init_app(app)

    CORS(app, origins=['http://localhost:3333'])
    return app
