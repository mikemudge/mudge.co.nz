from app import create_app as create_app
import os

from flask_migrate import upgrade, downgrade
from flask_testing import TestCase

# We purposefully dont use BaseTestCase because we don't want a DB for this test.
class TestTrail(TestCase):

    def create_app(self):
        config = 'settings.localtest'
        if os.environ.get('APP_TEST_SETTINGS'):
            config = os.environ.get('APP_TEST_SETTINGS')
        return create_app(config)

    def test_migrate(self):
        # run upgrades from initial to head.
        upgrade()

        # run downgrades from head to base.
        downgrade(revision="base")
