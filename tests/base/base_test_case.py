import base64
import json
import logging

from app import create_app
from auth.models import Client, Scope, User
from flask_testing import TestCase
from jose import jwt
from shared.database import db

# Turn down logging.
logging.getLogger('oauthlib').setLevel(logging.WARN)
logging.getLogger('flask_oauthlib').setLevel(logging.WARN)

class BaseTestCase(TestCase):

    render_templates = False

    def create_app(self):
        app = create_app('settings.test')
        return app

    def setUp(self):
        db.session.remove()
        db.drop_all()
        db.create_all()

        self.jsonClient = JsonClient(self.client)

    def tearDown(self):
        self.jsonClient = None
        db.session.remove()
        db.drop_all()

    def assertContains(self, got, expected):
        for k, expect in expected.iteritems():
            if k not in got:
                raise AssertionError('missing ' + k)
            self.assertEquals(got[k], expect)

    def assertEqual(self, got, expected):
        if type(expected) is dict:
            if type(got) is not dict:
                raise AssertionError('Expected dict but got %s' % got)

            for k, v in expected.iteritems():
                if k not in got:
                    raise AssertionError('Expected %s but it was missing' % k)
                try:
                    self.assertEqual(got[k], v)
                except AssertionError as e:
                    raise AssertionError("%s.%s" % (k, e.message))

            # All things were as expected. Now check for extras.
            for k, v in got.iteritems():
                if k not in expected:
                    raise AssertionError('Unexpected %s=%s' % (k, v))

        else:
            # All other types get the default.
            super(TestCase, self).assertEqual(got, expected)

    def parseJwt(self, token):
        return jwt.get_unverified_claims(token)

    # Use jsonClient.post instead.
    def postJson(self, url, jsonObj):
        return self.jsonClient.post(url, jsonObj)

class JsonClient():

    def __init__(self, client):
        self.client = client
        self.users = {}
        self.userJwt = None

        self.clientApp = Client.create("Test Client")
        self.clientApp.scopes = [
            Scope(name='read_user'),
            Scope(name='basic'),
            Scope(name='profile'),
        ]
        db.session.add(self.clientApp)
        db.session.commit()

    def add_scope(self, scope):
        self.clientApp.scopes.append(Scope(name=scope))

    def createLoggedInUser(self, username):
        user = self.createUser(username)
        self.loginAs(username)
        return user

    def createUser(self, username):
        user = User.create(
            username + '@test.mudge.co.nz',
            password='1234abcd')
        user.is_active = True
        db.session.add(user)
        db.session.commit()

        self.users[username] = {
            'email': user.email,
            'password': '1234abcd'
        }
        return user

    def loginAs(self, username):
        user = self.users[username]

        # To talk to the API you must identify a client.
        auth = base64.b64encode(self.clientApp.client_id + ':' + self.clientApp.client_secret)
        headers = {
            'Authorization': 'Basic ' + auth
        }

        response = self.client.post(
            "/auth/token",
            data={
                'grant_type': "password",
                'username': user['email'],
                'password': user['password'],
            },
            content_type='application/x-www-form-urlencoded',
            headers=headers)

        if response.status_code != 200:
            print 'login failed'
            print response.json

        # Save this to auth with in future.
        self.userJwt = response.json['access_token']

    def logout(self):
        self.userJwt = None

    def post(self, url, data={}):
        headers = {}
        if self.userJwt:
            headers['Authorization'] = 'Bearer %s' % self.userJwt
        response = self.client.post(
            url,
            data=json.dumps(data),
            content_type="application/json",
            headers=headers)

        try:
            response.json
        except ValueError:
            print 'Not JSON'
            print response.status_code, 'for', url
            print response.data

        if response.status_code != 200:
            print response.status_code, 'for', url
            print response.json

        return response

    def get(self, url, extraHeaders=None):
        headers = {}
        if extraHeaders:
            headers.update(extraHeaders)
        if self.userJwt:
            headers['Authorization'] = 'Bearer %s' % self.userJwt

        response = self.client.get(url, headers=headers)

        try:
            data = response.json
        except ValueError:
            print 'Not JSON'
            print response.status_code, 'for', url
            print response.data

        if response.status_code != 200:
            print response.status_code, 'for', url
            print data

        return response


class Expectation:
    def __init__(self, value):
        self.value = value

    def toEqual(self, expected):
        if expected == self.value:
            return
        raise AssertionError("Not equal", self.value, expected)


def expect(value):
    return Expectation(value)
