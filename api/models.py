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
