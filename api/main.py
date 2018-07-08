import os

from flask import Blueprint
from flask import send_from_directory
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

@main_bp.route('/cv/')
def my_cv():
    app = Angular('cv')

    app.setupBrunch()
    app.addStyle("https://fonts.googleapis.com/css?family=Roboto")
    app.base = '/'

    return app.render()

@main_bp.route('/error/')
def error_test():
    abort(500, 'Error message here')


@main_bp.route('/jack/')
def jack():

    app = Angular('jack')

    app.scripts += [
        "https://maps.googleapis.com/maps/api/js?key=%s&v=3.exp&amp;libraries=geometry" % current_app.config.get('GOOGLE_MAPS_API_KEY'),
        "https://cdn.firebase.com/js/client/2.2.6/firebase.js",
        "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/1.0.2/Chart.min.js",
    ]
    return app.render()

@main_bp.route('/stuff/')
def stuff():
    return ''.join([
        "You made it to my home page<br>",
        "<a href='/projects/trail'> Try out the new Trail site here </a><br>"
    ])

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
