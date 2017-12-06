from auth.provider import oauth, setup as setup_auth
from flask import Flask
from flask_cors import CORS
from shared import exceptions
from shared.database import db
from shared.marshmallow import ma, Session

# Import routes.
from admin.routes import routes as mudge_admin_routes
from api.admin import routes as admin_routes
from api.api_app import api_bp
from api.main import main_bp
from api.routes import routes as api_routes
from auth.routes import routes as auth_routes
from flask_migrate import Migrate
from project_manager.routes import routes as project_routes
from rock1500.routes import routes as rock_routes
from tournament_app.routes import routes as tournament_routes
from trail.routes import routes as trail_routes
from shared.exceptions import sentry

import os

migrate = Migrate()

def create_app(config=None):

    app = Flask(__name__)

    if not config:
        if os.environ.get('APP_SETTINGS'):
            config = os.environ.get('APP_SETTINGS')
        else:
            raise Exception('Can\'t determine which config file to use. Specify via argument or environment variable APP_SETTINGS')

    app.config.from_object(config)
    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(api_bp, url_prefix='/api')

    setup_auth(app)

    sentry.init_app(app, logging=True)

    api_routes(app)
    admin_routes(app)
    auth_routes(app)
    project_routes(app)
    rock_routes(app)
    trail_routes(app)
    tournament_routes(app)
    # mudge_admin_routes(app)

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
