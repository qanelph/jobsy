"""add breakdown_by_model jsonb to agent_usage_snapshots

Revision ID: 007
Revises: 006
Create Date: 2026-04-30 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '007'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'agent_usage_snapshots',
        sa.Column(
            'breakdown_by_model',
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column('agent_usage_snapshots', 'breakdown_by_model')
