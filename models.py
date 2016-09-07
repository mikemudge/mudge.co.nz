from sqlalchemy import select
from sqlalchemy.types import TIMESTAMP
from sqlalchemy.sql.expression import func
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import relationship

db = SQLAlchemy()

class Friendship(db.Model):
    __tablename__ = 'friendship'

    initiator_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    last_time = db.Column(TIMESTAMP, server_default=func.now())
    # , onupdate=func.current_timestamp())

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String, unique=True)
    hash = db.Column(db.String)
    name = db.Column(db.String)
    fullname = db.Column(db.String)

    friends = relationship(
        "User",
        secondary='friendship',
        primaryjoin=id == Friendship.initiator_id,
        secondaryjoin=id == Friendship.recipient_id,
        backref="friends2",
    )

friendship_union = select([
    Friendship.initiator_id,
    Friendship.recipient_id
]).union(
    select([
        Friendship.recipient_id,
        Friendship.initiator_id]
    )
).alias()

# This is a read only field which shows all the friends in both directions.
User.all_friends = relationship(
    'User',
    secondary=friendship_union,
    primaryjoin=User.id == friendship_union.c.recipient_id,
    secondaryjoin=User.id == friendship_union.c.initiator_id,
    viewonly=True)

class UserAuth(db.Model):
    __tablename__ = 'user_auth'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    user = relationship("User", backref="auths")

    auth_token = db.Column(db.String, nullable=False, primary_key=True)
    expires = db.Column(TIMESTAMP, nullable=False)

class Address(db.Model):
    __tablename__ = 'addresses'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    user = relationship("User", backref="addresses")

    email_address = db.Column(db.String, nullable=False)

class Walker(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String)
    color = db.Column(db.String)

class Walk(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    walker_id = db.Column(db.Integer, db.ForeignKey('walker.id'))
    walker = relationship("Walker", backref="walks")
    name = db.Column(db.String)
    date = db.Column(db.String)
    distance = db.Column(db.String)

class Biker(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String)
    color = db.Column(db.String)

class Ride(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    biker_id = db.Column(db.Integer, db.ForeignKey('biker.id'))
    biker = relationship("Biker", backref="rides")
    name = db.Column(db.String)
    date = db.Column(db.String)
    distance = db.Column(db.String)

class Rock1500(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    user = relationship("User", backref="rock1500s")

    # A random token used to id the user.
    # TODO not real auth.
    rock_token = db.Column(db.String)

    # Json encoded and in order from 1 - 10. May contain nulls.
    picks = db.Column(db.String)
    public = db.Column(db.Boolean)

# Used for suggestions.
# Can be added by users.
class Rock1500Song(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String)
    band = db.Column(db.String)

def simpleSerialize(value):
    result = {}
    for k, v in vars(value).iteritems():
        if type(v) in [unicode, int, str]:
            result[k] = v
        # elif v is None:
        #     result[k] = None
        # else:
        #     print type(v), k

    return result
