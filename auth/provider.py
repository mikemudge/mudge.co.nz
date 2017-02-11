from .models import Client

from flask_oauthlib.provider import OAuth2Provider

oauth = OAuth2Provider()

@oauth.clientgetter
def load_client(client_id):
    return Client.query.filter_by(client_id=client_id).first()

@oauth.grantgetter
def load_grant(client_id, code):
    return None

@oauth.grantsetter
def save_grant(client_id, code, request, *args, **kwargs):
    return None

@oauth.tokengetter
def load_token(access_token, refresh_token=None):

    # Validate the access_token jwt.
    # pull any pieces out of it, e.g user_id->user?

    print access_token
    return access_token

@oauth.tokensetter
def save_token(token, request, *args, **kwargs):
    # TODO not really sure when or why this happens.
    print token
    return token['access_token']
