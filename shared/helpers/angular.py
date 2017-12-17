from flask import current_app
from flask import render_template, url_for
from flask import request

class Angular():

    def __init__(self, name):
        self.appName = name
        self.require = self.appName + '/' + self.appName
        self.base = '/'
        self.scripts = [
            url_for('static', filename='%s/%s.js' % (name, name))
        ]
        self.styles = [
            # I removed this, it had button styles in.
            # url_for('static', filename='common/styles.css'),
            url_for('static', filename='%s/%s.css' % (name, name))
        ]
        self.config = {
            'basePath': '/static/%s/' % self.appName,
            'API_URL': current_app.config.get('API_URL'),
            'DEBUG': current_app.config.get('DEBUG'),
            'GOOGLE_CLIENT_ID': current_app.config.get('GOOGLE_CLIENT_ID'),
            'AUTH_COOKIE_ID': current_app.config.get('AUTH_COOKIE_ID'),
            'CLIENT_ID': current_app.config.get('CLIENT_ID'),
            'CLIENT_SECRET': current_app.config.get('CLIENT_SECRET'),
            'AMAZON_S3_URL': current_app.config.get('AMAZON_S3_URL'),
        }
        self.config['LOGIN_URL'] = request.url_root
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
            'brunch': {
                'require': self.require,
            },
            'scripts': self.scripts,
            'styles': self.styles,
            'async': self.async,
            # TODO support embedded templates?
        })

    def addLoginApi(self):
        brunchServer = current_app.config.get('STATIC_URL')

        self.scripts += [
            # Add login and api js.
            '%slogin/app.js' % brunchServer,
            '%slogin/templates.js' % brunchServer,
            '%sjs/api.js' % brunchServer,
            '%sjs/api-templates.js' % brunchServer,
        ]

        self.styles = [
            '%slogin/app.css' % brunchServer,
        ]

    def addProject(self, name):

        brunchServer = current_app.config.get('STATIC_URL')

        self.scripts += [
            '%s%s/app.js' % (brunchServer, name),
            '%s%s/templates.js' % (brunchServer, name),
        ]
        self.styles = [
            '%s/app.css' % (brunchServer, name),
        ]

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
