"""unique rank2017

Revision ID: f32d736af695
Revises: 350e932825b7
Create Date: 2019-08-28 02:07:53.238154

"""

# revision identifiers, used by Alembic.
revision = 'f32d736af695'
down_revision = '350e932825b7'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index('ix_rock1500_song_rank2017', table_name='rock1500_song')
    op.create_index(op.f('ix_rock1500_song_rank2017'), 'rock1500_song', ['rank2017'], unique=True)
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_rock1500_song_rank2017'), table_name='rock1500_song')
    op.create_index('ix_rock1500_song_rank2017', 'rock1500_song', ['rank2017'], unique=False)
    # ### end Alembic commands ###
