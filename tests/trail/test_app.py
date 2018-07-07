
from flask_migrate import upgrade, downgrade
from tests.base.base_test_case import BaseTestCase
from apps.audit.models import AuditEvent
from shared.database import db

class TestTrail(BaseTestCase):

    def setUp(self):
        super(TestTrail, self).setUp()

    def test_migrate(self):
        # Any tables not managed by alembic must be removed here.
        # Otherwise they can break the migration.
        # These really should exist in code without a migration?
        AuditEvent.__table__.drop(db.engine)

        # Test migration downgrade to base and then upgrade.
        downgrade(revision="base")
        upgrade()
