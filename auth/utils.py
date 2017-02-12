import config
import requests

from flask import jsonify

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
