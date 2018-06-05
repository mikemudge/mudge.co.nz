"""Add Friends

Revision ID: e10a83c1e5d5
Revises: bef1e81586af
Create Date: 2018-06-05 06:42:25.606965

"""

# revision identifiers, used by Alembic.
revision = 'e10a83c1e5d5'
down_revision = 'bef1e81586af'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('friendships',
    sa.Column('user_id', shared.database.UUID(length=64), nullable=True),
    sa.Column('friend_id', shared.database.UUID(length=64), nullable=True),
    sa.ForeignKeyConstraint(['friend_id'], ['user.id'], name=op.f('fk_friendships_friend_id_user')),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], name=op.f('fk_friendships_user_id_user')),
    sa.UniqueConstraint('user_id', 'friend_id', name='unique_friendships')
    )
    op.create_index(op.f('ix_friendships_user_id'), 'friendships', ['user_id'], unique=False)
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_friendships_user_id'), table_name='friendships')
    op.drop_table('friendships')
    # ### end Alembic commands ###
