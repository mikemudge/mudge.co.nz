from flask import jsonify
from flask_marshmallow import Marshmallow
# from flask_marshmallow.sqla import ModelSchema
from marshmallow_sqlalchemy import ModelSchema
from marshmallow_sqlalchemy import ModelSchemaOpts
from sqlalchemy.orm import scoped_session, sessionmaker

from shared.database import db
from shared.exceptions import ValidationException

# Make marshmallow sqlalchemy friendly.
Session = scoped_session(sessionmaker())

ma = Marshmallow()

class BaseOpts(ModelSchemaOpts):
    def __init__(self, meta):
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
        result, errors = self.dump(data)
        if errors:
            return self.errorResponse(errors)
        return jsonify(data=result)

    def parse(self, data):
        result, errors = self.load(data, session=db.session)
        if errors:
            raise ValidationException(errors)
        return result

    def errorResponse(self, errors):
        # TODO structure this
        response = jsonify(error={
            'errors': errors
        })
        response.status_code = 400
        return response
