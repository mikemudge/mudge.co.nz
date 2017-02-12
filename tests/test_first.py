from base_test_case import BaseTestCase

class TestFirst(BaseTestCase):

    def test_empty_db(self):
        response = self.client.get('/hello/')
        self.assertEquals("", response.data)
        self.assert_template_used('angular.tmpl')
        self.assertEquals(self.get_context_variable('angular'), {
            'app': 'main',
            'base': '/hello/',
            'config': {}
        })
