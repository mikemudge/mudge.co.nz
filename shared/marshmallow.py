from flask import jsonify
from flask_marshmallow import Marshmallow
from marshmallow_sqlalchemy import ModelSchema
from marshmallow_sqlalchemy import ModelSchemaOpts
from marshmallow import fields
from sqlalchemy.orm import scoped_session, sessionmaker

from shared.database import db

# Make marshmallow sqlalchemy friendly.
Session = scoped_session(sessionmaker())

ma = Marshmallow()

class BaseOpts(ModelSchemaOpts):
    def __init__(self, meta, ordered):
        # We need to do this because nested schemas do not pass the session correctly.
        # https://github.com/marshmallow-code/marshmallow-sqlalchemy/issues/67
        if not hasattr(meta, 'sqla_session'):
            meta.sqla_session = db.session
        super(BaseOpts, self).__init__(meta)

class BaseSchema(ModelSchema):
    class Meta:
        exclude = ['date_updated', 'date_created']

    OPTIONS_CLASS = BaseOpts

    def response(self, data):
        if data is None:
            return jsonify(errors=[{
                'message': '%s not found' % self.Meta.model.__name__
            }]), 404
        # This can throw a marshmallow.exceptions.ValidationError
        # which is handled by an error handler in exceptions.py
        result = self.dump(data)
        return jsonify(data=result)

# Should use this for admin stuff shared, good for identifying by computer and human.
class IdSchema(BaseSchema):
    id = fields.Str(required=True)
    name = fields.Method('get_name')

    def get_name(self, data):
        return str(data)
