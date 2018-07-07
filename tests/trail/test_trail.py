import uuid

from shared.database import db
from tests.base.base_test_case import BaseTestCase
from apps.trail.models import Trail, TrailProfile, TrailProgress

class TestTrail(BaseTestCase):

    def setUp(self):
        super(TestTrail, self).setUp()

        self.jsonClient.add_scope('trail')
        # Requires a trail to log walks against.
        self.trail = Trail(name='Test Trail', trail_url='test_trail.json')
        db.session.add(self.trail)
        db.session.commit()

        self.user = self.jsonClient.createLoggedInUser(self._testMethodName)

    def test_get_trails(self):
        # Add another trail so there is multiple.
        trail = Trail(name='Trail 2', trail_url='another.json')
        db.session.add(trail)

        response = self.jsonClient.get('/api/trail/v1/trail')
        self.assertEquals(len(response.json['data']), 2)
        self.assertContains(response.json['data'][0], {
            'name': 'Trail 2',
            'trail_url': 'another.json',
        })
        self.assertContains(response.json['data'][1], {
            'name': 'Test Trail',
            'trail_url': 'test_trail.json',
        })

    def test_get_trail(self):
        response = self.jsonClient.get('/api/trail/v1/trail/%s' % str(self.trail.id))
        self.assertEqual(response.json['data'], {
            'id': response.json['data']['id'],
            'name': 'Test Trail',
            'trail_url': 'test_trail.json',
            'trail_profiles': [],
        })

    def test_add_walk(self):
        trail_profile = TrailProfile.get_or_create(
            user=self.user,
            trail=self.trail,
            activity=TrailProfile.ACTIVITY_WALK)
        db.session.commit()

        print('trail_prfile', str(trail_profile.id))
        response = self.jsonClient.post('/api/trail/v1/progress', {
            'distance': 100,
            'trail_profile_id': str(trail_profile.id),
        })
        add_walk = response.json['data']
        print(add_walk)
        self.assertContains(add_walk, {
            'distance': 100,
            'id': add_walk['id'],
        })

    def test_get_profiles_for_trail(self):
        trail_profile = TrailProfile.get_or_create(
            user=self.user,
            trail=self.trail
        )

        response = self.jsonClient.get('/api/trail/v1/profile?trail_id=%s' % str(self.trail.id))
        self.assertContains(response.json['data'][0], {
            'id': str(trail_profile.id),
            'name': 'Test User',
            'trail_id': str(self.trail.id),
            'user_id': str(self.user.id),
        })

    def test_create_profile(self):
        response = self.jsonClient.post('/api/trail/v1/profile', {
            'trail_id': str(self.trail.id),
            'name': 'Test User',
            'color': '#FF0000'
        })

        expected = {
            'name': 'Test User',
            'trail_id': str(self.trail.id),
            'user_id': str(self.user.id),
        }

        # Check the response
        trail_profile = response.json['data']
        self.assertContains(trail_profile, expected)
        # Then make sure the new profile is gettable.
        response = self.jsonClient.get('/api/trail/v1/profile/%s' % str(trail_profile['id']))
        self.assertContains(trail_profile, expected)

    def test_create_profile_for_bad_trail(self):
        response = self.jsonClient.post('/api/trail/v1/profile', {
            'trail_id': str(uuid.uuid4()),
            'name': 'Test User',
            'color': '#FF0000'
        })

        # Check the response
        error = response.json['errors'][0]
        self.assertContains(error, {
            'message': 'DB error creating a TrailProfile'
        })

    def test_get_bad_trail(self):
        response = self.jsonClient.get('/api/trail/v1/trail/%s' % str(uuid.uuid4()))

        self.assertEqual(response.json['errors'][0], {
            'message': 'Trail not found',
        })

    def test_delete_profile(self):
        profile = TrailProfile.get_or_create(user=self.user, trail=self.trail)
        db.session.add(profile)
        TrailProgress(trail_profile=profile, distance=1.0)
        db.session.commit()

        self.assertEquals(TrailProgress.query.count(), 1)

        # Should clear rides as well.
        TrailProfile.query.delete()

        self.assertEquals(TrailProgress.query.count(), 0)
