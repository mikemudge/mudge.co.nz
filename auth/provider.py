from .models import Client, User
from calendar import timegm
from datetime import datetime
from functools import wraps
from flask import current_app, jsonify, request
from shared.exceptions import AuthenticationException

import jwt

def setup(app):
    pass

def _basic_auth_client():
    if not request.authorization:
        raise AuthenticationException(['Bad basic auth'])

    client_id = request.authorization.get('username')
    client_secret = request.authorization.get('password')
    client = Client.query.filter_by(client_id=client_id).first()

    if not client or client.client_secret != client_secret:
        raise AuthenticationException(['Invalid client'])

    return client

class Token():
    def __init__(self, data, access_token):
        user_id = data.get('user', {}).get('id')
        if not user_id:
            raise Exception('No user')

        self.access_token = access_token
        self.refresh_token = access_token
        self.user = User.query.filter_by(id=user_id).first()

        self.client_id = data.get("client_id")
        self._scopes = data.get("scopes")
        self.expires = datetime.utcfromtimestamp(data.get('exp'))

    @property
    def scopes(self):
        return self._scopes.split()

def validate_token(token):
    try:
        token = token.decode('utf-8')
    except AttributeError:
        pass

    try:
        return jwt.decode(
            token,
            key=current_app.config.get('JWT_TOKEN_SECRET_KEY'),
            algorithms=[current_app.config.get('JWT_TOKEN_ALGORITHM')],
            audience='mudge.co.nz',
            issuer='mudge.co.nz'
        )

    except jwt.ExpiredSignatureError:
        raise AuthenticationException(['expired jwt'])

    except jwt.PyJWTError:
        # JWT can't be verified, maybe signed with a different key?
        raise AuthenticationException(['Invalid jwt'])

def create_token(request, client, user):
    token_body = _create_token_body(request, client, user)

    try:
        return jwt.encode(
            token_body,
            current_app.config.get('JWT_TOKEN_SECRET_KEY'),
            algorithm=current_app.config.get('JWT_TOKEN_ALGORITHM'))

    except jwt.PyJWTError as e:
        print(e)
        raise AuthenticationException(['Invalid jwt signing'])

def _create_token_body(request, client, user):

    # Needs to be a unix timestamp.
    timeStampNow = timegm(datetime.utcnow().utctimetuple())

    token = {
        'aud': 'mudge.co.nz',
        'exp': timeStampNow + 3600,
        'iat': timeStampNow,
        'iss': 'mudge.co.nz',
    }

    scopes = [s.name for s in client.scopes]
    if user and user.admin:
        scopes.append('admin')

    token['scopes'] = ' '.join(scopes)
    token['client_id'] = client.client_id
    token['client'] = {
        'id': str(client.id),
        'client_id': client.client_id,
        'name': client.name,
    }
    token['user'] = {
        'id': str(user.id),
        'email': user.email,
    }

    return token

class OAuth2Provider():

    def init_app(self, app):
        pass

    # Protects a view, requiring a valid Bearer token with the given scopes.
    def require_oauth(self, *scopes):
        def wrapper(f):
            @wraps(f)
            def decorated(*args, **kwargs):
                auth_header = request.headers.get('Authorization', '')
                if not auth_header.startswith('Bearer '):
                    raise AuthenticationException(['No token found'])

                access_token = auth_header[len('Bearer '):]
                data = validate_token(access_token)
                token = Token(data, access_token)

                missing_scopes = [s for s in scopes if s not in token.scopes]
                if missing_scopes:
                    response = jsonify({
                        'message': 'Insufficient scope.',
                        'detail': 'Missing the scope(s) required for this endpoint [%s]' % ','.join(missing_scopes),
                        'status_code': 403
                    })
                    response.status_code = 403
                    return response

                request.oauth = token
                return f(*args, **kwargs)
            return decorated
        return wrapper

    # Implements the OAuth2 "password" grant, the only grant type this app issues.
    def token_handler(self, f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.form.get('grant_type') != 'password':
                raise AuthenticationException(['Unsupported grant_type'])

            client = _basic_auth_client()

            email = request.form.get('username')
            password = request.form.get('password')
            user = User.query.filter_by(email=email).first()
            if not user or not user.check_password(password):
                raise AuthenticationException(['Not a valid user'])

            access_token = create_token(request, client, user)
            return jsonify({
                'access_token': access_token,
                'refresh_token': access_token,
                'expires_in': 3600,
                'token_type': 'Bearer'
            })
        return decorated

oauth = OAuth2Provider()
