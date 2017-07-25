from flask import jsonify
from marshmallow_sqlalchemy import ModelSchema, ModelSchemaOpts
from sqlalchemy.orm import scoped_session, sessionmaker

# Make marshmallow sqlalchemy friendly.
Session = scoped_session(sessionmaker())

class BaseOpts(ModelSchemaOpts):
    def __init__(self, meta):
        if not hasattr(meta, 'sqla_session'):
            meta.sqla_session = Session
        super(BaseOpts, self).__init__(meta)

class BaseSchema(ModelSchema):
    OPTIONS_CLASS = BaseOpts

    def response(self, data):
        result, errors = self.dump(data)
        if errors:
            return self.errorResponse(errors)
        return jsonify(data=result)

    def errorResponse(self, errors):
        # TODO structure this
        response = jsonify(error={
            'errors': errors
        })
        response.status_code = 400
        return response
