from flask import current_app, abort, request
from flask.views import MethodView
from shared.helpers.angular import Angular

scripts = {
    'threejs': [
        '/static/js/three.js/84/three.min.js',
        '/static/js/three.js/OrbitControls.js'
    ],
    'api': [
        '/static/shared/api.js',
    ],
    'login': [
        '/static/shared/login.js'
    ]
}

styles = {
    'font-awesome': [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css'
    ],
    'common': [
        'https://fonts.googleapis.com/css?family=Roboto',
        '/static/shared/common.css',
    ],
    # Use this or common but not both?
    # TODO tag deps?
    'style1': [
        # 'https://fonts.googleapis.com/css?family=Roboto',
        # '/static/shared/common.css',
        '/static/shared/theme1.css',
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
apps['seconds'] = {
    'tags': ['common']
}
apps['soccer'] = {
    'tags': ['common']
}
apps['tournament'] = {
    'tags': ['api', 'login', 'common', 'style1'],
}
apps['breakout'] = {
    'tags': ['threejs']
}
apps['slack_history'] = {
    'tags': ['common']
}
apps['user'] = {
    'tags': ['font-awesome', 'api']
}
apps['poker'] = {}
apps['cards-workout'] = {
    'tags': ['common', 'font-awesome']
}
apps['racer'] = {
    'tags': ['threejs'],
    'scripts': [
        '/static/js/three.js/BinaryLoader.js',
        '/static/racer/cars.js'
    ]
}
apps['rock'] = {
    'tags': ['api', 'common'],
    'scripts': [
        '/static/rock/dashboard.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
    ],
    'styles': [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css'
    ]
}
apps['trail'] = {
    'tags': ['api', 'common', 'gmaps']
}
apps['ceo_bingo'] = {}
apps['cv'] = {
    'tags': ['common'],
}
# apps['projects'] = {
#     'tags': ['api']
# }
apps['admin'] = {
    'tags': ['api', 'login', 'common', 'font-awesome'],
    'templates': [
        '/static/admin/header.tpl.html'
    ]
}
apps['test'] = {
    'tags': ['common']
}
def gmaps():
    return "https://maps.googleapis.com/maps/api/js?key=%s&v=3.exp&amp;libraries=geometry" % current_app.config.get('GOOGLE_MAPS_API_KEY')

# Project endpoints.
class ProjectAppsListView(MethodView):
    def get(self):
        result = []
        sorted_apps = sorted(apps.items())
        for key, app in sorted_apps:
            result.append(
                '<p><a href="/projects/%s">%s</a> %s</p>' % (
                    key, key, ', '.join(app.get('tags', []))
                )
            )
        return ''.join(result)

class ProjectAppView(MethodView):
    def get(self, app_name, path=None):

        if apps.get(app_name) is None:
            return abort(404)

        app = Angular(app_name)
        app.base = '/projects/%s/' % app_name

        if app_name == 'trail':
            # Need a better way than this?
            if current_app.config.get('ENV') != 'dev':
                # Enable sentry.
                app.sentry = True

        app.addScript('/static/shared/login.js')

        conf = apps.get(app_name)
        if conf:
            tags = conf.get('tags', [])
            extra_tags = request.args.get('tags')
            if extra_tags:
                extra_tags = ','.split(extra_tags)
                print(extra_tags)
                tags += extra_tags

            if 'gmaps' in tags:
                app.scripts += [gmaps()]

            for tag in tags:
                if tag in scripts:
                    app.scripts += scripts[tag]
                if tag in styles:
                    app.styles += styles[tag]

            app.scripts += conf.get('scripts', [])
            app.styles += conf.get('styles', [])
            for t in conf.get('templates', []):
                app.addTemplate(t)

        # Add app files last?
        app.setupFolder('/static/%s' % app_name)

        return app.render()
