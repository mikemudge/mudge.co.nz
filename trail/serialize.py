from .models import TrailWalker
from marshmallow import fields
from shared.marshmallow import BaseSchema

class WalkerSchema(BaseSchema):
    class Meta:
        model = TrailWalker
        exclude = ['date_created']

    date = fields.Method('get_date')

    def get_date(self, obj):
        return obj.date_created
