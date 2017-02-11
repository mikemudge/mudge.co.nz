import config
import json

from flask_testing import TestCase
from main import create_app
from app.models import db
from auth.models import Client, Scope, User

class BaseTestCase(TestCase):

    render_templates = False

    def create_app(self):
        config.TESTING = True
        config.SQLALCHEMY_DATABASE_URI = "sqlite://"
        config.PRESERVE_CONTEXT_ON_EXCEPTION = False
        config.SECRET_KEY = "Testing Secret"
        app = create_app(config)
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

    def newUser(self, username, password):
        return self.postJson('/api/register', jsonObj={
            'username': username,
            'password': password
        })

    def assertContains(self, got, expected):
        for k, expect in expected.iteritems():
            if k not in got:
                raise AssertionError('missing ' + k)
            self.assertEquals(got[k], expect)

    # Use jsonClient.post instead.
    def postJson(self, url, jsonObj):
        return self.client.post(
            url,
            data=json.dumps(jsonObj),
            content_type='application/json')

class JsonClient():

    def __init__(self, client):
        self.client = client

        client = Client(
            name="Test Client",
            client_key="random_key",
            client_secret="random_secret",
            scopes=[
                Scope('basic')
            ])
        db.session.add(client)
        db.session.commit()

    def createLoggedInUser(self, username):
        user = User.create(
            username + '@test.mudge.co.nz',
            'Test',
            'User',
            password='1234abcd')
        user.is_active = True
        db.session.add(user)
        db.session.commit()

        # Set auth header?

        return user

    def post(self, url, data={}):
        response = self.client.post(
            url,
            data=json.dumps(data),
            content_type="application/json")

        try:
            response.json
        except ValueError:
            print 'Not JSON'
            print response.status_code, 'for', url
            print response.data
            raise Exception('Not JSON for ' + url)

        if response.status_code != 200:
            print response.status_code, 'for', url
            print response.json
            raise Exception(response.status_code + ' for ' + url)

        return response

    def get(self, url):
        response = self.client.get(url)

        try:
            response.json
        except ValueError:
            print 'Not JSON'
            print response.status_code, 'for', url
            print response.data
            raise Exception('Not JSON for ' + url)

        if response.status_code != 200:
            print response.status_code, 'for', url
            print response.json
            raise Exception(response.status_code + ' for ' + url)

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
