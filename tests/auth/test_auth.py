import base64

from tests.base.base_test_case import BaseTestCase

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

    def test_login(self):
        user = self.jsonClient.createUser('loginUser')

        clientApp = self.jsonClient.clientApp

        # To talk to the API you must identify a client.
        auth = base64.b64encode(clientApp.client_id + ':' + clientApp.client_secret)
        headers = {
            'Authorization': 'Basic ' + auth
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

        result = response.json
        self.assertContains(response.json, {
            'access_token': result['access_token'],
            'expires_in': 3600,
            'refresh_token': result['refresh_token'],
            'token_type': 'Bearer'
        })
        print result['access_token']
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
        user = self.jsonClient.createLoggedInUser('test_auth')

        response = self.jsonClient.get('/api/user/%s' % user.id)

        user = response.json['data']
        profile = {
            'id': user['profile']['id'],
            'firstname': 'Test',
            'lastname': 'User',
            'image': None,
            'username': None,
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

        # We didn't provide a Bearer token, because no one is logged in.
        self.assertEqual(response.json, {
            'error_code': 'UNKNOWN_ERROR',
            'message': ['Invalid jwt'],
            'status_code': 400
        })
