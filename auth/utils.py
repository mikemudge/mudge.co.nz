
from flask import current_app
from shared.exceptions import AuthenticationException
from shared.exceptions import sentry
import requests

def googleAuth(id_token):
    if not id_token:
        raise AuthenticationException('You did not provide a token')

    if not current_app.config.get('VERIFY_GOOGLE_AUTH'):
        sentry.captureMessage('Unsafe googleapis call')
    r = requests.get(
        "https://www.googleapis.com/oauth2/v3/tokeninfo",
        params={"id_token": id_token},
        verify=current_app.config.get('VERIFY_GOOGLE_AUTH'))
    data = r.json()
    if "iss" not in data or "aud" not in data or not data["iss"].endswith("accounts.google.com"):
        print('google response', data)
        print(id_token)
        raise AuthenticationException("We cannot authorize your Google login at this time.")
    if data["aud"] != current_app.config.get('GOOGLE_CLIENT_ID'):
        raise AuthenticationException("We cannot verify your Google login at this time.")

    # TODO check iat and exp?
    # TODO can we validate sub?

    return data
