"""add missing user columns (email, password_hash, must_change_password)

Revision ID: 002
Revises: 001
Create Date: 2026-02-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('email', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('password_hash', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default=sa.text('true')))
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_column('users', 'must_change_password')
    op.drop_column('users', 'password_hash')
    op.drop_column('users', 'email')
