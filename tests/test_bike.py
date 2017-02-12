import models

from base_test_case import BaseTestCase
from models import db


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
