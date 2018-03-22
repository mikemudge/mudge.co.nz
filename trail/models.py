import random

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
    ACTIVITY_MAP = dict(ACTIVITIES)

    activity = db.Column(ChoiceType(ACTIVITIES), nullable=False)

    # url to load trail data from
    trail_url = db.Column(db.String)

    def __repr__(self):
        return "<Trail: %s>" % self.name

# Allows custom profile for users on each Trail.
# Connects a user to a trail.
class TrailProfile(BaseModel):
    user_id = db.Column(UUID(), db.ForeignKey('user.id'), nullable=False)
    user = relationship(User, backref=db.backref('trail_profiles', lazy='dynamic'))

    trail_id = db.Column(UUID(), db.ForeignKey('trail.id', ondelete='CASCADE'), nullable=False)
    trail = relationship(Trail, backref=db.backref('trail_profiles', lazy='dynamic'))

    color = db.Column(db.Integer, nullable=False)

    # TODO activity should be connected to a profile, not a trail.
    # That would allow walking and biking any trail.

    def __repr__(self):
        return "<TrailProfile: %s on %s>" % (self.user.email, self.trail.name)

    @classmethod
    def get_or_create(cls, user, trail, color=None):
        newWalker = None
        if user.id and trail.id:
            newWalker = TrailProfile.query.filter_by(user=user, trail=trail).first()
        if not newWalker:
            if not color:
                color = random.randint(0, 16777215)
            newWalker = TrailProfile(user=user, trail=trail, color=color)
            db.session.add(newWalker)
        return newWalker

class TrailProgress(BaseModel):
    trail_profile_id = db.Column(UUID(), db.ForeignKey('trail_profile.id', ondelete='CASCADE'), nullable=False)
    trail_profile = relationship(TrailProfile, backref=db.backref('progress', lazy='dynamic', cascade='all, delete-orphan'))

    date = db.Column(db.Date())

    distance = db.Column(db.Float, nullable=False)

    def __repr__(self):
        return "<TrailProgress: %sm, %s>" % (self.distance, self.date)
