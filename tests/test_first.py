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

        self.assertEquals(response.json, {
            'result': True,
            'user': {
                'username': 'mike',
                'fullname': None,
                'name': None,
                'id': 1
            }
        })

    def test_register_adds_user(self):
        self.postJson('/api/register', {
            'username': 'mike',
            'password': 'mike'
        })

        # Make sure the DB was updated.
        user = models.User.query.one()
        self.assertEquals(models.simpleSerialize(user), {
            'username': u'mike',
            'hash': user.hash,
            'id': 1
        })

    def test_login(self):
        self.newUser('mike', 'mike')

        response = self.postJson('/api/login', {
            'username': 'mike',
            'password': 'mike'
        })

        expect(response.json).toEqual({
            'result': True,
            'user': {
                'username': 'mike',
                'fullname': None,
                'name': None,
                'id': 1
            }
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
            'message': '(sqlite3.IntegrityError) UNIQUE constraint failed: users.username',
            'result': 'this user is already registered'
        })
