from tests.base.base_test_case import BaseTestCase

from flask import current_app
from apps.project_manager.models import Project, FileUrl
from shared.database import db

class TestProject(BaseTestCase):

    def setUp(self):
        super(TestProject, self).setUp()

        self.jsonClient.add_scope('tournament')
        self.user = self.jsonClient.createLoggedInUser(self._testMethodName)

    def test_project(self):

        p = Project(
            name="Test Project",
            base_url=current_app.config.get('STATIC_URL'),
        )
        db.session.add(p)

        p.js_files = [
            FileUrl(name='test.js'),
        ]
        p.css_files = [
            FileUrl(name='test.css'),
        ]
        db.session.commit()

        response = self.client.get('/api/project/project')

        self.assertEqual(len(response.json), 1)

        print(response.json['data'])
        project = response.json['data'][0]
        self.assertEqual(project['name'], 'Test Project')
        # This doesn't pass in all environments.
        # self.assertEqual(project['base_url'], 'http://localhost:3333/')
        self.assertEqual(project['css_files'][0]['name'], 'test.css')
        self.assertEqual(project['js_files'][0]['name'], 'test.js')

        # TODO should get full urls for these?

        # Then try and render angular???
