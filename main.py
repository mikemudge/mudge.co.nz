from app import admin
from app.routes import routes
from app.api_app import api_bp
from app.main import main_bp
from app.models import db
from flask import Flask
from tournament.routes import routes as tournament_routes

def create_app(config):
    app = Flask(__name__)
    # TODO load from a config.py
    app.config.from_object(config)
    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(admin.admin_bp, url_prefix='/admin/api/')

    routes(app)
    tournament_routes(app)

    db.init_app(app)
    return app
