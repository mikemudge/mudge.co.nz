from flask import current_app
from flask import render_template, url_for

class Angular():

    def __init__(self, name):
        self.appName = name
        self.base = '/'
        self.scripts = [
            url_for('static', filename='%s/%s.js' % (name, name))
        ]
        self.styles = [
            url_for('static', filename='common/styles.css'),
            url_for('static', filename='%s/%s.css' % (name, name))
        ]
        self.config = {
            'basePath': '/static/%s/' % self.appName,
            'GOOGLE_CLIENT_ID': current_app.config.get('GOOGLE_CLIENT_ID'),
            'AUTH_COOKIE_ID': current_app.config.get('AUTH_COOKIE_ID'),
            'CLIENT_ID': current_app.config.get('CLIENT_ID'),
            'CLIENT_SECRET': current_app.config.get('CLIENT_SECRET'),
        }
        self.favicon = url_for('static', filename='favicon-dev.png')
        if not self.favicon:
            self.favicon = url_for('static', filename='favicon.ico')

        self.favicon = '/favicon.ico'

    def render(self):
        return render_template('angular.tmpl', **{
            'angular': {
                'app': self.appName,
                'base': self.base,
                'config': self.config,
                'favicon': self.favicon,
            },
            'scripts': self.scripts,
            'styles': self.styles,
            # TODO support embedded templates?
        })

    @classmethod
    def basicAngular(cls, appName):
        app = Angular(appName)
        app.base = '/a/%s/' % appName
        app.scripts += [
            url_for('static', filename="common/user.js"),
            url_for('static', filename="js/three.min.js"),
            url_for('static', filename="js/three.js/OrbitControls.js"),
        ]

        return app
