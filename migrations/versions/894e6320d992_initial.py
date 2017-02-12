"""initial

Revision ID: 894e6320d992
Revises: None
Create Date: 2017-02-12 16:38:33.295429

"""

# revision identifiers, used by Alembic.
revision = '894e6320d992'
down_revision = None

from alembic import op
import app
import sqlalchemy as sa
import shared


def upgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.create_table('client',
    sa.Column('id', shared.database.UUID(length=32), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('client_id', sa.String(length=40), nullable=False),
    sa.Column('client_secret', sa.String(length=55), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_client_client_id'), 'client', ['client_id'], unique=True)
    op.create_index(op.f('ix_client_client_secret'), 'client', ['client_secret'], unique=True)
    op.create_table('profile',
    sa.Column('id', shared.database.UUID(length=32), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('username', sa.String(), nullable=True),
    sa.Column('image', sa.String(), nullable=True),
    sa.Column('firstname', sa.String(), nullable=True),
    sa.Column('lastname', sa.String(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('scope',
    sa.Column('id', shared.database.UUID(length=32), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('name', sa.String(length=255), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('api_client_scope',
    sa.Column('client_id', shared.database.UUID(length=32), nullable=True),
    sa.Column('scope_id', shared.database.UUID(length=32), nullable=True),
    sa.ForeignKeyConstraint(['client_id'], ['client.id'], ),
    sa.ForeignKeyConstraint(['scope_id'], ['scope.id'], ),
    sa.UniqueConstraint('client_id', 'scope_id', name='client_scope_no_dups')
    )
    op.create_table('user',
    sa.Column('id', shared.database.UUID(length=32), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('profile_id', shared.database.UUID(length=32), nullable=True),
    sa.Column('email', sa.String(), nullable=True),
    sa.Column('password_hash', sa.String(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.ForeignKeyConstraint(['profile_id'], ['profile.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    ### end Alembic commands ###


def downgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('user')
    op.drop_table('api_client_scope')
    op.drop_table('scope')
    op.drop_table('profile')
    op.drop_index(op.f('ix_client_client_secret'), table_name='client')
    op.drop_index(op.f('ix_client_client_id'), table_name='client')
    op.drop_table('client')
    ### end Alembic commands ###
