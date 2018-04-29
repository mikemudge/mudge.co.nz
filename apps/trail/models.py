import random

from auth.models import User
from shared.database import db, BaseModel, UUID
from sqlalchemy.orm import relationship
from sqlalchemy_utils import ChoiceType

# A Trail which users can work towards.
class Trail(BaseModel):
    name = db.Column(db.String, nullable=False)

    # url to load trail data from
    trail_url = db.Column(db.String)

    def __repr__(self):
        return "<Trail: %s>" % self.name

# Allows custom profile for users on each Trail.
# Connects a user to a trail.
class TrailProfile(BaseModel):
    ACTIVITY_WALK = u'walk'
    ACTIVITY_BIKE = u'bike'

    ACTIVITY_MAP = {
        ACTIVITY_WALK: {
            'code': ACTIVITY_WALK,
            'profile': 'walker',
            'action': 'walking',
            'plural': 'walks',
            'value': 'Walking Trail',
        },
        ACTIVITY_BIKE: {
            'code': ACTIVITY_BIKE,
            'profile': 'biker',
            'action': 'biking',
            'plural': 'bikes',
            'value': 'Biking Trail',
        }
    }
    ACTIVITIES = [(k, v['value']) for (k, v) in ACTIVITY_MAP.items()]

    activity = db.Column(ChoiceType(ACTIVITIES), nullable=False, server_default=u'walk', default=u'walk')

    user_id = db.Column(UUID(), db.ForeignKey('user.id'), nullable=False)
    user = relationship(
        User,
        backref=db.backref('trail_profiles', lazy='dynamic'),
    )

    name = db.Column(db.String)

    trail_id = db.Column(UUID(), db.ForeignKey('trail.id', ondelete='CASCADE'), nullable=False)
    trail = relationship(Trail, backref=db.backref('trail_profiles', lazy='dynamic'))

    color = db.Column(db.Integer, nullable=False)

    def __repr__(self):
        return "<TrailProfile: %s on %s>" % (self.user.email, self.trail.name)

    # deprecated
    @classmethod
    def get_or_create(cls, user, trail, color=None, activity=None):
        newWalker = None
        if activity is None:
            # Default to walking a trail.
            # Allow changing this?
            activity = TrailProfile.ACTIVITY_WALK
        if user.id and trail.id:
            newWalker = TrailProfile.query.filter_by(user=user, trail=trail, activity=activity).first()
        if not newWalker:
            if not color:
                color = random.randint(0, 16777215)
            newWalker = TrailProfile(user=user, trail=trail, color=color, activity=activity)
            db.session.add(newWalker)
        return newWalker

class TrailProgress(BaseModel):
    trail_profile_id = db.Column(UUID(), db.ForeignKey('trail_profile.id', ondelete='CASCADE'), nullable=False)
    trail_profile = relationship(TrailProfile, backref=db.backref('progress', lazy='dynamic', cascade='all, delete-orphan'))

    date = db.Column(db.Date())

    distance = db.Column(db.Float, nullable=False)

    def __repr__(self):
        return "<TrailProgress: %sm, %s>" % (self.distance, self.date)
