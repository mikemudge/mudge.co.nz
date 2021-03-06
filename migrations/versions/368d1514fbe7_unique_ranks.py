"""unique ranks

Revision ID: 368d1514fbe7
Revises: 37f9c951ce57
Create Date: 2019-08-28 01:21:50.872308

"""

# revision identifiers, used by Alembic.
revision = '368d1514fbe7'
down_revision = '37f9c951ce57'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_index(op.f('ix_rock1500_song_rank2016'), 'rock1500_song', ['rank2016'], unique=True)
    op.drop_index('ix_rock1500_song_rank2019', table_name='rock1500_song')
    op.create_index(op.f('ix_rock1500_song_rank2019'), 'rock1500_song', ['rank2019'], unique=True)
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_rock1500_song_rank2019'), table_name='rock1500_song')
    op.create_index('ix_rock1500_song_rank2019', 'rock1500_song', ['rank2019'], unique=False)
    op.drop_index(op.f('ix_rock1500_song_rank2016'), table_name='rock1500_song')
    # ### end Alembic commands ###
