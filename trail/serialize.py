from .models import TrailBiker, TrailRide, TrailWalk, TrailWalker
from marshmallow import fields
from shared.marshmallow import BaseSchema

class WalkerSchema(BaseSchema):
    class Meta:
        model = TrailWalker
        exclude = ['date_created']

    date = fields.Method('get_date')

    def get_date(self, obj):
        return obj.date_created

class WalkSchema(BaseSchema):
    class Meta:
        model = TrailWalk
        exclude = ['date_created']

class RideSchema(BaseSchema):
    class Meta:
        model = TrailRide
        exclude = ['date_created']

    biker = fields.Nested('BikerSchema', exclude=["rides"])

class BikerSchema(BaseSchema):
    class Meta:
        model = TrailBiker
        exclude = ['date_created']

    date = fields.Method('get_date')
    rides = fields.Nested(RideSchema, many=True, exclude=["walker"])

    def get_date(self, obj):
        return obj.date_created
