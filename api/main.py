import config
import json
import os

from flask import Blueprint
from flask import render_template, request, send_from_directory, url_for
from shared.helpers.angular import Angular

main_bp = Blueprint('main', __name__)

@main_bp.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(main_bp.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')
@main_bp.route('/')
def main_page():
    return "Welcome"

@main_bp.route('/hello/')
@main_bp.route('/hello/<path:path>')
def hello_world(path=None):
    return render_template('angular.tmpl', **{
        'angular': {
            'app': 'main',
            'base': '/hello/',
            'config': {}
        },
        'scripts': [
            url_for('static', filename='common/user.js'),
            url_for('static', filename="main.js")
        ],
        'styles': [
            url_for('static', filename="style.css")
        ]
    })

@main_bp.route('/a/<app>/')
@main_bp.route('/a/<app>/<path:path>')
def angularEndpoint(app, path=None):
    # TODO check what files exist in the /static/<app> folder.
    # include = 'static/%s/%s.html' % (app, app)
    # if os.path.isfile(include):
    #     include = url_for('static', filename='%s/%s.html' % (app, app))
    # else:
    #     include = None
    return render_template('angular.tmpl', **{
        'angular': {
            'app': app,
            'base': '/a/%s/' % app,
            'config': {
                'basePath': '/static/%s/' % app,
                'GOOGLE_CLIENT_ID': config.GOOGLE_CLIENT_ID,
                'AUTH_COOKIE_ID': config.AUTH_COOKIE_ID,
            }
        },
        'scripts': [
            # TODO dependency lookups?
            url_for('static', filename="common/user.js"),
            url_for('static', filename="js/three.min.js"),
            url_for('static', filename="js/three.js/OrbitControls.js"),
            url_for('static', filename='%s/%s.js' % (app, app)),

            # Angular material.
            "http://ajax.googleapis.com/ajax/libs/angularjs/1.5.5/angular-animate.min.js",
            "http://ajax.googleapis.com/ajax/libs/angularjs/1.5.5/angular-aria.min.js",
            "http://ajax.googleapis.com/ajax/libs/angularjs/1.5.5/angular-messages.min.js",
            'http://ajax.googleapis.com/ajax/libs/angular_material/1.1.0/angular-material.min.js',
        ],
        'styles': [
            url_for('static', filename="%s/%s.css" % (app, app)),
            # Add angular material.
            'http://ajax.googleapis.com/ajax/libs/angular_material/1.1.0/angular-material.min.css',
        ]
    })

@main_bp.route('/geohash')
def geohash():
    # TODO check what files exist in the /static/<app> folder.
    return render_template('angular.tmpl', **{
        'angular': {
            'app': 'geohash',
            'config': {
                'basePath': '/static/geohash/'
            }
        },
        'scripts': [
            "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
            # "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/1.0.2/Chart.min.js",
            url_for('static', filename='geohash/geohash.js')
        ],
        'styles': [
            url_for('static', filename="geohash/geohash.css")
        ]
    })

# TODO doesn't belong here.
@main_bp.route('/api/geohash')
def get_geohash():
    import geohash
    dj = geohash.loadDowJones()
    lat = request.args.get('lat', -41)
    lng = request.args.get('lng', 174)
    return json.dumps(geohash.calculateFractions(dj, lat, lng))

@main_bp.route('/jack')
def jack():

    app = Angular('jack')

    app.scripts += [
        "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
        "https://cdn.firebase.com/js/client/2.2.6/firebase.js",
        "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/1.0.2/Chart.min.js",
    ]
    return app.render()
    # TODO check what files exist in the /static/<app> folder.
    # return render_template('angular.tmpl', **{
    #     'angular': {
    #         'app': 'jack',
    #         'config': {
    #             'basePath': '/static/jack/'
    #         }
    #     },
    #     'scripts': [
    #         "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
    #         "https://cdn.firebase.com/js/client/2.2.6/firebase.js",
    #         "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/1.0.2/Chart.min.js",
    #         url_for('static', filename='jack/jack.js')
    #     ],
    #     'styles': [
    #         url_for('static', filename="jack/jack.css")
    #     ]
    # })

# Other random standalone pages.
@main_bp.route('/racer')
def racer():
    return render_template('angular.tmpl', **{
        'angular': {
            'app': 'racer',
            'include': '/static/racer/page.html',
            'config': {}
        },
        'scripts': [
            url_for('static', filename="js/three.min.js"),
            "http://threejs.org/examples/js/controls/OrbitControls.js",
            "http://threejs.org/examples/js/loaders/BinaryLoader.js",
            url_for('static', filename="racer/cars.js"),
            url_for('static', filename="racer/racer.js"),
        ],
        'styles': [
            url_for('static', filename="racer/racer.css")
        ]
    })

@main_bp.route('/stuff')
def stuff():
    return ''.join([
        "You made it to my home page<br>",
        "<a href='/stuff/trail'> Te Araroa Trail Walk </a><br>",
        "<a href='/stuff/bike'> Tour Aotearoa MTB </a><br>"])

@main_bp.route('/stuff/trail')
def trail():
    app = Angular('trail')
    app.base = '/stuff/trail'
    app.config['baseUrl'] = '/'
    app.scripts = [
        "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
        url_for('static', filename='trail/main.js'),
    ]
    return app.render()

@main_bp.route('/stuff/bike')
def bike():
    app = Angular('bike')
    app.base = '/stuff/bike'
    app.config['baseUrl'] = '/'
    app.config['basePath'] = '/static/trail/'
    app.scripts = [
        "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
        url_for('static', filename='trail/bike.js'),
    ]
    app.styles = [
        url_for('static', filename='trail/bike.css'),
    ]
    return app.render()

@main_bp.route('/ar')
def at_test():
    return render_template('angular.tmpl', **{
        'angular': {
            'app': 'ar',
            'base': '/ar/',
            'include': '/static/ar/ar.html',
            'config': {
                'basePath': '/static/ar/',
                'baseUrl': '/'
            }
        },
        'scripts': [
            url_for('static', filename="js/three.min.js"),
            url_for('static', filename="js/three.js/OrbitControls.js"),
            url_for('static', filename="js/three.js/DeviceOrientationControls.js"),
            url_for('static', filename='ar/ar.js'),
            url_for('static', filename='rts/rts.js'),
        ],
        'styles': [
            url_for('static', filename='ar/ar.css'),
        ]
    })

@main_bp.route('/login/')
@main_bp.route('/login/<path:path>')
def login(path=None):
    app = Angular('login')
    app.base = '/'
    app.scripts += [
        url_for('static', filename='login/loginService.js')
    ]
    return app.render()
