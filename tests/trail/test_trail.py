from shared.database import db
from tests.base.base_test_case import BaseTestCase
from trail.models import Trail, TrailProfile, TrailProgress

class TestTrail(BaseTestCase):

    def setUp(self):
        super(TestTrail, self).setUp()

        self.jsonClient.add_scope('trail')
        # Requires a trail to log walks against.
        self.trail = Trail(name='Test Trail', activity=Trail.ACTIVITY_WALK)
        db.session.add(self.trail)

    def test_get_trails(self):
        self.jsonClient.createLoggedInUser('get_trails')

        response = self.jsonClient.get('/api/trail/v1/trail')
        self.assertContains(response.json['data'][0], {
            'id': response.json['data'][0]['id'],
            'name': 'Test Trail',
            'activity': 'Walking Trail',
        })

    def test_get_trail(self):
        self.jsonClient.createLoggedInUser('get_trail')

        response = self.jsonClient.get('/api/trail/v1/trail/%s' % str(self.trail.id))
        self.assertEqual(response.json['data'], {
            'id': response.json['data']['id'],
            'name': 'Test Trail',
            'trail_profiles': [],
            'activity': 'Walking Trail',
        })

    def test_add_walk(self):
        self.jsonClient.createLoggedInUser('trail_create_user')

        response = self.jsonClient.post('/api/trail/v1/progress', {
            'distance': 100,
            # TODO could pass up a trail_profile instead?
            'trail_id': str(self.trail.id),
        })
        add_walk = response.json['data']
        self.assertEqual(add_walk, {
            'date_created': add_walk['date_created'],
            'distance': 100,
            'id': add_walk['id'],
        })

    def test_get_profiles_for_trail(self):
        self.jsonClient.createLoggedInUser('trail_get_profiles_on_trail')

        response = self.jsonClient.post('/api/trail/v1/progress', {
            'distance': 100,
            'trail_id': str(self.trail.id),
        })
        walk = response.json['data']

        response = self.jsonClient.get('/api/trail/v1/trail/%s' % str(self.trail.id))
        self.assertEqual(response.json['data'], {
            'activity': 'Walking Trail',
            'id': response.json['data']['id'],
            'name': 'Test Trail',
            'trail_profiles': [{
                'color': None,
                'progress': [walk],
            }]
        })

    def test_delete_profile(self):
        user = self.jsonClient.createLoggedInUser('delete_profile')

        profile = TrailProfile(user=user, trail=self.trail)
        db.session.add(profile)
        TrailProgress(trail_profile=profile)
        db.session.commit()

        self.assertEquals(TrailProgress.query.count(), 1)

        # Should clear rides as well.
        TrailProfile.query.delete()

        self.assertEquals(TrailProgress.query.count(), 0)
