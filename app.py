from auth.provider import oauth, setup as setup_auth
from flask import Flask
from flask_cors import CORS
from flask_marshmallow import Marshmallow
from shared import exceptions
from shared.database import db

# Import routes.
from admin.routes import routes as mudge_admin_routes
from api.admin import routes as admin_routes
from api.api_app import api_bp
from api.main import main_bp
from auth.routes import routes as auth_routes
from flask_migrate import Migrate
from tournament_app.routes import routes as tournament_routes
from trail.routes import routes as trail_routes
from shared.exceptions import sentry

import os

migrate = Migrate()
ma = Marshmallow()

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

    admin_routes(app)
    auth_routes(app)
    trail_routes(app)
    tournament_routes(app)
    mudge_admin_routes(app)

    db.init_app(app)
    migrate.init_app(app, db)

    exceptions.registerHandlers(app)

    ma.init_app(app)

    oauth.init_app(app)

    CORS(app, origins=['http://localhost:3333'])
    return app
