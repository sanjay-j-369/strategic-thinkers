"""add e2ee key material and pii scheme

Revision ID: c2e7d9b4a111
Revises: 9f4b6bb1b2e1
Create Date: 2026-04-09 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2e7d9b4a111"
down_revision: Union[str, None] = "9f4b6bb1b2e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS salt VARCHAR(255)"))
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key TEXT"))
    conn.execute(
        sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT")
    )
    conn.execute(
        sa.text(
            "ALTER TABLE pii_vault ADD COLUMN IF NOT EXISTS encryption_scheme VARCHAR(50) DEFAULT 'fernet' NOT NULL"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE pii_vault DROP COLUMN IF EXISTS encryption_scheme"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS encrypted_private_key"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS public_key"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS salt"))
