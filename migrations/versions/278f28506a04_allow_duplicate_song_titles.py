"""Allow duplicate song titles.

Revision ID: 278f28506a04
Revises: a48f84877862
Create Date: 2017-09-10 14:05:12.237448

"""

# revision identifiers, used by Alembic.
revision = '278f28506a04'
down_revision = 'a48f84877862'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_index('ix_rock1500_song_title', table_name='rock1500_song')
    op.create_index(op.f('ix_rock1500_song_title'), 'rock1500_song', ['title'], unique=False)
    ### end Alembic commands ###


def downgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_rock1500_song_title'), table_name='rock1500_song')
    op.create_index('ix_rock1500_song_title', 'rock1500_song', ['title'], unique=True)
    ### end Alembic commands ###
