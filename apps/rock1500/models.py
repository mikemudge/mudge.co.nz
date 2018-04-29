from shared.database import db, BaseModel, UUID
from auth.models import User
from sqlalchemy.orm import backref

class Rock1500Artist(BaseModel):
    name = db.Column(db.String(100), unique=True, index=True)

    @classmethod
    def find_by_name(cls, name):
        artist = Rock1500Artist.query.filter_by(name=name).first()
        return artist

    def __repr__(self):
        return self.name

class Rock1500Album(BaseModel):
    name = db.Column(db.String(100), unique=True, index=True)

    year = db.Column(db.Integer())

    # the cover art image url
    cover_art_url = db.Column(db.String(255))

    artist_id = db.Column(UUID(), db.ForeignKey('rock1500_artist.id'))
    artist = db.relationship(Rock1500Artist, backref="albums")

    @classmethod
    def find_by_name(cls, name):
        album = Rock1500Album.query.filter_by(name=name).first()
        return album

    def __repr__(self):
        return self.name

class Rock1500Song(BaseModel):
    title = db.Column(db.String(100), index=True)

    artist_id = db.Column(UUID(), db.ForeignKey('rock1500_artist.id'), nullable=False)
    artist = db.relationship(Rock1500Artist, backref="songs")

    album_id = db.Column(UUID(), db.ForeignKey('rock1500_album.id'), nullable=False)
    album = db.relationship(Rock1500Album, backref="songs")

    # The important rank, once it is known.
    rank2017 = db.Column(db.Integer(), index=True)

    # Previous ranks if known.
    rank2016 = db.Column(db.String(100))
    rank2015 = db.Column(db.String(100))

    @classmethod
    def find_by_name(cls, title, artist):
        if not artist.id:
            # If the artist doesn't exist yet, then there won't be any songs by them.
            return None
        song = Rock1500Song.query.filter_by(title=title, artist=artist).first()
        return song

    def __repr__(self):
        return self.title

class Rock1500Pick(BaseModel):
    song_id = db.Column(UUID(), db.ForeignKey('rock1500_song.id'), nullable=False)
    song = db.relationship(Rock1500Song, backref="picks")

    position = db.Column(db.Integer(), nullable=False)

    # TODO delete orphans?
    # If a user removes a pick, it should be deleted
    user_id = db.Column(UUID(), db.ForeignKey('user.id'), nullable=False)
    user = db.relationship(User, backref=backref(
        "rock_picks",
        order_by=position,
        cascade='all, delete-orphan',
    ))

    def __repr__(self):
        return "%s: %s" % (self.position, self.song)
