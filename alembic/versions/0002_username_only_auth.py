"""make user email optional for username-only auth

Revision ID: 0002_username_only_auth
Revises: 0001_initial_database
Create Date: 2026-05-25 00:00:00.000001
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0002_username_only_auth"
down_revision = "0001_initial_database"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(length=255),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(length=255),
        nullable=False,
    )
