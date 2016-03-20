from flask import Blueprint
from flask import render_template, url_for

main_bp = Blueprint('main', __name__)

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
            url_for('static', filename="racer/racer.js"),
        ],
        'styles': [
            url_for('static', filename="racer/racer.css")
        ]
    })
