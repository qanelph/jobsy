"""add settings_json to global_config

Revision ID: 005
Revises: 004
Create Date: 2026-02-23 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('global_config', sa.Column('settings_json', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('global_config', 'settings_json')
