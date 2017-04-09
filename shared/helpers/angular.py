import config
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
            'GOOGLE_CLIENT_ID': config.GOOGLE_CLIENT_ID,
            'AUTH_COOKIE_ID': config.AUTH_COOKIE_ID,
        }

    def render(self):
        return render_template('angular.tmpl', **{
            'angular': {
                'app': self.appName,
                'base': self.base,
                'config': self.config
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

        # TODO check what files exist in the /static/<app> folder.
        # include = 'static/%s/%s.html' % (app, app)
        # if os.path.isfile(include):
        #     include = url_for('static', filename='%s/%s.html' % (app, app))
        # else:
        #     include = None

        return app
