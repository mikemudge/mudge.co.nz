import sys
from flask import current_app
from flask import render_template, make_response, url_for
from flask import request

class Angular():

    def __init__(self, name):
        self.appName = name
        self.title = name
        self.version = current_app.version
        self.include = None
        self.sentry = False
        self.base = '/'
        self.meta = {}
        self.scripts = []
        self.async_scripts = []
        self.template = 'angular.tmpl'
        self.templates = []
        self.styles = []
        self.config = {
            'basePath': '/static/%s/' % self.appName,
            'appName': self.appName,
            'version': self.version,
            'API_URL': current_app.config.get('API_URL'),
            'DEBUG': current_app.config.get('DEBUG'),
            'ENV': current_app.config.get('ENV'),
            'GOOGLE_CLIENT_ID': current_app.config.get('GOOGLE_CLIENT_ID'),
            'AUTH_COOKIE_ID': current_app.config.get('AUTH_COOKIE_ID'),
            # The web client id and secret for basic auth.
            'CLIENT_ID': current_app.config.get('CLIENT_ID'),
            'CLIENT_SECRET': current_app.config.get('CLIENT_SECRET'),
            # For 8i assets
            'AMAZON_S3_URL': current_app.config.get('AMAZON_S3_URL'),
        }
        self.config['LOGIN_URL'] = request.url_root
        self.favicon = url_for('static', filename='favicon-dev.png')
        if not self.favicon:
            self.favicon = url_for('static', filename='favicon.ico')

        self.favicon = '/favicon.ico'

    def render(self):
        html = render_template(self.template, **{
            'app': {
                'app': self.appName,
                'title': self.title[0].upper() + self.title[1:],
                'version': self.version,
                'meta': self.meta,
                'favicon': self.favicon,
            },
            'angular': {
                'app': self.appName,
                'title': self.title[0].upper() + self.title[1:],
                'version': self.version,
                'base': self.base,
                'meta': self.meta,
                'config': self.config,
                'favicon': self.favicon,
                'include': self.include,
                'sentry': self.sentry,
            },
            'scripts': self.scripts,
            'styles': self.styles,
            'async': self.async_scripts,
            # TODO support embedded templates?
        })

        response = make_response(html)
        if self.config.get('ENV') == 'dev':
            response.headers['Cache-Control'] = 'no-cache'
        return response

    def addStyle(self, href, version=True):
        if version:
            href += '?v=%s' % self.version
        self.styles += [href]

    def addScript(self, src, version=True):
        if version:
            src += '?v=%s' % self.version
        self.scripts += [src]

    def addTemplate(self, src):
        path = sys.path[0] + src
        with open(path, 'r') as myfile:
            self.templates += [{
                'id': src,
                'content': myfile.read()
            }]

    def setupFolder(self, path):
        self.styles += [
            '%s/%s.css?v=%s' % (path, self.appName, self.version)
        ]
        self.scripts += [
            '%s/%s.js?v=%s' % (path, self.appName, self.version)
        ]

    def addLogin(self):
        self.addStyle('/static/shared/common.css')
        self.addScript('/static/shared/login.js')
        self.addScript('/static/shared/api.js')
