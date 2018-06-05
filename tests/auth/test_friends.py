from tests.base.base_test_case import BaseTestCase

class TestFriends(BaseTestCase):

    def setUp(self):
        super(TestFriends, self).setUp()

        self.jsonClient.add_scope('user')
        self.user = self.jsonClient.createLoggedInUser(self._testMethodName)

    def test_add_friend(self):
        u2 = self.jsonClient.createUser('friend')

        response = self.jsonClient.post('/auth/friends', {
            'friend_id': str(u2.id),
        })

        self.assertEqual(response.json['data'].get('friends'), [
            {'id': str(u2.id)}
        ])

    def test_get_friend(self):
        u2 = self.jsonClient.createUser('friend')
        self.addFriend(u2)

        response = self.jsonClient.get('/auth/friends')

        self.assertContains(response.json['data'][0], {
            'id': str(u2.id),
            'email': 'friend@test.mudge.co.nz',
        })

    def addFriend(self, user):
        self.jsonClient.post('/auth/friends', {
            'friend_id': str(user.id),
        })
