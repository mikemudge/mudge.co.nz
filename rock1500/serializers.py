from rock1500.models import Rock1500Song, Rock1500Artist, Rock1500Pick

from shared.marshmallow import BaseSchema, ma

class Rock1500ArtistSchema(BaseSchema):
    class Meta:
        model = Rock1500Artist

class Rock1500SongSchema(BaseSchema):
    class Meta:
        model = Rock1500Song

    artist = ma.Nested(Rock1500ArtistSchema, dump_only=True)

class Rock1500PickSchema(BaseSchema):
    class Meta:
        model = Rock1500Pick

    song = ma.Nested(Rock1500SongSchema, dump_only=True)

class Rock1500PicksSchema(BaseSchema):
    picks = ma.Nested(Rock1500PickSchema, many=True)
