from api_app import api_bp
from main import main_bp
from flask import Flask
from models import db

import config
import models

def create_app(config):
    app = Flask(__name__)
    # TODO load from a config.py
    app.config.from_object(config)
    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(api_bp, url_prefix='/api')
    db.init_app(app)
    return app

def rock_song_add():
    songs = models.Rock1500Song.query.all()
    if len(songs) == 0:
        addSong('Thunderstruck', 'AC/DC')
        addSong('Free Bird', 'Lynyrd Skynyrd')
        addSong('Smells Like Teen Spirit', 'Nirvana')
        addSong('Killing In The Name', 'Rage Against The Machine')
        addSong('One', 'Metallica')
        addSong('Everlong', 'Foo Fighters')
        addSong('Sober', 'Tool')
        addSong('Home Again', 'Shihad')
        addSong('November Rain', 'Guns \'N\' Roses')
        addSong('All My Life', 'Foo Fighters')
        addSong('Enter Sandman', 'Metallica')
        addSong('Back \'n\' Black', 'AC/DC')
        addSong('Stinkfist', 'Tool')
        addSong('Stairway to Heaven', 'Led Zeppelin')
        addSong('Little Pills', 'Devilskin')
        addSong('Sweet Child \'O Mine', 'Guns \'N\' Roses')
        addSong('Master of Puppets', 'Metallica')
        addSong('The General Electric', 'Shihad')
        addSong('Bohemian Rhapsody', 'Queen')

def addSong(name, band):
    song = models.Rock1500Song(name=name, band=band)
    db.session.add(song)
    db.session.commit()

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
        rock_song_add()
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

    app.debug = True
    app.run(host='0.0.0.0')

app = create_app(config)

if __name__ == '__main__':
    with app.app_context():
        start()
