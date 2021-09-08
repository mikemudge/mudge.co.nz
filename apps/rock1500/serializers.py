from .models import Rock1500Album, Rock1500Song, Rock1500Artist, Rock1500Pick

from shared.marshmallow import BaseSchema, ma

class Rock1500ArtistSchema(BaseSchema):
    class Meta:
        model = Rock1500Artist

class Rock1500AlbumSchema(BaseSchema):
    class Meta:
        model = Rock1500Album

    artist = ma.Nested(Rock1500ArtistSchema, dump_only=True, only=['id', 'name'])

class Rock1500SongSchema(BaseSchema):
    class Meta:
        exclude = BaseSchema.Meta.exclude + ['picks', 'rank2014', 'rank2015', 'rank2016', 'rank2017', 'rank2018']
        model = Rock1500Song

    artist = ma.Nested(Rock1500ArtistSchema, dump_only=True, only=['id', 'name'])

    album = ma.Nested(Rock1500AlbumSchema, dump_only=True, only=['id', 'name', 'artist', 'cover_art_url'])

class Rock1500PickSchema(BaseSchema):
    class Meta:
        exclude = BaseSchema.Meta.exclude
        model = Rock1500Pick

    song = ma.Nested(Rock1500SongSchema, dump_only=True)

class Rock1500PicksSchema(BaseSchema):
    class Meta:
        fields = ['picks']
    picks = ma.Nested(Rock1500PickSchema, many=True)
