"""Add album to song.

Revision ID: a48f84877862
Revises: 968bb88482cf
Create Date: 2017-09-10 13:47:56.263966

"""

# revision identifiers, used by Alembic.
revision = 'a48f84877862'
down_revision = '968bb88482cf'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.add_column(u'rock1500_song', sa.Column('album_id', shared.database.UUID(length=64), nullable=False))
    op.create_foreign_key(op.f('fk_rock1500_song_album_id_rock1500_album'), 'rock1500_song', 'rock1500_album', ['album_id'], ['id'])
    ### end Alembic commands ###


def downgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_constraint(op.f('fk_rock1500_song_album_id_rock1500_album'), 'rock1500_song', type_='foreignkey')
    op.drop_column(u'rock1500_song', 'album_id')
    ### end Alembic commands ###