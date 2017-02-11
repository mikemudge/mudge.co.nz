from marshmallow_sqlalchemy import ModelSchema, ModelSchemaOpts
from sqlalchemy.orm import scoped_session, sessionmaker

# Make marshmallow sqlalchemy friendly.
Session = scoped_session(sessionmaker())

class BaseOpts(ModelSchemaOpts):
    def __init__(self, meta):
        if not hasattr(meta, 'sql_session'):
            meta.sqla_session = Session
        super(BaseOpts, self).__init__(meta)

class BaseSchema(ModelSchema):
    OPTIONS_CLASS = BaseOpts
