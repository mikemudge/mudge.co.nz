"""add tournament models


Revision ID: 30fa7a3010f2
Revises: 894e6320d992
Create Date: 2017-02-12 16:39:56.075764

"""

# revision identifiers, used by Alembic.
revision = '30fa7a3010f2'
down_revision = '894e6320d992'

from alembic import op
import app
import sqlalchemy as sa
import shared


def upgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.create_table('tournament',
    sa.Column('id', shared.database.UUID(length=32), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('round',
    sa.Column('id', shared.database.UUID(length=32), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('tournament_id', shared.database.UUID(length=32), nullable=True),
    sa.ForeignKeyConstraint(['tournament_id'], ['tournament.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('team',
    sa.Column('id', shared.database.UUID(length=32), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('tournament_id', shared.database.UUID(length=32), nullable=True),
    sa.ForeignKeyConstraint(['tournament_id'], ['tournament.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('match',
    sa.Column('id', shared.database.UUID(length=32), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('round_id', shared.database.UUID(length=32), nullable=True),
    sa.Column('homeTeam_id', shared.database.UUID(length=32), nullable=True),
    sa.Column('awayTeam_id', shared.database.UUID(length=32), nullable=True),
    sa.Column('played', sa.Boolean(), nullable=True),
    sa.ForeignKeyConstraint(['awayTeam_id'], ['team.id'], ),
    sa.ForeignKeyConstraint(['homeTeam_id'], ['team.id'], ),
    sa.ForeignKeyConstraint(['round_id'], ['round.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    ### end Alembic commands ###


def downgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('match')
    op.drop_table('team')
    op.drop_table('round')
    op.drop_table('tournament')
    ### end Alembic commands ###
