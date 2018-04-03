"""Add name to trail profile.

Revision ID: bef1e81586af
Revises: 41e57a09bc93
Create Date: 2018-04-03 06:46:05.192507

"""

# revision identifiers, used by Alembic.
revision = 'bef1e81586af'
down_revision = '41e57a09bc93'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('trail_profile', sa.Column('name', sa.String(), nullable=True))
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('trail_profile', 'name')
    # ### end Alembic commands ###
