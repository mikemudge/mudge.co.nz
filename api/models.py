import datetime

from shared.database import db

from sqlalchemy.orm import relationship

class Walker(db.Model):
    __bind_key__ = 'old_sqlite'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String)
    color = db.Column(db.String)

    def __repr__(self):
        return "<Walker: %s>" % self.name

class Walk(db.Model):
    __bind_key__ = 'old_sqlite'
    id = db.Column(db.Integer, primary_key=True)
    walker_id = db.Column(db.Integer, db.ForeignKey('walker.id'))
    walker = relationship("Walker", backref="walks")
    name = db.Column(db.String)
    date = db.Column(db.String)
    distance = db.Column(db.String)

class Biker(db.Model):
    __bind_key__ = 'old_sqlite'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String)
    color = db.Column(db.String)

    def __repr__(self):
        return "<Biker: %s>" % self.name

class Ride(db.Model):
    __bind_key__ = 'old_sqlite'
    id = db.Column(db.Integer, primary_key=True)
    biker_id = db.Column(db.Integer, db.ForeignKey('biker.id'))
    biker = relationship("Biker", backref="rides")
    name = db.Column(db.String)
    date = db.Column(db.String)
    distance = db.Column(db.String)

# class Rock1500(db.Model):
#     __bind_key__ = 'db2'
#     id = db.Column(db.Integer, primary_key=True)

#     created = db.Column(db.DateTime(timezone=True), default=func.now())
#     updated = db.Column(db.DateTime(timezone=True), default=func.now(), onupdate=func.now())
#     email = db.Column(db.String)

#     # deprecated. But sqlite doesn't remove columns?
#     rock_token = db.Column(db.String)

#     # Json encoded and in order from 1 - 10. Length can vary up to 10.
#     picks = db.Column(db.String)
#     public = db.Column(db.Boolean)

# # Used for suggestions.
# # Can be added by users.
# class Rock1500Song(db.Model):
#     __bind_key__ = 'db2'
#     id = db.Column(db.Integer, primary_key=True)

#     name = db.Column(db.String)
#     band = db.Column(db.String)

def simpleSerialize(value):
    result = {}
    for k, v in vars(value).iteritems():
        if type(v) is datetime.datetime:
            result[k] = v.isoformat()
        if type(v) in [unicode, int, str]:
            result[k] = v
        # elif v is None:
        #     result[k] = None
        # else:
        #     print type(v), k

    return result
