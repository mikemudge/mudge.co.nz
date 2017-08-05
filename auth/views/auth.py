from ..models import User, Profile
from ..utils import googleAuth
from ..provider import oauth, create_token
from flask import request, jsonify
from flask import Blueprint
from flask.views import MethodView
from shared.database import db
from shared.exceptions import ValidationException, AuthenticationException
from shared.exceptions import ErrorCodes
auth_bp = Blueprint('auth_api', __name__, url_prefix='/api')

class AuthenticationTokenView(MethodView):

    @oauth.token_handler
    def post(self):
        # This seems like a dumb thing to me.
        return None

class AuthenticationConnectorView(MethodView):

    def post(self):
        """
        Get Token through social login
        :return:
        """
        # TODO verify client header.
        # Then verify login via google.
        try:
            # This doesn't seem legit?
            # Its not good, need to do something better.
            valid = oauth._validator.authenticate_client(request)
        except Exception as e:
            print e.message
            raise AuthenticationException('failed to authenticate client', error_code=ErrorCodes.MALFORMED_OR_MISSING_BASIC_AUTH)

        if not valid:
            raise AuthenticationException(['Invalid basic auth'])

        data = request.json

        # Check Google Login
        if data.get("type") == "google":
            user = self.googleConnection(data.get('id_token'))
        else:
            raise NotImplemented('Social connect with type: ' + data.get('type'))

        # User was legit, lets create a token for them.
        return jsonify(data={
            'access_token': create_token(request, request.client, user)
        })

    def googleConnection(self, token):
        if not token:
            raise ValidationException(['No id_token'])
        data = googleAuth(token)

        # {u'picture': u'https://lh6.googleusercontent.com/-H2j2IzGSxdg/AAAAAAAAAAI/AAAAAAAAAbY/0oiKsVRnc5A/s96-c/photo.jpg',
        # u'aud': u'872711897303-6rkqgedhsq6rni9ikt6j6v8rbhkkkd7a.apps.googleusercontent.com',
        # u'family_name': u'Mudge',
        # u'iss': u'accounts.google.com',
        #  u'email_verified': u'true',
        #  u'name': u'Michael Mudge',
        #  u'at_hash': u'1CvFBd6GwEXRPxHBESgV0w',
        #  u'given_name': u'Michael',
        #  u'exp': u'1497664124',
        #   u'alg': u'RS256',
        #   u'azp': u'872711897303-6rkqgedhsq6rni9ikt6j6v8rbhkkkd7a.apps.googleusercontent.com',
        #   u'iat': u'1497660524',
        #   u'locale': u'en',
        #   u'kid': u'a298a56b6ac05431253d49030816a5ebf99a13c5',
        #   u'email': u'mike.mudge@gmail.com',
        #   u'sub': u'113404678280283320527'
        # }
        email = data['email']
        if not data.get('email_verified'):
            raise Exception('Email is not verified' + data['email'])

        user = User.query.filter_by(email=email).first()

        if not user:
            user = User.create(email)
            user.is_active = True
            db.session.add(user)

        if not user.profile:
            user.profile = Profile()

        if not user.profile.username:
            user.profile.username = email.split('@')[0]

        user.profile.firstname = data.get('given_name')
        user.profile.lastname = data.get('family_name')
        user.profile.image = data.get('picture')

        db.session.commit()
        return user
