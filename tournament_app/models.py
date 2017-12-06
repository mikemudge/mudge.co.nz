from shared.database import db, BaseModel, UUID

from sqlalchemy.orm import relationship

class TournamentBaseModel(BaseModel):
    __abstract__ = True
    name = db.Column(db.String)

    def __repr__(self):
        if self.name:
            return self.name
        return super(BaseModel, self).__repr__()

class Tournament(TournamentBaseModel):
    pass

class Team(TournamentBaseModel):
    tournament_id = db.Column(UUID(), db.ForeignKey('tournament.id', ondelete='CASCADE'))
    tournament = relationship("Tournament", backref=db.backref("teams", lazy="dynamic"))

    @classmethod
    def loadByName(name):
        return Team.query.filter_by(name=name).first()

class Round(TournamentBaseModel):
    tournament_id = db.Column(UUID(), db.ForeignKey('tournament.id', ondelete='CASCADE'))
    tournament = relationship("Tournament", backref=db.backref("rounds", lazy="dynamic"))

class MatchResult(BaseModel):
    homeScore = db.Column(db.Integer, nullable=False)
    awayScore = db.Column(db.Integer, nullable=False)

    match_id = db.Column(UUID(), db.ForeignKey('match.id', ondelete='CASCADE'), nullable=False)
    match = relationship(
        'Match',
        # uselist=False,
        back_populates='result',
        single_parent=True)

    def __repr__(self):
        return "%s - %s" % (self.homeScore, self.awayScore)

class Match(BaseModel):
    round_id = db.Column(UUID(), db.ForeignKey('round.id', ondelete='CASCADE'))
    round = relationship("Round", backref="matches")

    homeTeam_id = db.Column(UUID(), db.ForeignKey('team.id'))
    homeTeam = relationship("Team", foreign_keys=homeTeam_id)
    awayTeam_id = db.Column(UUID(), db.ForeignKey('team.id'))
    awayTeam = relationship("Team", foreign_keys=awayTeam_id)

    result = relationship(
        MatchResult,
        back_populates='match',
        # Cascade will delete result when a match is deleted.
        # delete-orphan will delete results if they are removed from a match
        cascade="all, delete-orphan",
        # Can only have a single result per match.
        uselist=False)

    def __repr__(self):
        return "%s - %s" % (self.homeTeam, self.awayTeam)
