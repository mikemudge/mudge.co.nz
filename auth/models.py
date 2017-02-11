import bcrypt
from shared.database import db, BaseModel, UUID
from sqlalchemy.orm import relationship

api_client_scope = db.Table(
    'api_client_scope',
    BaseModel.metadata,
    db.Column('client_id', UUID(), db.ForeignKey('client.id')),
    db.Column('scope_id', UUID(), db.ForeignKey('scope.id')),
    db.UniqueConstraint('client_id', 'scope_id', name='client_scope_no_dups')
)

class Client(BaseModel):
    client_key = db.Column(db.String(40), primary_key=True)
    client_secret = db.Column(db.String(55), index=True, nullable=False)

    name = db.Column(db.String(255))

    scopes = db.relationship("Scope",
                             secondary=api_client_scope,
                             back_populates="clients")

class Scope(BaseModel):
    name = db.Column(db.String(255))

    clients = db.relationship("Client",
                              secondary=api_client_scope,
                              back_populates="scopes")

    def __init__(self, name):
        self.name = name

class User(BaseModel):
    profile_id = db.Column(UUID(), db.ForeignKey('profile.id', ondelete='CASCADE'))
    profile = relationship("Profile", backref="user")

    email = db.Column(db.String)
    password_hash = db.Column(db.String)

    is_active = db.Column(db.Boolean, default=False)

    def __repr__(self):
        return self.email

    @classmethod
    def create(cls, email, firstname, lastname, password=None):
        if not password:
            password = bcrypt.gensalt()
            print 'Password length', len(password)

        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

        user = User(
            email=email,
            password_hash=hashed,
            profile=Profile(
                firstname=firstname,
                lastname=lastname
            )
        )

        db.session.add(user)
        db.session.commit()
        return user

    def password_match(self, password_attempt):
        return bcrypt.hashpw(password_attempt.encode('utf-8'), self.password_hash.encode('utf-8')) == self.password_hash

class Profile(BaseModel):
    username = db.Column(db.String)
    image = db.Column(db.String)
    firstname = db.Column(db.String)
    lastname = db.Column(db.String)

    def __repr__(self):
        return self.firstname + ' ' + self.lastname
