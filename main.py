import config
import json
import os

from flask import Blueprint
from flask import render_template, request, send_from_directory, url_for

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

@main_bp.route('/a/<app>')
@main_bp.route('/a/<app>/<path:path>')
def angular(app, path=None):
    # TODO check what files exist in the /static/<app> folder.
    include = 'static/%s/%s.html' % (app, app)
    if os.path.isfile(include):
        include = url_for('static', filename='%s/%s.html' % (app, app))
    else:
        include = None
    return render_template('angular.tmpl', **{
        'angular': {
            'app': app,
            'base': '/a/%s/' % app,
            'include': include,
            'config': {
                'basePath': '/static/%s/' % app,
                'GOOGLE_CLIENT_ID': config.GOOGLE_CLIENT_ID
            }
        },
        'scripts': [
            # TODO dependency lookups?
            url_for('static', filename="js/three.min.js"),
            url_for('static', filename="js/three.js/OrbitControls.js"),
            url_for('static', filename='%s/%s.js' % (app, app))
        ],
        'styles': [
            url_for('static', filename="%s/%s.css" % (app, app))
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
    # TODO check what files exist in the /static/<app> folder.
    return render_template('angular.tmpl', **{
        'angular': {
            'app': 'jack',
            'config': {
                'basePath': '/static/jack/'
            }
        },
        'scripts': [
            "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
            "https://cdn.firebase.com/js/client/2.2.6/firebase.js",
            "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/1.0.2/Chart.min.js",
            url_for('static', filename='jack/jack.js')
        ],
        'styles': [
            url_for('static', filename="jack/jack.css")
        ]
    })

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
    return render_template('angular.tmpl', **{
        'angular': {
            'app': 'trail',
            'base': '/stuff/trail',
            'config': {
                'basePath': '/static/trail/',
                'baseUrl': '/'
            }
        },
        'scripts': [
            "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
            url_for('static', filename='trail/main.js'),
        ],
        'styles': [
            url_for('static', filename='trail/trail.css'),
        ]
    })

@main_bp.route('/stuff/bike')
def bike():
    return render_template('angular.tmpl', **{
        'angular': {
            'app': 'bike',
            'base': '/stuff/bike',
            'config': {
                'basePath': '/static/trail/',
                'baseUrl': '/'
            }
        },
        'scripts': [
            "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
            url_for('static', filename='trail/bike.js'),
        ],
        'styles': [
            url_for('static', filename='trail/bike.css'),
        ]
    })
