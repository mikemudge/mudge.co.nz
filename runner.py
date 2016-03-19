from api_app import api_bp
from main import main_bp
from flask import Flask
from models import db

import config

def create_app(config):
    app = Flask(__name__)
    # TODO load from a config.py
    app.config.from_object(config)
    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(api_bp, url_prefix='/api')
    db.init_app(app)
    return app

def start():
    import sys
    if 'reset' in sys.argv:
        # delete the file?
        db.drop_all()
    # Create all creates any tables which don't exist.
    db.init_app(app)
    db.create_all()

    # from sqlalchemy.schema import MetaData
    # actual = MetaData()
    # actual.reflect(bind=engine)
    # for table in models.Base.metadata.sorted_tables:
    #     actualTable = actual.tables[table.name]
    #     diff = set(table.columns.keys()) - set(actualTable.columns.keys())
    #     if len(diff) > 0:
    #         print 'the table has changed', table.name
    #         print 'expected', table.columns.keys(), 'actual', actualTable.columns.keys()
    #         print 'add', diff
    #         # Now update the table?
    #         # If a table is removed we should remove all the tables which depend on it as well?
    #         # Or at least clear the records from it.
    #         # TODO should migrate properly???
    #         actualTable.drop(engine)
    #         table.create(engine)

    # app.run(host='0.0.0.0')
    # app.debug = True

    app.run()

if __name__ == '__main__':

    app = create_app(config)
    with app.app_context():
        start()
