from .models import Client, User
from calendar import timegm
from datetime import datetime
from flask import current_app as app
from flask_oauthlib.provider import OAuth2Provider
from jose import jwt
from shared.exceptions import AuthenticationException, ValidationException

oauth = OAuth2Provider()

def setup(app):
    app.config.setdefault('OAUTH2_PROVIDER_TOKEN_GENERATOR', create_token_generator)

@oauth.clientgetter
def load_client(client_id):
    return Client.query.filter_by(client_id=client_id).first()

@oauth.usergetter
def get_user(email, password, *args, **kwargs):
    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        raise AuthenticationException(['Not a valid user'])

    return user

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

    def delete(self):
        print 'delete', self.scopes
        # TODO can this work?
        pass

    # The scopes property must be a string for require_oauth to work.refresh_token
    # Just magic shit you are supposed to know.
    @property
    def scopes(self):
        return self._scopes.split()


@oauth.tokengetter
def load_token(access_token=None, refresh_token=None):
    print 'load token', access_token, refresh_token
    if access_token:
        # Validate the access_token jwt.
        # pull any pieces out of it, e.g user_id->user?
        # This is what is loaded into request.oauth
        data = validate_token(access_token)
        print data
        # TODO should make this an object.
        token = Token(data, access_token)
        return token
    elif refresh_token:
        print 'Unsupported refresh token?'
    else:
        raise AuthenticationException(['No token found'])

@oauth.tokensetter
def save_token(token, request, *args, **kwargs):
    print 'load token', token

    # save a token?
    # We don't actually care about this as we expect clients to keep them.
    return token

# We don't deal in grants, but this thing won't work without them?
@oauth.grantgetter
def load_grant(client_id, code):
    return None

@oauth.grantsetter
def save_grant(client_id, code, request, *args, **kwargs):
    return None

def validate_token(token):
    try:
        token = token.decode('utf-8')
    except AttributeError:
        pass

    try:
        token_body = jwt.decode(
            token=token,
            key=app.config.get('JWT_TOKEN_SECRET_KEY'),
            algorithms=app.config.get('JWT_TOKEN_ALGORITHM'),
            # Skip some of the validations.
            options={
                'verify_nbf': False,
                'verify_sub': False,
                'verify_jti': False,
            },
            audience='mudge.co.nz',
            issuer='mudge.co.nz'
        )

        return token_body

    except jwt.ExpiredSignatureError:
        raise AuthenticationException(['expired jwt'])

    except jwt.JWTError:
        raise ValidationException(['Invalid jwt'])

def create_token_generator(request):
    token_body = create_token(request, request.client, request.user)

def create_token(request, client, user):
    token_body = _create_token_body(request, client, user)

    try:
        return jwt.encode(token_body,
                          app.config.get('JWT_TOKEN_SECRET_KEY'),
                          algorithm=app.config.get('JWT_TOKEN_ALGORITHM'))

    except jwt.JWSError:
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

    # Add some client stuff to the token?
    token['scopes'] = ' '.join([s.name for s in client.scopes])
    # TODO use the magic serializer?
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
