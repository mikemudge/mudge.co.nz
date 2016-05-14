import os

from flask import Blueprint
from flask import render_template, send_from_directory, url_for

main_bp = Blueprint('main', __name__)

@main_bp.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(main_bp.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')
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
def angular(app):
    # TODO check what files exist in the /static/<app> folder.
    include = 'static/%s/%s.html' % (app, app)
    if os.path.isfile(include):
        include = url_for('static', filename='%s/%s.html' % (app, app))
    else:
        include = None
    return render_template('angular.tmpl', **{
        'angular': {
            'app': app,
            'include': include,
            'config': {
                'basePath': '/static/%s/' % app
            }
        },
        'scripts': [
            # TODO dependency lookups?
            url_for('static', filename="js/three.min.js"),
            url_for('static', filename='%s/%s.js' % (app, app))
        ],
        'styles': [
            url_for('static', filename="%s/%s.css" % (app, app))
        ]
    })

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
            "https://maps.googleapis.com/maps/api/js?v=3.exp&amp;libraries=geometry",
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
