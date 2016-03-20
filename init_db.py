import bcrypt

from models import db
from models import User

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
