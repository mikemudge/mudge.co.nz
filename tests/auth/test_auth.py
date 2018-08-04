import base64

from tests.base.base_test_case import BaseTestCase
from shared.database import db
from auth.models import Profile, User, Client, Scope
from shared import init_command
from flask import current_app

import sqlalchemy

class TestLogin(BaseTestCase):

    # TODO add self registration?
    # def test_create_user(self):
    #     response = self.jsonClient.post('/auth/token', {
    #         'email': 'me@test.mudge.co.nz',
    #         'password': '1234abcd',
    #         'firstname': 'Test',
    #         'lastname': 'User',
    #     })

    #     self.assertEqual(response.json, {
    #         'email': 'me@test.mudge.co.nz'
    #     })

    def test_delete_scope(self):
        Scope.query.delete()

        # Still have a client with no scopes.
        clients = Client.query.all()
        self.assertEqual(len(clients), 1)
        self.assertEqual(len(clients[0].scopes), 0)

    def test_init(self):
        init_command.auth()

        client_id = current_app.config.get('CLIENT_ID')
        client = Client.query.filter_by(client_id=client_id).one()
        self.assertEqual(client.name, "Web client")

    def test_no_orphan_profile(self):
        p = Profile()
        db.session.add(p)
        # message = 'null value in column "user_id" violates not-null constraint'
        # with self.assertRaisesRegexp(sqlalchemy.exc.IntegrityError, message):
        db.session.commit()

    def test_no_user_without_profile(self):
        u = User()
        db.session.add(u)
        message = 'null value in column "profile_id" violates not-null constraint'
        with self.assertRaisesRegexp(sqlalchemy.exc.IntegrityError, message):
            db.session.commit()

    def test_login(self):
        user = self.jsonClient.createUser('loginUser')

        clientApp = self.jsonClient.clientApp

        # To talk to the API you must identify a client.
        auth = base64.b64encode((clientApp.client_id + ':' + clientApp.client_secret).encode('ascii'))
        headers = {
            'Authorization': 'Basic ' + auth.decode("utf-8")
        }

        response = self.client.post(
            "/auth/token",
            data={
                'grant_type': "password",
                'username': 'loginUser@test.mudge.co.nz',
                'password': '1234abcd',
            },
            content_type='application/x-www-form-urlencoded',
            headers=headers)

        if response.status_code != 200:
            print(response.status_code, 'for /auth/token')
            print(response.json)

        result = response.json
        print(result)
        self.assertContains(response.json, {
            'access_token': result['access_token'],
            'expires_in': 3600,
            'refresh_token': result['refresh_token'],
            'token_type': 'Bearer'
        })
        print(result['access_token'])
        claims = self.parseJwt(result['access_token'])
        self.assertContains(claims, {
            'aud': 'mudge.co.nz',
            'exp': claims['iat'] + 3600,
            'iat': claims['iat'],
            'iss': 'mudge.co.nz'
        })

        self.assertEqual(claims['client'], {
            'id': str(clientApp.id),
            'client_id': clientApp.client_id,
            'name': 'Test Client'
        })
        # TOOD scopes order can change?
        # self.assertEqual(claims['scopes'], ['basic', 'profile'])

        self.assertEqual(claims['user'], {
            'id': str(user.id),
            'email': 'loginUser@test.mudge.co.nz',
        })

    def test_access(self):
        self.jsonClient.add_scope('user')
        user = self.jsonClient.createLoggedInUser('test_auth')

        response = self.jsonClient.get('/api/user/%s' % user.id)

        user = response.json['data']
        profile = {
            'id': user['profile']['id'],
            'firstname': 'Test',
            'lastname': 'User',
            'image': None,
            'username': 'test_auth',
        }
        self.assertEqual(response.json['data']['profile'], profile)
        self.assertEqual(response.json['data'], {
            'id': user['id'],
            'email': 'test_auth@test.mudge.co.nz',
            'profile': profile
        })

    def test_no_access(self):
        # Need a user to try and access their profile.
        user = self.jsonClient.createUser('test_auth')

        self.jsonClient.logout()

        response = self.jsonClient.get('/api/user/%s' % user.id)

        # We didn't provide a Bearer token, because no one is logged in.
        self.assertEqual(response.json, {
            'error_code': None,
            'message': ['No token found'],
            'status_code': 401
        })

    def test_invalid_access(self):
        user = self.jsonClient.createUser('test_auth')

        response = self.jsonClient.get(
            '/api/user/%s' % user.id,
            extraHeaders={
                'Authorization': 'Bearer a.lies.b'
            })

        print(response)
        # We didn't provide a Bearer token, because no one is logged in.
        self.assertEqual(response.json, {
            'error_code': None,
            'message': ['Invalid jwt'],
            'status_code': 401
        })
