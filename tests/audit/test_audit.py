from apps.audit.models import AuditEvent
from shared.database import db
from apps.trail.models import TrailProgress, TrailProfile, Trail

from tests.base.base_test_case import BaseTestCase

class TestAudit(BaseTestCase):

    def testCreateAuditEvent(self):
        user = self.jsonClient.createLoggedInUser('createAuditEvent')
        trail = Trail(name='Test Trail')
        trail_profile = TrailProfile.get_or_create(user=user, trail=trail)

        ride = TrailProgress(distance=3, trail_profile=trail_profile)
        # FYI generic relations do not auto add their objects to the db.
        db.session.add(ride)

        # TODO use an endpoint which is audited.
        event = AuditEvent(who=user, object=ride, action='action', section='section')
        db.session.add(event)
        db.session.commit()

        self.assertEqual(event.action, 'action')
        self.assertEqual(event.who.email, 'createAuditEvent@test.mudge.co.nz')
        # TODO this isn't working right now???
        # self.assertEqual(event.object.distance, 3.0)
