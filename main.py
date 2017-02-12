from auth.provider import oauth, setup as setup_auth
from flask import Flask
from flask_marshmallow import Marshmallow
from shared import exceptions
from shared.database import db

# Import routes.
from app.api_app import api_bp
from app.main import main_bp
from auth.routes import routes as auth_routes
from tournament_app.routes import routes as tournament_routes
from app.admin import routes as admin_routes

def create_app(config):
    app = Flask(__name__)
    # TODO load from a config.py
    app.config.from_object(config)
    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(api_bp, url_prefix='/api')

    setup_auth(app)

    admin_routes(app)
    auth_routes(app)
    tournament_routes(app)

    db.init_app(app)

    exceptions.registerHandlers(app)

    ma = Marshmallow()
    ma.init_app(app)

    oauth.init_app(app)

    return app
