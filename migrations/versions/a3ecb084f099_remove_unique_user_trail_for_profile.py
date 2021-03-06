"""Remove unique user/trail for profile


Revision ID: a3ecb084f099
Revises: 605c011dac99
Create Date: 2018-03-22 07:03:56.849758

"""

# revision identifiers, used by Alembic.
revision = 'a3ecb084f099'
down_revision = '605c011dac99'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_constraint('uq_trail_profile_trail_id', 'trail_profile', type_='unique')
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_unique_constraint('uq_trail_profile_trail_id', 'trail_profile', ['trail_id', 'user_id'])
    # ### end Alembic commands ###
