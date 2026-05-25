"""add last_step_index to lesson_progress

Revision ID: 0003_add_last_step_index_to_lesson_progress
Revises: 0002_username_only_auth
Create Date: 2026-05-25 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0003_last_step_idx"
down_revision = "0002_username_only_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lesson_progress", sa.Column("last_step_index", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("lesson_progress", "last_step_index")
