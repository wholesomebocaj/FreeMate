"""initial database foundation

Revision ID: 0001_initial_database
Revises: 
Create Date: 2026-05-25 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0001_initial_database"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=False)

    op.create_table(
        "lesson_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("mastery_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("last_position_fen", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint(
            "status IN ('new', 'learning', 'shaky', 'mastered')",
            name="lesson_progress_status_valid",
        ),
        sa.UniqueConstraint("user_id", "lesson_id", name="uq_lesson_progress_user_lesson"),
    )
    op.create_index(op.f("ix_lesson_progress_user_id"), "lesson_progress", ["user_id"], unique=False)
    op.create_index(op.f("ix_lesson_progress_lesson_id"), "lesson_progress", ["lesson_id"], unique=False)

    op.create_table(
        "opening_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("opening_key", sa.String(length=128), nullable=False),
        sa.Column("branch_key", sa.String(length=128), nullable=False),
        sa.Column("move_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("mastery_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("user_id", "opening_key", "branch_key", name="uq_opening_progress_user_opening_branch"),
    )
    op.create_index(op.f("ix_opening_progress_user_id"), "opening_progress", ["user_id"], unique=False)
    op.create_index(op.f("ix_opening_progress_opening_key"), "opening_progress", ["opening_key"], unique=False)
    op.create_index(op.f("ix_opening_progress_branch_key"), "opening_progress", ["branch_key"], unique=False)

    op.create_table(
        "course_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.String(length=128), nullable=False),
        sa.Column("completed_lessons", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_percent", sa.Float(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("user_id", "course_id", name="uq_course_progress_user_course"),
    )
    op.create_index(op.f("ix_course_progress_user_id"), "course_progress", ["user_id"], unique=False)
    op.create_index(op.f("ix_course_progress_course_id"), "course_progress", ["course_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_course_progress_course_id"), table_name="course_progress")
    op.drop_index(op.f("ix_course_progress_user_id"), table_name="course_progress")
    op.drop_table("course_progress")

    op.drop_index(op.f("ix_opening_progress_branch_key"), table_name="opening_progress")
    op.drop_index(op.f("ix_opening_progress_opening_key"), table_name="opening_progress")
    op.drop_index(op.f("ix_opening_progress_user_id"), table_name="opening_progress")
    op.drop_table("opening_progress")

    op.drop_index(op.f("ix_lesson_progress_lesson_id"), table_name="lesson_progress")
    op.drop_index(op.f("ix_lesson_progress_user_id"), table_name="lesson_progress")
    op.drop_table("lesson_progress")

    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
