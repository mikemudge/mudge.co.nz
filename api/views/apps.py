from flask import current_app, abort, request
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
        "/static/p5/grid.js",
        "/static/p5/view.js"
    ],
    'poly': [
        "/static/p5/poly.js"
    ]
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
    'img': '3dprint.png',
    'tags': ['p5', 'threejs', 'objexport'],
    'scripts': [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.js',
        '/static/js/three.js/OrbitControls.js',
        '/static/3dprint/ObjExporter.js',
    ],

}
apps['ar'] = {
    'img': 'ar.png',
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
apps['avengersTD'] = {
    'img': 'avengersTD.png',
    'tags': ['p5']
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
apps['soccer'] = {
    'img': 'soccer.png',
    'tags': ['common', 'p5'],
    'scripts': [
        '/static/shared/gamecontrols.js',
        '/static/shared/swipecontrols.js',
    ]
}
apps['predator'] = {
    'img': 'predator.png',
    'tags': ['p5']
}
apps['game'] = {
    'img': 'game.png',
}
apps['tournament'] = {
    'img': 'tournament.png',
    'tags': ['api', 'login', 'common', 'style1'],
}
apps['bomberman'] = {
    'img': 'bomberman.png',
    'tags': ['common']
}

# apps['slack_history'] = {
#     'tags': ['common']
# }
apps['user'] = {
    'img': 'user.png',
    'tags': ['font-awesome', 'login', 'api', 'common']
}
apps['poker'] = {
    'img': 'poker.png',
    'tags': ['common']
}
apps['cards-workout'] = {
    'img': 'cards-workout.png',
    'tags': ['common', 'font-awesome']
}
apps['racer'] = {
    'img': 'racer.png',
    'tags': ['threejs', 'common'],
    'scripts': [
        '/static/shared/gamecontrols.js',
        '/static/js/three.js/BinaryLoader.js',
        '/static/racer/cars.js'
    ]
}
apps['carai'] = {
    'img': 'carai.png',
    'tags': ['threejs', 'common'],
    'scripts': [
        '/static/racer/racer.js'
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

apps['traffic'] = {
    'img': 'traffic.png',
    'tags': ['p5', 'gridview']
}

apps['color_war'] = {
    'img': 'color_war.png'
}

apps['p5_test'] = {
    'tags': ['p5']
}

apps['p5'] = {
    'tags': ['p5'],
    'styles': ['/static/p5/p5.css']
}

p5_apps['mapviewtest'] = {
    'tags': ['gridview']
}
p5_apps['polytest'] = {
    'tags': ['poly']
}
p5_apps['bomberman'] = {
    'tags': ['gridview']
}
p5_apps['rts'] = {
    'tags': ['gridview'],
    'entry_point': '/static/p5/rts/rts.js',
    'scripts': [
        '/static/p5/rts/units.js',
        '/static/p5/rts/buildings.js',
        '/static/p5/rts/actions.js',
        '/static/p5/rts/game.js'
    ]
}
p5_apps['moba'] = {
    'tags': ['gridview']
}
p5_apps['road'] = {
    'tags': ['gridview']
}
p5_apps['wfc3'] = {
    'tags': ['gridview']
}

p5_apps['minesweeper'] = {
    'img': 'minesweeper.png',
    'scripts': ["/static/p5/grid.js"]
}

def gmaps():
    return "https://maps.googleapis.com/maps/api/js?key=%s&v=3.exp&amp;libraries=geometry" % current_app.config.get('GOOGLE_MAPS_API_KEY')


# Project endpoints.
class ProjectAppsListView(MethodView):
    def get(self):
        result = []
        sorted_apps = sorted(apps.items())

        return render_template('projects.tmpl', **{
            'apps': [a for a in sorted_apps if 'hidden' not in a[1] or not a[1]['hidden']]
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
            parts = os.path.split(path)
            sample = parts[0]
            pass

        logger.info("Loading app %s %s" % (app_name, path))
        app = Angular(app_name)
        if current_app.config.get('ENV') != 'dev':
            # Used to bust cache in development.
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

            if sample:
                entry_point = "%s/%s.js" % (app_path, sample)
                # Sample is an app within an app group, load a script for it.

                if app_name == 'p5' or app_name == 'p5_test':
                    app.template = 'app.tmpl'
                    p5_conf = p5_apps.get(sample)
                    if p5_conf:
                        entry_point = p5_conf.get('entry_point', entry_point)
                        self.updateFromConf(app, p5_conf)

                app.scripts.append("%s?v=%s" % (entry_point, app.version))

        logger.info("folder setup %s" % app_path)
        if app_name != 'p5' or sample == None:
            app.setupFolder(app_path)

        return app.render()

    def updateFromConf(self, app, conf):
        # Add all scripts and styles for the tags in the config.
        tags = conf.get('tags', [])

        if 'gmaps' in tags:
            app.scripts += [gmaps()]

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
