import config
from flask import render_template, url_for

class Angular():

	def __init__(self, name):
		self.appName = name
		self.base = '/a/%s/' % self.appName
		self.scripts = [
			url_for('static', filename='%s/%s.js' % (name, name))
		]
		self.styles = [
            url_for('static', filename='common/styles.css'),
			url_for('static', filename='%s/%s.css' % (name, name))
		]
		self.config = {
			'basePath': '/static/%s/' % self.appName,
			'GOOGLE_CLIENT_ID': config.GOOGLE_CLIENT_ID
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