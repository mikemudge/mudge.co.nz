from flask import Flask, Blueprint
from flask_restx import Api, Resource, fields

import psycopg2

app = Flask(__name__)
blueprint = Blueprint('api', __name__, url_prefix='/api')
api = Api(blueprint, doc='/doc/')
app.register_blueprint(blueprint)

# Will load any config from environment with prefix of FLASK_
app.config.from_prefixed_env()
app.config['SECRET_KEY'] = '1857140a590c6bc21498eb23bf9f79d5'
app.config['RESTX_INCLUDE_ALL_MODELS'] = True

blast = api.model('Blast', {
    'name': fields.String,
    'schedule_time': fields.DateTime,
    'template': fields.String
    # Etc
})

connection = psycopg2.connect(user="postgres",
                                  password="root_password",
                                  host="db",
                                  port="5432",
                                  database="postgres")

@api.route('/blast', '/blast/<id>')
class BlastResource(Resource):
    @api.response(200, 'Success', blast)
    def get(self, id=None):
        return {'hello': id if id else 'world'}
    
    def post(self, id=None):
        return {'ok': True}

if __name__ == '__main__':
    app.run(debug=True)