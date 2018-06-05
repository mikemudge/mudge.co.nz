from ..models import User
from ..provider import oauth
from flask import request
from flask.views import MethodView

from ..serialize import FriendsSchema, UserSchema

class FriendsView(MethodView):

    @oauth.require_oauth('user')
    def post(self):
        # Add a friends
        user = request.oauth.user
        friend_id = request.json.get('friend_id')
        friend = User.query.get(friend_id)

        user.friends.append(friend)
        schema = FriendsSchema()
        return schema.response(user)

    @oauth.require_oauth('user')
    def get(self, pk=None):
        # return all friends
        friends = request.oauth.user.friends
        schema = UserSchema(many=True)
        return schema.response(friends)
