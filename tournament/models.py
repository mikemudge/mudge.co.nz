import uuid

from app.database import db, UUID

from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

class BaseModel(db.Model):
    __abstract__ = True
    id = db.Column('id', UUID(), primary_key=True, default=uuid.uuid4)

    date_created = db.Column(db.DateTime(timezone=True), server_default=func.now())
    name = db.Column(db.String)

class Tournament(BaseModel):
    pass

class Team(BaseModel):
    tournament_id = db.Column(UUID(), db.ForeignKey('tournament.id', ondelete='CASCADE'))
    tournament = relationship("Tournament", backref="teams")

class Round(BaseModel):
    tournament_id = db.Column(UUID(), db.ForeignKey('tournament.id', ondelete='CASCADE'))
    tournament = relationship("Tournament", backref="rounds")

class Match(BaseModel):
    round_id = db.Column(UUID(), db.ForeignKey('round.id', ondelete='CASCADE'))
    round = relationship("Round", backref="matches")

    homeTeam_id = db.Column(UUID(), db.ForeignKey('team.id'))
    homeTeam = relationship("Team", foreign_keys=homeTeam_id)
    awayTeam_id = db.Column(UUID(), db.ForeignKey('team.id'))
    awayTeam = relationship("Team", foreign_keys=awayTeam_id)
    played = db.Column(db.Boolean, default=False)
