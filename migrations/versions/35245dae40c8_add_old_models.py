"""Add old models


Revision ID: 35245dae40c8
Revises: 2616b325bcbd
Create Date: 2017-01-17 20:27:03.322067

"""

# revision identifiers, used by Alembic.
revision = '35245dae40c8'
down_revision = '2616b325bcbd'

from alembic import op
import sqlalchemy as sa


def upgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.create_table('biker',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('color', sa.String(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.String(), nullable=True),
    sa.Column('email', sa.String(), nullable=True),
    sa.Column('hash', sa.String(), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('fullname', sa.String(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email'),
    sa.UniqueConstraint('username')
    )
    op.create_table('walker',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('color', sa.String(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('addresses',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('email_address', sa.String(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('authed_thing',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id', 'user_id')
    )
    op.create_table('friendship',
    sa.Column('initiator_id', sa.Integer(), nullable=False),
    sa.Column('recipient_id', sa.Integer(), nullable=False),
    sa.Column('last_time', sa.TIMESTAMP(), server_default=sa.text(u'now()'), nullable=True),
    sa.ForeignKeyConstraint(['initiator_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['recipient_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('initiator_id', 'recipient_id')
    )
    op.create_table('ride',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('biker_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('date', sa.String(), nullable=True),
    sa.Column('distance', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['biker_id'], ['biker.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('user_auth',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('auth_token', sa.String(), nullable=False),
    sa.Column('expires', sa.TIMESTAMP(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('user_id', 'auth_token')
    )
    op.create_table('walk',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('walker_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('date', sa.String(), nullable=True),
    sa.Column('distance', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['walker_id'], ['walker.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    ### end Alembic commands ###


def downgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('walk')
    op.drop_table('user_auth')
    op.drop_table('ride')
    op.drop_table('friendship')
    op.drop_table('authed_thing')
    op.drop_table('addresses')
    op.drop_table('walker')
    op.drop_table('users')
    op.drop_table('biker')
    ### end Alembic commands ###
