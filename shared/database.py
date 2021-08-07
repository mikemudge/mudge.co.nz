import uuid

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import types, CHAR
from sqlalchemy import MetaData
from sqlalchemy.dialects.mysql.base import MSBinary
from sqlalchemy.dialects.postgresql import UUID as postgresUUID
from sqlalchemy.sql import func

# Allows overriding the metadata used by flask.
# Adds a naming scheme for foreign constraints.
# Allows alembic to delete those constraints when downgrading.
# http://stackoverflow.com/questions/29153930/changing-constraint-naming-conventions-in-flask-sqlalchemy

metadata = MetaData(naming_convention={
    'pk': 'pk_%(table_name)s',
    'fk': 'fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s',
    'ix': 'ix_%(table_name)s_%(column_0_name)s',
    'uq': 'uq_%(table_name)s_%(column_0_name)s',
    'ck': 'ck_%(table_name)s_%(constraint_name)s',
})

db = SQLAlchemy(metadata=metadata)

# As per SQL alchemy docs
# http://docs.sqlalchemy.org/en/rel_0_8/core/types.html#backend-agnostic-guid-type
class UUID(types.TypeDecorator):
    impl = MSBinary

    def __init__(self, length=None):
        if length:
            self.impl.length = length
        else:
            self.impl.length = 64
        self.cache_ok = True

        types.TypeDecorator.__init__(self, length=self.impl.length)

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(postgresUUID())
        else:
            return dialect.type_descriptor(CHAR(64))

    def process_bind_param(self, value, dialect=None):

        if value is None:
            return None

        elif dialect.name == 'postgresql':
            return str(value)

        else:
            if not isinstance(value, uuid.UUID):
                return "%.32x" % uuid.UUID(value).int
            else:
                return "%.32x" % value.int

    def process_result_value(self, value, dialect=None):
        if value:
            return uuid.UUID(value)
        else:
            return None

    def is_mutable(self):
        return False

class BaseModel(db.Model):
    __abstract__ = True
    id = db.Column('id', UUID(), primary_key=True, default=uuid.uuid4)

    date_created = db.Column(db.DateTime(timezone=True), server_default=func.now())
    date_updated = db.Column(db.DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return "%s: %s" % (type(self).__name__, self.id)
