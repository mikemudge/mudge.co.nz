import bcrypt
import config
import datetime
import models
import requests

from flask import request, jsonify, session
from functools import wraps
from models import db

def ensure_user(f):
    @wraps(f)
    def wrapper(*args, **kwds):
        # TODO handle exceptions while checking this?
        user = getCurrentAuth()
        if user:
            return f(user, *args, **kwds)
        else:
            # TODO better responses?
            # return notLoggedIn('Expired credentials, log in again')
            return notLoggedIn('Not Logged In')

    return wrapper

def getCurrentAuth():
    # TODO read cookie for auth token and user id.
    token = request.cookies.get(config.AUTH_COOKIE_ID)
    if not token:
        return None

    pieces = token.split('-')
    if len(pieces) < 2:
        return None
    user_id = int(pieces[0])
    auth_token = pieces[1]

    auth = models.UserAuth.query.filter_by(user_id=user_id, auth_token=auth_token).first()
    if auth and datetime.datetime.now() < auth.expires:
        return auth
    return None

def createNewAuth(user):
    session['logged_in'] = user.id
    auth = models.UserAuth(
        user=user,
        auth_token=bcrypt.gensalt(),
        expires=datetime.datetime.now() + datetime.timedelta(days=1)
    )
    print auth.expires
    db.session.add(auth)
    db.session.commit()
    # set cookie
    response = jsonify({
        'result': True,
        'auth': {
            'user_id': auth.user_id,
            'auth_token': auth.auth_token
        },
        'user': {
            'username': user.username,
            'name': user.name,
            'fullname': user.fullname,
            'id': user.id,
        }
    })
    response.set_cookie(config.AUTH_COOKIE_ID, "%s-%s" % (user.id, auth.auth_token))
    return response

def loginWithIdToken(id_token):
    (sub, userData) = googleAuth(id_token)
    user = models.User.query.filter_by(email=userData.get('email')).first()
    if not user:
        return notLoggedIn('No user found for that email')

    return createNewAuth(user)

def googleAuth(id_token):
    if not id_token:
        raise Exception('You did not provide a token')
    r = requests.get("https://www.googleapis.com/oauth2/v3/tokeninfo", params={"id_token": id_token})
    data = r.json()
    if "iss" not in data or "aud" not in data or not data["iss"].endswith("accounts.google.com"):
        print id_token
        print data
        raise Exception("We cannot authorize your Google login at this time.")
    if data["aud"] != config.GOOGLE_CLIENT_ID:
        raise Exception("We cannot verify your Google login at this time.")

    return data["sub"], data

def notLoggedIn(reason):
    response = jsonify({
        'error': reason
    })
    response.status_code = 403
    return response
