"""add users and user_watchlist_items tables

Revision ID: b3c4d5e6f7a8
Revises:
Create Date: 2026-05-30

Creates the 'users' and 'user_watchlist_items' tables for personal watchlist
and JWT authentication. Does NOT modify the existing global 'watchlist' table.

Uses IF NOT EXISTS checks so this migration is safe to run even if
Base.metadata.create_all() already created the tables (e.g. first deploy
with fresh DB where lifespan ran create_all before alembic).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "b3c4d5e6f7a8"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = inspector.get_table_names()

    if "users" not in existing_tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_users_id", "users", ["id"])
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    if "user_watchlist_items" not in existing_tables:
        op.create_table(
            "user_watchlist_items",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("symbol", sa.String(20), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
            sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "symbol", name="uq_user_watchlist_symbol"),
        )
        op.create_index("ix_user_watchlist_items_id", "user_watchlist_items", ["id"])
        op.create_index("ix_user_watchlist_items_user_id", "user_watchlist_items", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_watchlist_items")
    op.drop_table("users")
