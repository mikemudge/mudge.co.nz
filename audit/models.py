from shared.database import db, BaseModel, UUID
from sqlalchemy.orm import relationship
from sqlalchemy_utils import generic_relationship

class AuditEvent(BaseModel):
    who_id = db.Column(UUID(), db.ForeignKey('user.id', ondelete='CASCADE'))
    who = relationship("User")

    section = db.Column(db.String(255))
    action = db.Column(db.String(255))

    object_type = db.Column(db.Unicode(255))
    # This is used to point to the primary key of the linked row.
    object_id = db.Column(UUID)

    # A pointer to a row in the database somewhere.
    object = generic_relationship(object_type, object_id)
