from .models import TrailBiker, TrailRide, TrailWalk, TrailWalker
from marshmallow import fields
from shared.marshmallow import BaseSchema

class WalkSchema(BaseSchema):
    class Meta:
        model = TrailWalk

    # Can load existing via *_id
    # walker works by default but stops working if we dump it with a schema.
    walker_id = fields.Str(load_only=True)
    walker = fields.Nested('WalkerSchema', exclude=['walks'])
    date_created = fields.DateTime(load_from='date', dump_to='date')

class WalkerSchema(BaseSchema):
    class Meta:
        model = TrailWalker
        exclude = ['date_created']

    walks = fields.Nested(WalkSchema, many=True, exclude=["walker"])

class RideSchema(BaseSchema):
    class Meta:
        model = TrailRide

    biker_id = fields.Str(load_only=True)
    biker = fields.Nested('BikerSchema', exclude=["rides"], dump_only=True)
    date_created = fields.DateTime(load_from='date', dump_to='date')

class BikerSchema(BaseSchema):
    class Meta:
        model = TrailBiker
        exclude = ['date_created']

    rides = fields.Nested(RideSchema, many=True, exclude=["biker"], dump_only=True)
