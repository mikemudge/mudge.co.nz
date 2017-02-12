import config
import json

from flask_testing import TestCase
from runner import create_app
from models import db


class BaseTestCase(TestCase):

    render_templates = False

    def create_app(self):
        config.TESTING = True
        config.SQLALCHEMY_DATABASE_URI = 'postgres://mudgeconzTest:test_password@localhost/mudgeconzTest'
        config.SQLALCHEMY_BINDS = {
            # Used for trails.
            'old_sqlite': 'sqlite:///firstproject.db',
        }
        config.PRESERVE_CONTEXT_ON_EXCEPTION = False
        config.SECRET_KEY = "Testing Secret"
        app = create_app(config)
        return app

    def setUp(self):
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()

    def newUser(self, username, password):
        return self.postJson('/api/register', jsonObj={
            'username': username,
            'password': password
        })

    def postJson(self, url, jsonObj):
        return self.client.post(
            url,
            data=json.dumps(jsonObj),
            content_type='application/json')

class Expectation:
    def __init__(self, value):
        self.value = value

    def toEqual(self, expected):
        if expected == self.value:
            return
        raise AssertionError("Not equal", self.value, expected)


def expect(value):
    return Expectation(value)
