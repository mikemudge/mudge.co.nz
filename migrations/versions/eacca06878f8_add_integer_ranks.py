"""Add integer ranks.

Revision ID: eacca06878f8
Revises: a37d61c36d5f
Create Date: 2018-09-21 02:10:56.536474

"""

# revision identifiers, used by Alembic.
revision = 'eacca06878f8'
down_revision = 'a37d61c36d5f'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('rock1500_song', sa.Column('rank2015', sa.Integer(), nullable=True))
    op.add_column('rock1500_song', sa.Column('rank2016', sa.Integer(), nullable=True))
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('rock1500_song', 'rank2016')
    op.drop_column('rock1500_song', 'rank2015')
    # ### end Alembic commands ###