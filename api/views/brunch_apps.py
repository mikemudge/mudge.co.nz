from flask.views import MethodView
from shared.helpers.angular import Angular

scripts = {
    'threejs': [
        '/static/js/three.js/84/three.min.js',
        '/static/js/three.js/OrbitControls.js'
    ],
    'gmaps': [
        "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry"
    ]
}

apps = {}
apps['soccer'] = {}
apps['ar'] = {
    'scripts': scripts['threejs']
}
apps['rts'] = {
    'scripts': scripts['threejs']
}
apps['tournament'] = {}
apps['breakout'] = {
    'scripts': scripts['threejs']
}
apps['poker'] = {}
apps['racer'] = {
    'scripts': scripts['threejs'] + [
        '/static/js/three.js/BinaryLoader.js'
    ]
}
apps['rock'] = {
    'scripts': [
        'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
    ],
    'styles': [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css'
    ]
}
apps['bike'] = {
    'scripts': scripts['gmaps']
}
apps['trail'] = {
    'scripts': scripts['gmaps']
}

# Brunch endpoints.
class BrunchAppsListView(MethodView):
    def get(self):
        # TODO should be able to auto create this?
        print(apps.keys())
        links = apps.keys()

        result = [
            '<p><a href="/brunch/%s">%s</a></p>' % (link, link) for link in links
        ]
        return ''.join(result)

class BrunchAppView(MethodView):
    def get(self, app_name, path=None):

        # TODO keep track of which deps each app needs?
        # E.g jquery, threejs.

        # TODO should include js and css files for this project???
        # Maybe add the other things as well?

        app = Angular(app_name)
        app.setupBrunch()

        conf = apps.get(app_name)
        if conf:
            app.scripts += conf.get('scripts', [])
            app.styles += conf.get('styles', [])

        app.addLoginApi()

        return app.render()
