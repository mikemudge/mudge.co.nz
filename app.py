from auth.provider import oauth, setup as setup_auth
from datetime import datetime
from flask import Flask
from flask_admin import Admin
from shared import exceptions
from shared.database import db
from shared.marshmallow import ma, Session

# Import routes.
from api.routes import routes as api_routes
from auth.custom_flask_admin import CustomAdminIndexView
from auth.login_manager import login_manager
from auth.routes import routes as auth_routes
from auth.views import auth_admin
from flask_migrate import Migrate
from apps.admin.routes import routes as mudge_admin_routes
from apps.project_manager.routes import routes as project_routes
from apps.project_manager.views import project_admin
from apps.rock1500.routes import routes as rock_routes
from apps.rock1500.views import rock_admin
from apps.tournament_app.routes import routes as tournament_routes
from apps.tournament_app.views import tournament_admin
from apps.trail.routes import routes as trail_routes
from apps.trail.views import trail_admin

from shared.exceptions import sentry

import logging
import os
import sys

migrate = Migrate()

def routes(app):
    api_routes(app)
    auth_routes(app)
    project_routes(app)
    rock_routes(app)
    trail_routes(app)
    tournament_routes(app)
    mudge_admin_routes(app)

    # Add flask admin for each app.
    auth_admin.admin_routes(app)
    project_admin.admin_routes(app)
    rock_admin.admin_routes(app)
    trail_admin.admin_routes(app)
    tournament_admin.admin_routes(app)


def get_env_version(app):
    if app.config.get("ENV") == "dev":
        return str(datetime.now().timestamp())
    if app.config.get("ENV") == "test":
        return "test"
    with open(".commithash", "r") as myfile:
        lines = myfile.readlines()
        version = ''.join(lines)
        print('loading version:', version)
        return version
    raise Exception('Couldn\'t read commithash file')

def create_app(config=None):

    app = Flask(__name__)

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

    version = get_env_version(app)
    app.version = version

    @app.after_request
    def apply_headers(response):
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        # Include nothing when redirecting to http.
        # Include the origin only when redirecting to another origin using https.
        # Include the origin and path when on the same origin.
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Needs more testing.
        # response.headers["Content-Security-Policy"] = "script-src 'unsafe-inline' localhost:5000 mudge.co.nz cdn.ravenjs.com cdnjs.cloudflare.com maps.googleapis.com"
        return response

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

    handler = logging.StreamHandler(sys.stdout)
    if app.config.get("LOG_LEVEL") == "DEBUG":
        handler.setLevel(logging.DEBUG)
    if app.config.get("LOG_LEVEL") == "INFO":
        handler.setLevel(logging.INFO)
    if app.config.get("LOG_LEVEL") == "WARN":
        handler.setLevel(logging.WARN)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    app.logger.addHandler(handler)
    if app.config.get("LOG_LEVEL") == "DEBUG":
        app.logger.debug("Starting app with DEBUG logs")
    elif app.config.get("LOG_LEVEL") == "INFO":
        app.logger.info("Starting app with INFO logs")
    elif app.config.get("LOG_LEVEL") == "WARN":
        app.logger.warn("Starting app with WARN logs")
    else:
        app.logger.info("Starting app")


    # CORS(app, origins=['http://localhost:3333'])
    return app
