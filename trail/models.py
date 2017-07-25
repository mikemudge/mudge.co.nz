from auth.models import User
from shared.database import db, BaseModel, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.schema import UniqueConstraint
from sqlalchemy_utils import ChoiceType

# A Trail which users can work towards.
class Trail(BaseModel):
    name = db.Column(db.String, nullable=False)

    ACTIVITY_WALK = u'walk'
    ACTIVITY_BIKE = u'bike'
    # TODO add lookups for strings biker/walker and bikes/walks if needed?

    ACTIVITIES = [
        (ACTIVITY_WALK, u'Walking Trail'),
        (ACTIVITY_BIKE, u'Biking Trail'),
    ]

    activity = db.Column(ChoiceType(ACTIVITIES, impl=db.String()), nullable=False)

    def __repr__(self):
        return "<Trail: %s>" % self.name

# Allows custom profile for users on each Trail.
# Connects a user to a trail.
# TODO probably doesn't need id, could use user_id/trail_id
class TrailProfile(BaseModel):
    user_id = db.Column(UUID(), db.ForeignKey('user.id'), nullable=False)
    user = relationship(User, backref=db.backref('trail_profiles', lazy='dynamic'))

    trail_id = db.Column(UUID(), db.ForeignKey('trail.id', ondelete='CASCADE'), nullable=False)
    trail = relationship(Trail, backref=db.backref('trail_profiles', lazy='dynamic'))

    color = db.Column(db.Integer, nullable=False)

    # unique user_id trail_id pairs
    __table_args__ = (
        UniqueConstraint('trail_id', 'user_id'),
    )

    def __repr__(self):
        return "<TrailProfile: %s on %s>" % (self.user.email, self.trail.name)

class TrailProgress(BaseModel):
    trail_profile_id = db.Column(UUID(), db.ForeignKey('trail_profile.id', ondelete='CASCADE'), nullable=False)
    trail_profile = relationship(TrailProfile, backref=db.backref('progress', lazy='dynamic', cascade='all, delete-orphan'))

    date = db.Column(db.Date())

    distance = db.Column(db.Float, nullable=False)

    def __repr__(self):
        return "<TrailProgress: %sm>" % self.distance
