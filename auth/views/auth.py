from ..models import User
from ..utils import googleAuth
from ..provider import oauth
from flask import request, jsonify
from flask import Blueprint
from flask.views import MethodView
from shared.database import db
from shared.exceptions import ValidationException, AuthenticationException

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
        try:
            # valid = self._validator.authenticate_client(request=request)
            # This doesn't seem legit?
            valid = oauth._validator.authenticate_client(request)
        except Exception as e:
            raise e
            # raise AuthenticationException(e, error_code=codes.MALFORMED_OR_MISSING_BASIC_AUTH)

        if not valid:
            raise AuthenticationException(['Invalid basic auth'])

        data = request.json

        # Check Google Login
        if data.get("type") == "google":
            response = self.googleConnection(data).get('id_token')
            return jsonify(response)
        else:
            raise NotImplemented('Social connect with type: ' + data.get('type'))

    def googleConnection(self, token):
        if not token:
            raise ValidationException(['No id_token'])
        sub, data = googleAuth(token)

        print data
        email = data['email']
        user = User.query.filter_by(email=email).first()

        if not user:
            user = User.create(
                email,
                data.get('firstname'),
                data.get('lastname'))
            user.is_active = True
            db.session.add(user)

        user.profile.image = data.get('picture')

        db.session.commit()
        return user
