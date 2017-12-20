from flask import Blueprint
from flask import send_from_directory

slack_bp = Blueprint('slack', __name__)

@slack_bp.route('/slack_history/<name>.json')
def slack_history(name):
    return send_from_directory('slack_history/direct_messages', name + '.json')

@slack_bp.route('/slack_users')
def slack_users():
    return send_from_directory('slack_history', 'metadata.json')

def routes(app):
    app.register_blueprint(slack_bp, url_prefix='')
