"""extend user auth and sync fields

Revision ID: 9f4b6bb1b2e1
Revises: add_all_tables
Create Date: 2026-04-02 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9f4b6bb1b2e1"
down_revision: Union[str, None] = "add_all_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)"))
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT"))
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_team_id VARCHAR(255)"))
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_channel_ids TEXT"))
    conn.execute(
        sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_last_synced_at TIMESTAMP WITH TIME ZONE"
        )
    )
    conn.execute(
        sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_last_synced_at TIMESTAMP WITH TIME ZONE"
        )
    )
    conn.execute(sa.text("ALTER TABLE summaries ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255)"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE summaries DROP COLUMN IF EXISTS source_ref"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS slack_last_synced_at"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS google_last_synced_at"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS slack_channel_ids"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS slack_team_id"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS password_hash"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS full_name"))
