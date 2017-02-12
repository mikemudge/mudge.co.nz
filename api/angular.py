from flask import render_template, url_for

def app(name):
    return AngularApp(name)

class AngularApp():

    def __init__(self, name):
        self.name = name
        self.basePath = '/static/%s/' % name
        self.baseUrl = '/%s/' % name
        self.scripts = [
            url_for('static', filename='%s/%s.js' % (name, name)),
        ]
        self.styles = [
            url_for('static', filename='common/styles.css'),
            url_for('static', filename='%s/%s.css' % (name, name)),
        ]

    def addStyles(self, styles):
        self.styles.extend(styles)

    def addScripts(self, scripts):
        self.scripts.extend(scripts)

    def render(self):
        return render_template('angular.tmpl', **{
            'angular': {
                'app': self.name,
                'base': self.baseUrl,
                'config': {
                    'basePath': self.basePath,
                    'baseUrl': '/'
                }
            },
            'scripts': self.scripts,
            'styles': self.styles,
        })
