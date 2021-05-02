from ..models import User, Profile, Client
from ..utils import googleAuth
from ..provider import oauth, create_token
from datetime import datetime
from flask import request, jsonify
from flask import Blueprint
from flask.views import MethodView
from shared.database import db
from shared.exceptions import AuthenticationException
from shared.exceptions import ErrorCodes

auth_bp = Blueprint('auth_api', __name__, url_prefix='/api')

class AuthenticationTokenView(MethodView):

    @oauth.token_handler
    def post(self):
        # This seems like a dumb thing to me.
        return None

class AuthenticationConnectorView(MethodView):

    def check_client(self, request):
        # Werkzeug, and subsequently Flask provide a safe Authorization header
        # parsing, so we just use that if it is present.
        if request.authorization:
            auth = request.authorization
            client_id = auth.get('username')
            client_secret = auth.get('password')
        else:
            raise AuthenticationException('Bad basic auth')

        client = Client.query.filter_by(client_id=client_id).first()
        if not client:
            raise AuthenticationException(['Client not found for %s' % client_id])
            return False

        request.client = client

        # http://tools.ietf.org/html/rfc6749#section-2
        # The client MAY omit the parameter if the client secret is an empty string.
        if hasattr(client, 'client_secret') and client.client_secret != client_secret:
            return False

        # Finally got it all right.
        return True

    def post(self):
        """
        Get Token through social login
        :return:
        """
        try:
            valid = self.check_client(request)
        except Exception as e:
            print(str(e))
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
            raise AuthenticationException(['No id_token'])
        data = googleAuth(token)

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

        user.last_login = datetime.now()
        # Update with the newest data from google
        user.profile.firstname = data.get('given_name')
        user.profile.lastname = data.get('family_name')
        user.profile.image = data.get('picture')

        db.session.commit()
        return user
