from api_app import api_bp
from main import main_bp
from flask import Flask
from flask_migrate import Migrate
from models import db

migrate = Migrate()

def create_app(config):
    app = Flask(__name__)
    # TODO load from a config.py
    app.config.from_object(config)
    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(api_bp, url_prefix='/api')
    db.init_app(app)
    migrate.init_app(app, db)
    return app
