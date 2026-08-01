from marshmallow import fields
from shared.marshmallow import BaseSchema
from .models import Trail, TrailProgress, TrailProfile

class TrailProgressDate(fields.Date):
    # The frontend sends a full ISO datetime (JS Date.toJSON()), but the
    # column is date-only, so drop any time component before parsing.
    def _deserialize(self, value, attr, data, **kwargs):
        if isinstance(value, str):
            value = value.split('T')[0]
        return super()._deserialize(value, attr, data, **kwargs)

class TrailProgressSchema(BaseSchema):
    class Meta:
        model = TrailProgress
        exclude = BaseSchema.Meta.exclude + ['trail_profile']

    # Identify the trail which the progress was made on.
    trail_id = fields.Str(load_only=True)

    # Identify the profile the progress was for.
    trail_profile_id = fields.Str(load_only=True)

    date = TrailProgressDate()

    editDate = fields.Boolean()

class TrailProfileSchema(BaseSchema):
    class Meta:
        model = TrailProfile
        exclude = BaseSchema.Meta.exclude + ['user']

    # Adds nested list fields.
    progress = fields.Nested(TrailProgressSchema, dump_only=True, many=True)

    user_id = fields.Str()
    trail_id = fields.Str()
    name = fields.Str()

    color = fields.Method('get_color', 'set_color')

    trail = fields.Nested('TrailSchema', dump_only=True, only=('id', 'name'))

    activity = fields.Method('get_activity', 'parse_activity')

    def parse_activity(self, obj):
        # Use the code of the activity to store it in the DB.
        return obj['code']

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

class TrailSchema(BaseSchema):
    class Meta:
        model = Trail
        exclude = BaseSchema.Meta.exclude
        include_relationships = True
