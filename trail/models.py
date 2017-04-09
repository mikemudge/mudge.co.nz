from shared.database import db, BaseModel, UUID

from sqlalchemy.orm import relationship

class TrailWalker(BaseModel):
    name = db.Column(db.String)
    color = db.Column(db.Integer)

    def __repr__(self):
        return "%s" % self.name

class TrailWalk(BaseModel):
    walker_id = db.Column(UUID(), db.ForeignKey('trail_walker.id', ondelete='CASCADE'))
    walker = relationship("TrailWalker", backref="walks")

    distance = db.Column(db.Float)

class TrailBiker(BaseModel):
    name = db.Column(db.String)
    color = db.Column(db.Integer)

    def __repr__(self):
        return "%s" % self.name

class TrailRide(BaseModel):
    biker_id = db.Column(UUID(), db.ForeignKey('trail_biker.id', ondelete='CASCADE'))
    biker = relationship("TrailBiker", backref="rides")

    distance = db.Column(db.Float)
