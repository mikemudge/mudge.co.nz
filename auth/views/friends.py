from ..models import User
from ..provider import oauth
from flask import request
from flask.views import MethodView
from shared.database import db
from shared.exceptions import BadRequestException
from ..serialize import FriendsSchema, UserSchema

class FriendsView(MethodView):

    @oauth.require_oauth('user')
    def post(self):
        # Add a friend
        user = request.oauth.user
        friend_id = request.json.get('friend_id')
        if not friend_id:
            raise BadRequestException('friend_id is required')
        friend = User.query.get(friend_id)

        user.friends.append(friend)
        db.session.commit()
        schema = FriendsSchema()
        return schema.response(user)

    @oauth.require_oauth('user')
    def delete(self):
        # Add a friend
        user = request.oauth.user
        friend_id = request.args.get('friend_id')
        if not friend_id:
            raise BadRequestException('friend_id is required')
        friend = User.query.get(friend_id)

        user.friends.remove(friend)
        db.session.commit()
        schema = FriendsSchema()
        return schema.response(user)

    @oauth.require_oauth('user')
    def get(self, pk=None):
        # return all friends
        data = request.args
        print(data)
        if data.get('search'):
            crit = User.email.ilike("%%%s%%" % data.get('search'))
            results = User.query.filter(crit).limit(10).all()
            # TODO add a field to indicate already friends?
        else:
            results = request.oauth.user.friends
        schema = UserSchema(many=True)
        return schema.response(results)
