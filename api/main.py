import os

from flask import Blueprint
from flask import send_from_directory, url_for
from flask import abort, current_app
from shared.helpers.angular import Angular

main_bp = Blueprint('main', __name__)

@main_bp.route('/favicon.ico')
def favicon():
    path = os.path.dirname(main_bp.root_path)
    path = os.path.join(path, 'static')
    favicon = current_app.config.get('FAVICON', 'favicon.ico')
    return send_from_directory(path, favicon, mimetype='image/vnd.microsoft.icon')

@main_bp.route('/google1afd17490c9b7ab4.html')
def google():
    return 'google-site-verification: google1afd17490c9b7ab4.html'

@main_bp.route('/robots.txt')
def robots():
    return ''

@main_bp.route('/')
def main_page():
    return "Welcome"

@main_bp.route('/cv')
def my_cv():
    app = Angular('cv')

    app.setupBrunch()
    app.base = '/'

    return app.render()

@main_bp.route('/error')
def error_test():
    abort(500, 'Error message here')


@main_bp.route('/web-director')
def web_director():
    app = Angular('director')
    app.require = 'director'

    app.addLoginApi()
    app.addProject('director')

    return app.render()

@main_bp.route('/jack')
def jack():

    app = Angular('jack')

    app.scripts += [
        "https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry",
        "https://cdn.firebase.com/js/client/2.2.6/firebase.js",
        "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/1.0.2/Chart.min.js",
    ]
    return app.render()

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
        # Include pieces from RTS.
        current_app.config.get('STATIC_URL') + 'rts/templates.js',
        current_app.config.get('STATIC_URL') + 'rts/app.js',
        url_for('static', filename='ar/ar.js'),
    ]
    return app.render()

# TODO make a standalone login section.
# @main_bp.route('/login/')
# def login(path=None):
#     brunchServer = current_app.config.get('STATIC_URL')
#     app = Angular('mmLogin')
#     app.base = '/'
#     app.scripts = [
#         '%slogin/app.js' % brunchServer,
#         '%slogin/templates.js' % brunchServer,
#     ]
#     app.styles = [
#         '%slogin/app.css' % brunchServer
#     ]
#     app.require = 'login/login'
#     return app.render()
