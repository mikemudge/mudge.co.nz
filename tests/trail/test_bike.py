from api import models

from tests.base.base_test_case import BaseTestCase
from shared.database import db

class TestBike(BaseTestCase):

    def test_biker(self):
        biker = models.Biker(name='Test Biker')
        biker.rides.append(models.Ride(distance='100'))
        db.session.add(biker)
        db.session.commit()

        response = self.client.get('/api/biker')
        self.assertEquals(response.json, [{
            'id': 1,
            'name': 'Test Biker',
            'rides': [{
                'id': 1,
                'distance': '100',
                'biker_id': 1,
            }]
        }])

    def test_create_trail_biker(self):
        response = self.jsonClient.post('/api/trail/v1/biker', {
            'name': 'Test User'
        })

        biker = response.json['data']
        self.assertEquals(biker, {
            'color': None,
            'id': biker['id'],
            'name': 'Test User',
            'rides': []
        })

    def test_create_ride(self):
        biker = self.newBiker('Tester')

        response = self.jsonClient.post('/api/trail/v1/ride', {
            'biker_id': biker['id'],
            'distance': 1
        })

        ride = response.json['data']
        self.assertEquals(ride, {
            'id': ride['id'],
            'date': ride['date'],
            'distance': 1,
            'biker': {
                'color': biker['color'],
                'id': biker['id'],
                'name': biker['name'],
            }
        })

    def test_create_ride_on_date(self):
        biker = self.newBiker('Tester')

        response = self.jsonClient.post('/api/trail/v1/ride', {
            'biker_id': biker['id'],
            # Javascript date serialization.
            'date': '1997-05-05T02:11:13.659Z',
            'distance': 1
        })

        ride = response.json['data']
        self.assertEquals(ride.get('date'), '1997-05-05T02:11:13.659000+00:00')

        self.assertEquals(ride, {
            'id': ride['id'],
            'date': ride['date'],
            'distance': 1.0,
            'biker': {
                'color': biker['color'],
                'id': biker['id'],
                'name': biker['name'],
            }
        })

    def newBiker(self, name):
        response = self.jsonClient.post('/api/trail/v1/biker', {
            'name': 'Test User'
        })

        return response.json['data']
