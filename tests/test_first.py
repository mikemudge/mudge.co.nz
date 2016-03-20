import datetime
import models

from base_test_case import BaseTestCase, expect
from models import db


class TestFirst(BaseTestCase):

    def test_empty_db(self):
        response = self.client.get('/hello/')
        self.assertEquals("", response.data)
        self.assert_template_used('angular.tmpl')
        self.assertEquals(self.get_context_variable('angular'), {
            'app': 'main',
            'base': '/hello/',
            'config': {}
        })

    def test_api(self):
        response = self.client.get('/api/user')
        self.assertEquals(response.json, [])

    def test_api_with_user(self):
        user = models.User(username="mike", hash="ha")
        db.session.add(user)
        db.session.commit()

        response = self.client.get('/api/user')
        self.assertEquals(response.json, [{
            'username': 'mike',
            'hash': 'ha',
            'id': 1
        }])

    def test_register(self):
        response = self.postJson('/api/register', {
            'username': 'mike',
            'password': 'mike'
        })

        expect(response.json['result']).toEqual(True)
        expect(response.json['user']).toEqual({
            'username': 'mike',
            'fullname': None,
            'name': None,
            'id': 1
        })

    def test_login(self):
        self.newUser('mike', 'mike')

        response = self.postJson('/api/login', {
            'username': 'mike',
            'password': 'mike'
        })

        expect(response.json['result']).toEqual(True)
        expect(response.json['user']).toEqual({
            'username': 'mike',
            'fullname': None,
            'name': None,
            'id': 1
        })

    def test_login_authentication_token(self):
        response = self.newUser('mike', 'mike')

        auth = response.json['auth']
        response = self.postJson('/api/login', {
            'auth': auth,
        })

        expect(response.json).toEqual({
            'result': True,
            'auth': auth,
            'user': {
                'username': 'mike',
                'fullname': None,
                'name': None,
                'id': 1
            }
        })

    def test_expired_authentication_token(self):
        self.newUser('mike', 'mike')

        user_auth = models.UserAuth.query.one()
        user_auth.expires = datetime.datetime.now()
        db.session.commit()

        response = self.postJson('/api/login', {
            'auth': {
                'user_id': user_auth.user_id,
                'auth_token': user_auth.auth_token,
            }
        })

        expect(response.json).toEqual({
            'result': False,
            'error': 'token expired'
        })

    def test_wrong_password(self):
        self.newUser('mike', 'mike')

        response = self.postJson('/api/login', {
            'username': 'mike',
            'password': 'wrong'
        })

        expect(response.json).toEqual({
            'result': False,
        })

    def test_unknown_user(self):
        self.newUser('mike', 'mike')

        response = self.postJson('/api/login', {
            'username': 'whoisthis',
            'password': 'doesntmatter'
        })

        expect(response.json).toEqual({
            'result': False,
        })

    def test_user_already_exists(self):
        self.newUser('mike', 'mike')

        response = self.postJson('/api/register', {
            'username': 'mike',
            'password': 'doesntmatter'
        })

        expect(response.json).toEqual({
            'result': False,
            'error': 'User is already registered',
        })
