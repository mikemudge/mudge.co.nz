import json
import os

from flask import Blueprint
from flask import request, send_from_directory, url_for
from shared.helpers.angular import Angular

main_bp = Blueprint('main', __name__)

@main_bp.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(main_bp.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')
@main_bp.route('/')
def main_page():
    return "Welcome"

@main_bp.route('/a/<appName>/')
@main_bp.route('/a/<appName>/<path:path>')
def angularEndpoint(appName, path=None):
    app = Angular.basicAngular(appName)
    return app.render()

@main_bp.route('/geohash')
def geohash():
    app = Angular('geohash')
    app.scripts += [
        # "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/1.0.2/Chart.min.js",
        "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
    ]
    return app.render()

# TODO doesn't belong here.
@main_bp.route('/api/geohash')
def get_geohash():
    from geohash import geohash
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

# Other random standalone pages.
@main_bp.route('/racer')
def racer():
    app = Angular('racer')
    app.include = '/static/racer/page.html'
    app.scripts = [
        url_for('static', filename="js/three.min.js"),
        "http://threejs.org/examples/js/controls/OrbitControls.js",
        "http://threejs.org/examples/js/loaders/BinaryLoader.js",
        url_for('static', filename="racer/cars.js"),
        url_for('static', filename="racer/racer.js"),
    ]

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

@main_bp.route('/ar/')
def at_test():
    app = Angular('ar')
    app.base = '/ar/'
    app.include = '/static/ar/ar.html'
    app.config['baseUrl'] = '/'
    app.scripts = [
        url_for('static', filename="js/three.min.js"),
        url_for('static', filename="js/three.js/OrbitControls.js"),
        url_for('static', filename="js/three.js/DeviceOrientationControls.js"),
        url_for('static', filename='ar/ar.js'),
        url_for('static', filename='rts/rts.js'),
    ]
    return app.render()

@main_bp.route('/login/')
@main_bp.route('/login/<path:path>')
def login(path=None):
    app = Angular('login')
    app.base = '/'
    app.scripts += [
        url_for('static', filename='login/loginService.js')
    ]
    return app.render()
