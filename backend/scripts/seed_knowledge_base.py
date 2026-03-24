#!/usr/bin/env python3
"""
Seed the Pinecone startup_playbooks namespace with markdown files
from backend/data/playbooks/.

Usage:
    python backend/scripts/seed_knowledge_base.py
"""
import os
import sys
import uuid
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.pipeline.embedder import upsert_to_pinecone


PLAYBOOKS_DIR = Path(__file__).parent.parent / "data" / "playbooks"
CHUNK_SIZE = 1000  # characters per chunk


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - 100  # 100-char overlap
    return chunks


def seed_file(filepath: Path, source_name: str):
    """Embed and upsert a single markdown file."""
    content = filepath.read_text(encoding="utf-8")
    chunks = chunk_text(content)

    print(f"Seeding {filepath.name}: {len(chunks)} chunks...")

    for i, chunk in enumerate(chunks):
        vector_id = f"{source_name}-{filepath.stem}-{i}"
        upsert_to_pinecone(
            vector_id=vector_id,
            text=chunk,
            namespace="startup_playbooks",
            metadata={
                "source": source_name,
                "filename": filepath.name,
                "chunk_index": i,
                "text": chunk,
            },
        )

    print(f"  Done: {filepath.name}")


def main():
    if not PLAYBOOKS_DIR.exists():
        print(f"Playbooks directory not found: {PLAYBOOKS_DIR}")
        print("Create backend/data/playbooks/ and add markdown files.")
        sys.exit(1)

    md_files = list(PLAYBOOKS_DIR.glob("**/*.md"))
    if not md_files:
        print("No markdown files found in playbooks directory.")
        sys.exit(1)

    print(f"Found {len(md_files)} playbook files.")
    for filepath in md_files:
        seed_file(filepath, source_name="startup_playbooks")

    print("\nSeeding complete!")


if __name__ == "__main__":
    main()
