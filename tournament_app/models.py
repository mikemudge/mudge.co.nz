from shared.database import db, BaseModel, UUID

from sqlalchemy.orm import relationship

class TournamentBaseModel(BaseModel):
    __abstract__ = True
    name = db.Column(db.String)

    def __repr__(self):
        return self.name

class Tournament(TournamentBaseModel):
    pass

class Team(TournamentBaseModel):
    tournament_id = db.Column(UUID(), db.ForeignKey('tournament.id', ondelete='CASCADE'))
    tournament = relationship("Tournament", backref="teams")

    @classmethod
    def loadByName(name):
        return Team.query.filter_by(name=name).first()

class Round(TournamentBaseModel):
    tournament_id = db.Column(UUID(), db.ForeignKey('tournament.id', ondelete='CASCADE'))
    tournament = relationship("Tournament", backref="rounds")

class Match(TournamentBaseModel):
    round_id = db.Column(UUID(), db.ForeignKey('round.id', ondelete='CASCADE'))
    round = relationship("Round", backref="matches")

    homeTeam_id = db.Column(UUID(), db.ForeignKey('team.id'))
    homeTeam = relationship("Team", foreign_keys=homeTeam_id)
    awayTeam_id = db.Column(UUID(), db.ForeignKey('team.id'))
    awayTeam = relationship("Team", foreign_keys=awayTeam_id)
    played = db.Column(db.Boolean, default=False)
