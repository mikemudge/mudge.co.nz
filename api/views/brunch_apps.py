from flask import current_app
from flask.views import MethodView
from shared.helpers.angular import Angular

scripts = {
    'threejs': [
        '/static/js/three.js/84/three.min.js',
        '/static/js/three.js/OrbitControls.js'
    ]
}

apps = {}
apps['soccer'] = {}
apps['tournament'] = {
    'scripts': [
        '/static/shared/api.js',
    ]
}
apps['breakout'] = {
    'scripts': scripts['threejs']
}
apps['slack_history'] = {}
apps['user'] = {
    'scripts': [
        '/static/shared/api.js',
    ],
    'styles': [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css'
    ]
}
apps['poker'] = {}
apps['racer'] = {
    'scripts': scripts['threejs'] + [
        '/static/js/three.js/BinaryLoader.js',
        '/static/racer/cars.js'
    ]
}
apps['rock'] = {
    'scripts': [
        '/static/rock/dashboard.js',
        '/static/shared/api.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
    ],
    'styles': [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css'
    ]
}
apps['trail'] = {
    'scripts': [
        '/static/shared/api.js',
    ]
}

def gmaps():
    return "https://maps.googleapis.com/maps/api/js?key=%s&v=3.exp&amp;libraries=geometry" % current_app.config.get('GOOGLE_MAPS_API_KEY')

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

# Project endpoints.
class ProjectAppsListView(MethodView):
    def get(self):
        links = sorted(apps.keys())

        result = [
            '<p><a href="/projects/%s/">%s</a></p>' % (link, link) for link in links
        ]
        return ''.join(result)

class ProjectAppView(MethodView):
    def get(self, app_name, path=None):

        # TODO keep track of which deps each app needs?
        # E.g jquery, threejs.

        # TODO should include js and css files for this project???
        # Maybe add the other things as well?

        app = Angular(app_name)
        with open(".commithash", "r") as myfile:
            lines = myfile.readlines()
            app.version = ''.join(lines)

        app.base = '/projects/%s/' % app_name

        app.setupFolder('/static/%s' % app_name)

        if app_name == 'trail':
            # Need a better way than this.
            app.scripts += [gmaps()]

            if current_app.config.get('ENV') != 'dev':
                # Enable sentry.
                app.sentry = True

        app.styles = ['/static/shared/common.css'] + app.styles
        app.addScript('/static/shared/login.js')

        conf = apps.get(app_name)
        if conf:
            app.scripts += conf.get('scripts', [])
            app.styles += conf.get('styles', [])

        return app.render()
