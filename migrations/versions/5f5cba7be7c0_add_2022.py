"""Add 2022

Revision ID: 5f5cba7be7c0
Revises: 30fe5e808670
Create Date: 2022-09-07 04:32:21.523804

"""

# revision identifiers, used by Alembic.
revision = '5f5cba7be7c0'
down_revision = '30fe5e808670'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('rock1500_song', sa.Column('rank2022', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_rock1500_song_rank2022'), 'rock1500_song', ['rank2022'], unique=True)
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_rock1500_song_rank2022'), table_name='rock1500_song')
    op.drop_column('rock1500_song', 'rank2022')
    # ### end Alembic commands ###