"""create agent_usage_snapshots

Revision ID: 006
Revises: 005
Create Date: 2026-04-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '006'
down_revision: Union[str, None] = '005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'agent_usage_snapshots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('agent_id', sa.Integer(), nullable=False),
        sa.Column('taken_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('input_tokens', sa.BigInteger(), nullable=False, server_default=sa.text('0')),
        sa.Column('output_tokens', sa.BigInteger(), nullable=False, server_default=sa.text('0')),
        sa.Column('cache_creation_input_tokens', sa.BigInteger(), nullable=False, server_default=sa.text('0')),
        sa.Column('cache_read_input_tokens', sa.BigInteger(), nullable=False, server_default=sa.text('0')),
        sa.Column('total_cost_usd', sa.Float(), nullable=True),
        sa.Column('events_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_agent_usage_snapshots_agent_taken',
        'agent_usage_snapshots',
        ['agent_id', 'taken_at'],
    )
    op.create_index(
        'ix_agent_usage_snapshots_taken_at',
        'agent_usage_snapshots',
        ['taken_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_agent_usage_snapshots_taken_at', table_name='agent_usage_snapshots')
    op.drop_index('ix_agent_usage_snapshots_agent_taken', table_name='agent_usage_snapshots')
    op.drop_table('agent_usage_snapshots')
