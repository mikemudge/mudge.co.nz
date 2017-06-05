from flask import request, url_for
from flask import current_app
from flask.views import MethodView
from shared.helpers.angular import Angular

# Brunch endpoints.
class BrunchAppsListView(MethodView):
    def get(self):
        # TODO should be able to auto create this?
        links = [
            'soccer',
            'rts',
            'tournament',
            'breakout',
            'poker',
            'racer',
            'bike',
            'trail',
        ]

        result = [
            '<p><a href="/brunch/%s">%s</a></p>' % (link, link) for link in links
        ]
        return ''.join(result)

class BrunchAppView(MethodView):
    def get(self, app_name, path=None):

        # TODO keep track of which deps each app needs?
        # E.g jquery, threejs.

        brunchServer = current_app.config.get('STATIC_URL')

        app = Angular(app_name)
        app.config['baseUrl'] = request.url_root
        app.base = '/brunch/%s/' % app_name
        app.styles = [
            '%s%s/app.css' % (brunchServer, app_name),
        ]
        app.scripts = [
            # Include pieces from RTS.
            '%s%s/app.js' % (brunchServer, app_name),
            # TODO allow skipping templates?
            '%s%s/templates.js' % (brunchServer, app_name),
        ]

        # TODO better way to include dependencies.
        if app_name in ['racer', 'rts', 'ar']:
            app.scripts += [url_for('static', filename="js/three.js/84/three.min.js")]
            app.scripts += [url_for('static', filename="js/three.js/OrbitControls.js")]

        if app_name in ['bike', 'trail', 'tournament']:
            # Include common libs and templates.
            app.scripts += ['%sjs/api.js' % brunchServer]
            app.scripts += ['%sjs/api-templates.js' % brunchServer]

        if app_name == 'bike' or app_name == 'trail':
            app.scripts += ["https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry"]

        if app_name == 'racer':
            # Special case.
            app.scripts += [url_for('static', filename="js/three.js/BinaryLoader.js")]

        return app.render()
