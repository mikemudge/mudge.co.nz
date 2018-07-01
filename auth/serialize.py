from marshmallow import fields
from .models import User, Profile
from shared.marshmallow import BaseSchema

class UserSchema(BaseSchema):
    class Meta:
        model = User
        exclude = BaseSchema.Meta.exclude
        fields = ['profile', 'id', 'email']
    profile = fields.Nested('ProfileSchema')

class ProfileSchema(BaseSchema):
    class Meta:
        model = Profile
        exclude = BaseSchema.Meta.exclude + ['user']

class FriendsSchema(UserSchema):
    class Meta:
        model = User
        exclude = BaseSchema.Meta.exclude
        fields = UserSchema.Meta.fields + ['friends']
    friends = fields.Nested(UserSchema, many=True)
