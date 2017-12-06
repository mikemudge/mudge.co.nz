"""Add project

Revision ID: 367ba9509429
Revises: 93edff69a3c0
Create Date: 2017-11-29 19:05:15.870442

"""

# revision identifiers, used by Alembic.
revision = '367ba9509429'
down_revision = '93edff69a3c0'

from alembic import op
import app
import sqlalchemy as sa
import shared
import sqlalchemy_utils


def upgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.create_table('project',
    sa.Column('id', shared.database.UUID(length=64), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('base_url', sa.String(), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_project'))
    )
    op.create_table('file_url',
    sa.Column('id', shared.database.UUID(length=64), nullable=False),
    sa.Column('date_created', sa.DateTime(timezone=True), server_default=sa.text(u'now()'), nullable=True),
    sa.Column('project_js_id', shared.database.UUID(length=64), nullable=True),
    sa.Column('project_css_id', shared.database.UUID(length=64), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['project_css_id'], ['project.id'], name=op.f('fk_file_url_project_css_id_project'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_js_id'], ['project.id'], name=op.f('fk_file_url_project_js_id_project'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_file_url'))
    )
    ### end Alembic commands ###


def downgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('file_url')
    op.drop_table('project')
    ### end Alembic commands ###