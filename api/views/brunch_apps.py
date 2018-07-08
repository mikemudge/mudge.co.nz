from flask import current_app
from flask.views import MethodView
from shared.helpers.angular import Angular

scripts = {
    'threejs': [
        '/static/js/three.js/84/three.min.js',
        '/static/js/three.js/OrbitControls.js'
    ],
    'api': [
        '/static/shared/api.js',
    ]
}

styles = {
    'font-awesome': [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css'
    ],
    'roboto': [
        'https://fonts.googleapis.com/css?family=Roboto'
    ]
}

apps = {}
apps['ar'] = {
    'tags': ['threejs'],
    'scripts': [
        '/static/js/three.js/OrbitControls.js',
        '/static/js/three.js/DeviceOrientationControls.js',
        # RTS pieces
        '/static/rts/rts.js',
        '/static/rts/units.js',
        '/static/rts/game.js',
        '/static/ar/ar.js',
    ]
}
# TODO ar should just be a plugin for rts.
apps['rts'] = {
    'tags': ['threejs'],
    'scripts': [
        '/static/js/three.js/OrbitControls.js',
        # RTS pieces
        '/static/rts/rts.js',
        '/static/rts/units.js',
        '/static/rts/game.js',
        '/static/rts/device_orientation.js',
    ]
}
apps['soccer'] = {}
apps['tournament'] = {
    'tags': ['api'],
}
apps['breakout'] = {
    'tags': ['threejs']
}
apps['slack_history'] = {}
apps['user'] = {
    'tags': ['font-awesome', 'api']
}
apps['poker'] = {}
apps['racer'] = {
    'tags': ['threejs'],
    'scripts': [
        '/static/js/three.js/BinaryLoader.js',
        '/static/racer/cars.js'
    ]
}
apps['rock'] = {
    'tags': ['api'],
    'scripts': [
        '/static/rock/dashboard.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
    ],
    'styles': [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css'
    ]
}
apps['trail'] = {
    'tags': ['api']
}
apps['ceo_bingo'] = {}
apps['cv'] = {
    'tags': ['roboto'],
}
apps['projects'] = {
    'tags': ['api']
}
apps['admin'] = {
    'tags': ['api'],
    'templates': [
        '/static/admin/header.tpl.html'
    ]
}
def gmaps():
    return "https://maps.googleapis.com/maps/api/js?key=%s&v=3.exp&amp;libraries=geometry" % current_app.config.get('GOOGLE_MAPS_API_KEY')

# Project endpoints.
class ProjectAppsListView(MethodView):
    def get(self):
        result = []
        for key, app in apps.items():
            result.append(
                '<p><a href="/projects/%s">%s</a> %s</p>' % (
                    key, key, ', '.join(app.get('tags', []))
                )
            )
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
            for tag in conf.get('tags', []):
                if tag in scripts:
                    app.scripts += scripts[tag]
                if tag in styles:
                    app.styles += styles[tag]

            app.scripts += conf.get('scripts', [])
            app.styles += conf.get('styles', [])
            for t in conf.get('templates', []):
                app.addTemplate(t)

        return app.render()
