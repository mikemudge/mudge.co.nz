from flask import current_app, abort, request
from flask import render_template
from flask.views import MethodView
from shared.helpers.angular import Angular

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
apps['soccer'] = {
    'img': 'soccer.png',
    'tags': ['common', 'p5'],
    'scripts': [
        '/static/shared/gamecontrols.js',
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
    'img': 'traffic.png'
}

apps['color_war'] = {
    'img': 'color_war.png'
}

apps['p5_test'] = {
    'tags': ['p5']
}

apps['p5'] = {
    'tags': ['p5'],
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

        logger.info("loading app %s %s" % (app_name, path))
        app = Angular(app_name)
        app.base = '/projects/%s/' % app_name

        if app_name == 'trail':
            # Need a better way than this?
            if current_app.config.get('ENV') != 'dev':
                # Enable sentry.
                app.sentry = True

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
                if tag in SCRIPTS:
                    app.scripts += SCRIPTS[tag]
                if tag in STYLES:
                    app.styles += STYLES[tag]

            app.title = conf.get('title', app_name)

            for s in conf.get('scripts', []):
                if s.startswith('https://'):
                    app.scripts.append(s)
                else:
                    app.scripts.append(s + "?v=" + app.version)

            s = request.args.get('sample')
            if s:
                app.scripts.append("/static/%s/%s.js?v=%s" % (app_name, s, app.version))

            app.styles += conf.get('styles', [])
            for t in conf.get('templates', []):
                app.addTemplate(t)

            if conf.get('img'):
                app.meta['image'] = '/static/img/projects/%s' % conf.get('img')

            if app_name == 'p5':
                if s in ['mapviewtest', 'bomberman', 'rts', 'moba', 'road', 'traffic', 'wfc3']:
                    app.scripts.append("/static/p5/grid.js?v=%s" % app.version)
                    app.scripts.append("/static/p5/view.js?v=%s" % app.version)
                elif s == 'minesweeper':
                    app.scripts.append("/static/p5/grid.js?v=%s" % app.version)
                    app.meta['image'] = '/static/img/projects/minesweeper.png'

        # Add app files last?
        app_path = '/static/%s' % app_name
        # if path:
        #     print("Path = %s and %s" % (app_path, path))
            # This was adding /static/trail and login which made a bad path.
            # app_path += '/' + path

        logger.info("folder setup %s" % app_path)
        app.setupFolder(app_path)

        return app.render()
