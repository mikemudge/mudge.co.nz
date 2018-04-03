from flask import current_app

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

    # Adds nested list fields.
    progress = fields.Nested(TrailProgressSchema, dump_only=True, many=True)

    user_id = fields.Str()
    trail_id = fields.Str()
    name = fields.Str()

    color = fields.Method('get_color', 'set_color')

    trail = fields.Nested('TrailSchema', dump_only=True, only=('id', 'name'))

    activity = fields.Method('get_activity')

    def get_activity(self, obj):
        # Sometimes we only get a str code?
        code = obj.activity
        if hasattr(obj.activity, 'value'):
            code = obj.activity.code

        return TrailProfile.ACTIVITY_MAP[code]

    def get_color(self, obj):
        # Convert to hex
        return '#%06x' % obj.color

    def set_color(self, value):
        # Convert to dec
        value = int(value.lstrip('#'), 16)
        return value

class ListTrailProfileSchema(TrailProfileSchema):
    class Meta:
        model = TrailProfile
        exclude = TrailProfileSchema.Meta.exclude + ['progress']

class TrailSchema(BaseSchema):
    class Meta:
        model = Trail
        exclude = ['date_created']

    trail_profiles = fields.Nested(TrailProfileSchema, many=True)
