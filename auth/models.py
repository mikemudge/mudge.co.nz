import bcrypt
from shared.database import db, BaseModel, UUID
from sqlalchemy.orm import relationship
from werkzeug.security import gen_salt

api_client_scope = db.Table(
    'api_client_scope',
    BaseModel.metadata,
    db.Column('client_id', UUID(), db.ForeignKey('client.id')),
    db.Column('scope_id', UUID(), db.ForeignKey('scope.id')),
    db.UniqueConstraint('client_id', 'scope_id', name='client_scope_no_dups')
)

class Client(BaseModel):
    client_id = db.Column(db.String(40), unique=True, index=True, nullable=False)
    client_secret = db.Column(db.String(55), unique=True, index=True, nullable=False)

    name = db.Column(db.String(255))

    scopes = db.relationship("Scope",
                             secondary=api_client_scope,
                             back_populates="clients")

    def __init__(self, name=None, scopes=[]):
        self.name = name
        self.scopes = scopes
        self.client_id = gen_salt(40)
        self.client_secret = gen_salt(50)

    @classmethod
    def create(cls, name):
        return Client(name=name)

    # Some properties required by oauthlib.
    @property
    def default_redirect_uri(self):
        return None

    @property
    def default_scopes(self):
        return [scope.name for scope in self.scopes]

    def __repr__(self):
        return self.name

class Scope(BaseModel):
    name = db.Column(db.String(255))

    clients = db.relationship("Client",
                              secondary=api_client_scope,
                              back_populates="scopes")

    def __repr__(self):
        return self.name

class User(BaseModel):
    profile_id = db.Column(UUID(), db.ForeignKey('profile.id', ondelete='CASCADE'))
    profile = relationship("Profile", backref="user")

    email = db.Column(db.String)
    password_hash = db.Column(db.String)

    is_active = db.Column(db.Boolean, default=False)

    def __repr__(self):
        return self.email

    @classmethod
    def create(cls, email, password=None):
        if not password:
            # Generate a random password for social users.
            password = bcrypt.gensalt()
            print 'Password length', len(password)

        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

        user = User(
            email=email,
            password_hash=hashed,
        )

        db.session.add(user)
        db.session.commit()
        return user

    def check_password(self, password_attempt):
        return bcrypt.hashpw(password_attempt.encode('utf-8'), self.password_hash.encode('utf-8')) == self.password_hash

    # For flask login
    @property
    def is_authenticated(self):
        return True

    def get_id(self):
        return str(self.id)

class Profile(BaseModel):
    username = db.Column(db.String)
    image = db.Column(db.String)
    firstname = db.Column(db.String)
    lastname = db.Column(db.String)

    def __repr__(self):
        return str(self.firstname) + ' ' + str(self.lastname)
