from audit.models import AuditEvent
from shared.database import db
from trail.models import TrailRide

from tests.base.base_test_case import BaseTestCase

class TestTournament(BaseTestCase):

    def testCreateAuditEvent(self):
        ride = TrailRide(distance=3)
        # FYI generic relations do not auto add their objects to the db.
        db.session.add(ride)

        user = self.jsonClient.createLoggedInUser('createAuditEvent')

        # TODO use an endpoint which is audited.
        event = AuditEvent(who=user, object=ride, action='action', section='section')
        db.session.add(event)
        db.session.commit()

        self.assertEqual(event.action, 'action')
        self.assertEqual(event.who.email, 'createAuditEvent@test.mudge.co.nz')
        self.assertEqual(event.object.distance, 3.0)
