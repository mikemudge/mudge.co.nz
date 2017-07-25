from marshmallow import fields
from shared.marshmallow import BaseSchema
from trail.models import Trail, TrailProgress, TrailProfile

class TrailProgressSchema(BaseSchema):
    class Meta:
        model = TrailProgress
        exclude = ['trail_profile', 'date_created']

    # Identify the trail which the progress was made on.
    trail_id = fields.Str(load_only=True)

    date = fields.Date()

    # Maybe useful?
    # trail_profile = fields.Nested('TrailProfileSchema')

class TrailProfileSchema(BaseSchema):
    class Meta:
        model = TrailProfile
        exclude = ['date_created', 'user']

    user_id = fields.Str()
    trail_id = fields.Str()

    progress = fields.Nested(TrailProgressSchema, dump_only=True, many=True)
    name = fields.Method('get_name')

    color = fields.Method('get_color', 'set_color')

    trail = fields.Nested('TrailSchema', dump_only=True, only=('id', 'name'))

    def get_name(self, obj):
        return obj.user.profile.firstname + ' ' + obj.user.profile.lastname

    def get_color(self, obj):
        # Convert to hex
        return '#%06x' % obj.color

    def set_color(self, value):
        # Convert to dec
        value = int(value.lstrip('#'), 16)
        return value

class TrailSchema(BaseSchema):
    class Meta:
        model = Trail
        exclude = ['date_created']

    trail_profiles = fields.Nested(TrailProfileSchema, many=True)
