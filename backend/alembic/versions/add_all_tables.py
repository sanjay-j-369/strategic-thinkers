"""add all tables

Revision ID: add_all_tables
Revises: 212ab838d306
Create Date: 2026-03-26 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'add_all_tables'
down_revision: Union[str, None] = '212ab838d306'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Only create tables that don't exist yet
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS users (
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            email VARCHAR(255) NOT NULL,
            google_token TEXT,
            slack_token TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            UNIQUE (email)
        )
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS archive (
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            source VARCHAR(50) NOT NULL,
            content_enc TEXT NOT NULL,
            context_tags JSON,
            ingested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS summaries (
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            type VARCHAR(50) NOT NULL,
            topic VARCHAR(500),
            summary_text TEXT,
            generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """))


def downgrade() -> None:
    op.drop_table('summaries')
    op.drop_table('archive')
    op.drop_table('users')
