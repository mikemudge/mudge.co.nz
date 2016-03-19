import bcrypt
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
        self.postJson('/api/register', {
            'username': 'mike',
            'password': 'mike'
        })

        user = models.User.query.one()
        expected = {
            'username': u'mike',
            'hash': user.hash,
            'id': 1
        }
        self.assertEquals(models.simpleSerialize(user), expected)

        response = self.client.get('/api/user')
        self.assertEquals(response.json, [expected])

    def test_login(self):
        # create user.
        self.postJson('/api/register', jsonObj={
            'username': 'mike',
            'password': 'mike'
        })

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
