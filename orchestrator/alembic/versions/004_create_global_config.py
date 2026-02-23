"""create global_config table

Revision ID: 004
Revises: 003
Create Date: 2026-02-23 12:00:02.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'global_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('env_vars', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    # Insert singleton row
    op.execute("INSERT INTO global_config (id, env_vars) VALUES (1, '{}')")


def downgrade() -> None:
    op.drop_table('global_config')
