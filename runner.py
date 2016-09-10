from api_app import api_bp
from main import main_bp
from init_db import init_bp
from flask import Flask
from models import db

import config

def create_app(config):
    app = Flask(__name__)
    # TODO load from a config.py
    app.config.from_object(config)
    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(init_bp, url_prefix='/init/')
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

    if 'reset' in sys.argv:
        import init_db
        init_db.init_users()
        init_db.rock_song_add()
        # Due to reset param, we shouldn't run the server.
        return

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

    # from werkzeug.serving import make_ssl_devcert
    # make_ssl_devcert('key', host='192.168.1.16')

    if 'ssl' in sys.argv:
        import ssl
        ctx = ssl.SSLContext(ssl.PROTOCOL_SSLv23)
        ctx.load_cert_chain('key.crt', 'key.key')
        app.run(host='0.0.0.0', ssl_context=ctx)
    else:
        app.run(host='0.0.0.0')
    app.debug = True

app = create_app(config)

if __name__ == '__main__':
    with app.app_context():
        start()
