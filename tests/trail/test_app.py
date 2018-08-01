from tests.base.base_test_case import create_test_app

from flask_migrate import upgrade, downgrade
from flask_testing import TestCase

# We purposefully dont use BaseTestCase because we don't want a DB for this test.
class TestTrail(TestCase):

    def create_app(self):
        return create_test_app()

    def test_migrate(self):
        # run upgrades from initial to head.
        upgrade()

        # run downgrades from head to base.
        downgrade(revision="base")
