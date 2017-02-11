from base_test_case import BaseTestCase

class TestFirst(BaseTestCase):

    def test_create_user(self):
        response = self.jsonClient.post('/api/register', {
            'email': 'me@test.mudge.co.nz',
            'password': '1234abcd',
            'firstname': 'Test',
            'lastname': 'User',
        })

        self.assertEqual(response.json, {
            'email': 'me@test.mudge.co.nz'
        })

    def test_login(self):
        self.jsonClient.post('/api/register', {
            'email': 'loginUser@test.mudge.co.nz',
            'password': '1234abcd',
            'firstname': 'Test',
            'lastname': 'User',
        })

        response = self.jsonClient.post('/api/login', {
            'email': 'loginUser@test.mudge.co.nz',
            'password': '1234abcd',
        })

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
            'email': 'loginUser@test.mudge.co.nz',
            'profile': profile
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
