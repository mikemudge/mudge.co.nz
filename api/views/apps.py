from flask import current_app, abort, request, jsonify
from flask import render_template
from flask.views import MethodView
from shared.helpers.angular import Angular

import time
import os

SCRIPTS = {
    'threejs': [
        '/static/js/three.js/84/three.min.js',
        '/static/js/three.js/OrbitControls.js'
    ],
    'jquery': [
        'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
    ],
    'api': [
        '/static/shared/api.js',
    ],
    'login': [
        '/static/shared/login.js'
    ],
    'p5': [
        # 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.1/p5.min.js',
        '/static/p5/p5.min.js',
    ],
    'gridview': [
        "/static/p5/jslib/grid.js",
        "/static/p5/jslib/view.js"
    ],
    'wfc': [
        "/static/p5/wfc/tile.js",
        "/static/p5/wfc/tileset.js",
        "/static/p5/wfc/collapse.js",
        "/static/p5/wfc/overlay.js",
        "/static/p5/wfc/renders.js",
    ],
    'rts': [
        '/static/p5/rts/map.js',
        '/static/p5/rts/units.js',
        '/static/p5/rts/buildings.js',
        '/static/p5/rts/actions.js',
    ],
}

STYLES = {
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
p5_apps = {}

apps['3dprint'] = {
#     'img': '3dprint.png',
    'tags': ['p5', 'threejs', 'objexport'],
    'scripts': [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.js',
        '/static/js/three.js/OrbitControls.js',
        '/static/3dprint/ObjExporter.js',
    ],

}
apps['ar'] = {
#     'img': 'ar.png',
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
    'img': 'rts.png',
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
    'img': 'seconds.png',
    'tags': ['common']
}
apps['workouttime'] = {
    'tags': ['common']
}
apps['game'] = {
    'img': 'game.png',
}
apps['tournament'] = {
    'img': 'tournament.png',
    'tags': ['api', 'login', 'common', 'style1'],
}

# apps['slack_history'] = {
#     'tags': ['common']
# }
apps['user'] = {
    'img': 'user.png',
    'tags': ['font-awesome', 'login', 'api', 'common']
}
apps['cards-workout'] = {
    'img': 'cards-workout.png',
    'tags': ['common', 'font-awesome']
}
apps['racer'] = {
    'img': 'racer.png',
    'tags': ['threejs', 'common'],
    'scripts': [
        '/static/shared/gamecontrols-old.js',
        '/static/js/three.js/BinaryLoader.js',
        '/static/racer/cars.js',
        '/static/racer/ghost.js'
    ]
}
apps['sheets'] = {
    'img': 'sheets.png',
    'tags': ['jquery']
}
apps['rock'] = {
    'img': 'rock.png',
    'title': 'Rock 2000',
    'tags': ['api', 'login', 'common', 'jquery', 'font-awesome'],
    'scripts': [
        '/static/rock/dashboard.js',
    ],
}
apps['trail'] = {
    'img': 'trail.png',
    'tags': ['api', 'login', 'common', 'gmaps']
}
# apps['ceo_bingo'] = {
#     'img': 'ceo_bingo.png',
#     'hidden': True,
# }
apps['cv'] = {
    'img': 'cv.png',
    'tags': ['common'],
}
apps['recipe'] = {
    'tags': ['api', 'login', 'common']
}
# apps['projects'] = {
#     'tags': ['api']
# }
apps['admin'] = {
    'img': 'admin.png',
    'tags': ['api', 'login', 'common', 'font-awesome'],
    'templates': [
        '/static/admin/header.tpl.html'
    ]
}
apps['test'] = {
    'img': 'test.png',
    'tags': ['common']
}

# Show the featured games using an image tile in projects list view.
p5_apps['breakout'] = {
    'img': 'breakout.png',
}
p5_apps['bomberman'] = {
    'img': 'bomberman.png',
}
p5_apps['soccer'] = {
    'img': 'soccer.png',
}
p5_apps['connect4'] = {
    'img': 'connect4.png',
}
p5_apps['planets'] = {
    'img': 'planets.png',
}
p5_apps['predator'] = {
    'img': 'predator.png',
    'status': 'wip',
}
p5_apps['predator2'] = {
    'status': 'wip',
}
p5_apps['minesweeper'] = {
    'img': 'minesweeper.png',
}
p5_apps['avengersTD'] = {
    'img': 'avengersTD.png',
    'title': 'Avengers Tower Defence'
}
p5_apps['carai'] = {
    'img': 'carai.png',
    'title': 'Driving Evolution Neural Net'
}
p5_apps['color_war'] = {
    'img': 'color_war.png'
}
p5_apps['poker'] = {
    'img': 'poker.png',
    'status': 'wip',
}
p5_apps['traffic'] = {
    'img': 'traffic.png',
    'status': 'wip',
}
p5_apps['overrun'] = {
    'img': 'overrun.png',
    'title': 'Overrun',
    'path': 'overrun/main',
}
p5_apps['driftworks'] = {
    'img': 'driftworks.png',
    'title': 'Driftworks',
    'path': 'driftworks/main',
    'status': 'wip',
}

# Work in progress. Shown on /workshop instead of /projects and /games.
# img is optional here (unlike finished apps, where it's required to show up).
p5_apps['citytd'] = {
    'title': 'City TD',
    'path': 'p5_test/citytd',
    'status': 'wip',
}
p5_apps['delve'] = {
    'img': 'delve.png',
    'title': 'Delve',
    'path': 'delve/main',
}

# These were only linked from the old static/p5/p5.tpl.html index page and
# had no entry here, so they never showed up on /games, /projects or
# /workshop. Added as wip pending a check of which ones are actually done.
p5_apps['moba'] = {
    'status': 'wip',
}
p5_apps['chess'] = {
    'status': 'wip',
}
p5_apps['congestion'] = {
    'path': 'p5_test/congestion',
    'status': 'wip',
}
p5_apps['rts_p5'] = {
    # Named to avoid colliding with the unrelated three.js apps['rts'] above.
    'title': 'RTS (p5)',
    'path': 'p5/rts/rts',
    'status': 'wip',
}
p5_apps['td'] = {
    'status': 'wip',
}
p5_apps['wfc-tinytown'] = {
    'title': 'WFC Tiny Town',
    'status': 'wip',
}

def gmaps():
    # loading=async + callback lets the browser load this off the main
    # thread. Code using google.maps must wait for the callback
    # (see trail.js's googleMapsReady) since it may run before this loads.
    return "https://maps.googleapis.com/maps/api/js?key=%s&v=weekly&libraries=geometry,marker&loading=async&callback=initGoogleMaps" % current_app.config.get('GOOGLE_MAPS_API_KEY')


class ProjectV2View(MethodView):
    def get(self, path):
        # TODO load meta tags for a path?

        config = {
            'API_URL': current_app.config.get('API_URL'),
            'DEBUG': current_app.config.get('DEBUG'),
            'ENV': current_app.config.get('ENV'),
            'GOOGLE_CLIENT_ID': current_app.config.get('GOOGLE_CLIENT_ID'),
            'AUTH_COOKIE_ID': current_app.config.get('AUTH_COOKIE_ID'),
            # The web client id and secret for basic auth.
            'CLIENT_ID': current_app.config.get('CLIENT_ID'),
            'CLIENT_SECRET': current_app.config.get('CLIENT_SECRET'),
        }
        config['LOGIN_URL'] = request.url_root
        return render_template('projectsV2.tmpl', **{
            'config': config
        })

# Project endpoints.
# Renders the shell page for a project/game listing. The listing itself is
# fetched and rendered client side (see static/projects/apps.js), reusing
# the same pattern as ProjectV2View for individual games.
class ProjectsShellView(MethodView):
    def __init__(self, status='done', show_apps=True, title='Projects', back_link=None, back_link_label=None):
        self.status = status
        self.show_apps = show_apps
        self.title = title
        self.back_link = back_link
        self.back_link_label = back_link_label

    def get(self):
        return render_template('projects_shell.tmpl', **{
            'status': self.status,
            'show_apps': 'true' if self.show_apps else 'false',
            'title': self.title,
            'back_link': self.back_link,
            'back_link_label': self.back_link_label,
        })


class ProjectAppsApiView(MethodView):
    def get(self):
        status = request.args.get('status', 'done')

        def matches_status(item):
            conf = item[1]
            if conf.get('hidden'):
                return False
            item_status = 'wip' if conf.get('status') == 'wip' else 'done'
            return item_status == status

        def serialize(item):
            key, conf = item
            return {
                'key': key,
                'title': conf.get('title', key),
                'img': conf.get('img'),
                'path': conf.get('path'),
            }

        return jsonify({
            'games': [serialize(a) for a in p5_apps.items() if matches_status(a)],
            'apps': [serialize(a) for a in sorted(apps.items()) if matches_status(a)],
        })


class ProjectAppView(MethodView):
    def get(self, app_name, path=None):
        logger = current_app.logger

        if apps.get(app_name) is None:
            logger.info('Missing app for %s %s' % (app_name, path))
            return abort(404)

        sample = request.args.get('sample')
        if path:
            # Use path to determine the sample?
            parts = path.split("/")
            sample = parts[0]

        logger.info("Loading app name=%s path=%s sample=%s" % (app_name, path, sample))
        app = Angular(app_name)
        if current_app.config.get('ENV') == 'dev':
            # Used to bust cache during development.
            app.version = str(int(time.time()))

        app.base = '/projects/%s/' % app_name

        if app_name == 'trail':
            # Need a better way than this?
            if current_app.config.get('ENV') != 'dev':
                # Enable sentry.
                app.sentry = True

        app_path = '/static/%s' % app_name

        conf = apps.get(app_name)
        if conf:
            # Set the title from the config, or default to the app name.
            app.title = conf.get('title', app_name)
            app_path = conf.get('path', app_path)

            # Set the meta image if one is set.
            if conf.get('img'):
                app.meta['image'] = '/static/img/projects/%s' % conf.get('img')

            self.updateFromConf(app, conf)

        logger.info("folder setup %s" % app_path)
        app.setupFolder(app_path)

        return app.render()

    def updateFromConf(self, app, conf):
        # Add all scripts and styles for the tags in the config.
        tags = conf.get('tags', [])

        if 'gmaps' in tags:
            app.async_scripts += [gmaps()]

        for tag in tags:
            if tag in SCRIPTS:
                app.scripts += SCRIPTS[tag]
            if tag in STYLES:
                app.styles += STYLES[tag]

        # Add all scripts for the application.
        for s in conf.get('scripts', []):
            if s.startswith('https://'):
                app.scripts.append(s)
            else:
                app.scripts.append(s + "?v=" + app.version)

        # Add all styles for the application.
        app.styles += conf.get('styles', [])
        for t in conf.get('templates', []):
            app.addTemplate(t)
