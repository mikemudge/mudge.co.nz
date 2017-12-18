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
            'rock',
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

        # TODO should include js and css files for this project???
        # Maybe add the other things as well?

        app = Angular(app_name)
        app.setupBrunch()

        if app_name not in ['breakout']:
            app.scripts += ['%s%s/templates.js' % (brunchServer, app_name)]

        # TODO better way to include dependencies.
        if app_name in ['breakout', 'racer', 'rts', 'ar']:
            app.scripts += [url_for('static', filename="js/three.js/84/three.min.js")]
            app.scripts += [url_for('static', filename="js/three.js/OrbitControls.js")]

        app.addLoginApi()

        if app_name == 'rock':
            # Add rock styles and scripts
            app.styles += [
                # 'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.3/css/select2.css',
                'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css'
            ]
            app.scripts += [
                'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
                # 'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.3/js/select2.js',
            ]

        if app_name == 'bike' or app_name == 'trail':
            app.scripts += ["https://maps.googleapis.com/maps/api/js?key=AIzaSyCy2s0-af1yNUHYf8eWVpqXvIgF-lKgyU4&v=3.exp&amp;libraries=geometry"]

        if app_name == 'racer':
            # Special case.
            app.scripts += [url_for('static', filename="js/three.js/BinaryLoader.js")]

        return app.render()
