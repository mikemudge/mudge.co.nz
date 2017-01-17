import uuid

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import types, CHAR
from sqlalchemy.dialects.mysql.base import MSBinary
from sqlalchemy.dialects.postgresql import UUID as postgresUUID

db = SQLAlchemy()

# As per SQL alchemy docs
# http://docs.sqlalchemy.org/en/rel_0_8/core/types.html#backend-agnostic-guid-type
class UUID(types.TypeDecorator):
    impl = MSBinary

    def __init__(self, length=None):
        if length:
            self.impl.length = length
        else:
            self.impl.length = 32

        types.TypeDecorator.__init__(self, length=self.impl.length)

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(postgresUUID())
        else:
            return dialect.type_descriptor(CHAR(32))

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
