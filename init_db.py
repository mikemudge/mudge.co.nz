import bcrypt

from models import db
from models import User, Rock1500Song

def init_user(username, password):
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    return User(username=username, name=username, fullname=username, hash=hashed)

def init_users():
    db.session.add_all([
        init_user('mike', 'mike'),
        init_user('Test 1', 'test'),
        init_user('Test 2', 'test'),
        init_user('Test 3', 'test'),
    ])
    db.session.commit()

def rock_song_add():
    songs = Rock1500Song.query.all()
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
    song = Rock1500Song(name=name, band=band)
    db.session.add(song)
    db.session.commit()
