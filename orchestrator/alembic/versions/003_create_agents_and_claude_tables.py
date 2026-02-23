"""create agents and claude_credentials tables

Revision ID: 003
Revises: 002
Create Date: 2026-02-23 12:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # agents
    op.create_table(
        'agents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('telegram_user_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('creating', 'running', 'stopped', 'error', 'deleted', name='agentstatus'), nullable=False),
        sa.Column('container_id', sa.String(255), nullable=True),
        sa.Column('browser_container_id', sa.String(255), nullable=True),
        sa.Column('port', sa.Integer(), nullable=True),
        sa.Column('custom_instructions', sa.Text(), nullable=True),
        sa.Column('telegram_bot_token', sa.String(255), nullable=True),
        sa.Column('claude_api_key', sa.String(255), nullable=True),
        sa.Column('browser_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('env_vars', sa.Text(), nullable=True),
        sa.Column('total_sessions', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('active_sessions', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_heartbeat', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index('ix_agents_telegram_user_id', 'agents', ['telegram_user_id'])

    # claude_credentials
    op.create_table(
        'claude_credentials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('auth_mode', sa.Enum('oauth', 'api_key', name='authmode'), nullable=False),
        sa.Column('access_token', sa.Text(), nullable=True),
        sa.Column('refresh_token', sa.Text(), nullable=True),
        sa.Column('expires_at', sa.BigInteger(), nullable=True),
        sa.Column('api_key', sa.String(255), nullable=True),
        sa.Column('account_email', sa.String(255), nullable=True),
        sa.Column('organization_name', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('claude_credentials')
    op.drop_index('ix_agents_telegram_user_id', table_name='agents')
    op.drop_table('agents')
    sa.Enum(name='authmode').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='agentstatus').drop(op.get_bind(), checkfirst=True)
