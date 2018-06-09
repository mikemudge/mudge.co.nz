from marshmallow import fields
from .models import User, Profile
from shared.marshmallow import BaseSchema

class UserSchema(BaseSchema):
    class Meta:
        model = User
        fields = ['profile', 'id', 'email']
    profile = fields.Nested('ProfileSchema')

class ProfileSchema(BaseSchema):
    class Meta:
        model = Profile
        exclude = ['date_created', 'user']

class FriendsSchema(UserSchema):
    class Meta:
        model = User
        fields = UserSchema.Meta.fields + ['friends']
    friends = fields.Nested(UserSchema, many=True)
