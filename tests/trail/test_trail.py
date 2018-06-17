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

    def test_get_trails(self):
        self.jsonClient.createLoggedInUser('get_trails')

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
        self.jsonClient.createLoggedInUser('get_trail')

        response = self.jsonClient.get('/api/trail/v1/trail/%s' % str(self.trail.id))
        self.assertEqual(response.json['data'], {
            'id': response.json['data']['id'],
            'name': 'Test Trail',
            'trail_url': 'test_trail.json',
            'trail_profiles': [],
        })

    def test_add_walk(self):
        user = self.jsonClient.createLoggedInUser('trail_create_user')
        trail_profile = TrailProfile.get_or_create(user=user, trail=self.trail, activity=TrailProfile.ACTIVITY_WALK)
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
        user = self.jsonClient.createLoggedInUser('trail_get_profiles_on_trail')
        db.session.commit()

        trail_profile = TrailProfile.get_or_create(
            user=user,
            trail=self.trail
        )

        response = self.jsonClient.get('/api/trail/v1/profile?trail_id=%s' % str(self.trail.id))
        self.assertContains(response.json['data'][0], {
            'id': str(trail_profile.id),
            'name': 'Test User',
            'trail_id': str(self.trail.id),
            'user_id': str(user.id),
        })

    def test_delete_profile(self):
        user = self.jsonClient.createLoggedInUser('delete_profile')

        profile = TrailProfile.get_or_create(user=user, trail=self.trail)
        db.session.add(profile)
        TrailProgress(trail_profile=profile, distance=1.0)
        db.session.commit()

        self.assertEquals(TrailProgress.query.count(), 1)

        # Should clear rides as well.
        TrailProfile.query.delete()

        self.assertEquals(TrailProgress.query.count(), 0)
