import bcrypt
import datetime

from app.models import db
from app.models import User, Rock1500Song, Biker, Ride, Walker, Walk

def init_all():
    init_bikers()
    init_walkers()
    init_users()
    rock_song_add()

def init_user(email, password):
    username = email.split('@')[0]
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    return User(username=username, email=email, name=username, fullname=username, hash=hashed)

def init_users():
    db.session.add_all([
        init_user('mike.mudge@gmail.com', 'mike'),
        init_user('mike.mudge.test@gmail.com', 'test'),
        init_user('mike.mudge+test2@gmail.com', 'test'),
        init_user('mike.mudge+test3@gmail.com', 'test'),
    ])
    db.session.commit()

def init_bikers():
    db.session.add_all([
        Biker(name="Mike", rides=[
            Ride(distance=132, date=datetime.datetime.utcnow().isoformat()),
        ]),
        Biker(name="Test2", rides=[
            Ride(distance=100, date=datetime.datetime.utcnow().isoformat()),
            Ride(distance=242, date=datetime.datetime.utcnow().isoformat()),
        ])
    ])
    db.session.commit()

def init_walkers():
    db.session.add_all([
        Walker(name="Mike", walks=[
            Walk(distance=132, date=datetime.datetime.utcnow().isoformat()),
        ]),
        Walker(name="Test2", walks=[
            Walk(distance=100, date=datetime.datetime.utcnow().isoformat()),
            Walk(distance=242, date=datetime.datetime.utcnow().isoformat()),
        ])
    ])
    db.session.commit()

def rock_song_add():
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
    db.session.commit()

def addSong(name, band):
    song = Rock1500Song(name=name, band=band)
    db.session.add(song)
