#!/usr/bin/env python3
"""
Seed the Pinecone startup_playbooks namespace with markdown files
from backend/data/playbooks/.

Usage:
    python backend/scripts/seed_knowledge_base.py
"""
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.pipeline.embedder import upsert_to_pinecone


PLAYBOOK_DIR_CANDIDATES = [
    Path(__file__).parent.parent / "data" / "playbooks",
    Path(__file__).parent.parent / "backend" / "data" / "playbooks",
]
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


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """
    Parse lightweight YAML-like frontmatter:
    ---
    applicable_stages: [seed, series-a]
    ---
    """
    if not content.startswith("---\n"):
        return {}, content

    end = content.find("\n---\n", 4)
    if end == -1:
        return {}, content

    raw_meta = content[4:end].strip().splitlines()
    body = content[end + 5 :]
    meta = {}
    for line in raw_meta:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            items = [item.strip().strip('"').strip("'") for item in value[1:-1].split(",")]
            meta[key] = [item.lower() for item in items if item]
        elif value:
            meta[key] = value.strip('"').strip("'")
    return meta, body


def seed_file(filepath: Path, source_name: str):
    """Embed and upsert a single markdown file."""
    raw_content = filepath.read_text(encoding="utf-8")
    frontmatter, content = parse_frontmatter(raw_content)
    chunks = chunk_text(content)
    applicable_stages = frontmatter.get(
        "applicable_stages", ["pre-seed", "seed", "series-a"]
    )

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
                "applicable_stages": applicable_stages,
            },
        )

    print(f"  Done: {filepath.name}")


def main():
    playbooks_dir = next((path for path in PLAYBOOK_DIR_CANDIDATES if path.exists()), None)
    if playbooks_dir is None:
        print(f"Playbooks directory not found. Checked: {PLAYBOOK_DIR_CANDIDATES}")
        print("Create backend/data/playbooks/ and add markdown files.")
        sys.exit(1)

    md_files = list(playbooks_dir.glob("**/*.md"))
    if not md_files:
        print("No markdown files found in playbooks directory.")
        sys.exit(1)

    print(f"Found {len(md_files)} playbook files.")
    for filepath in md_files:
        seed_file(filepath, source_name="startup_playbooks")

    print("\nSeeding complete!")


if __name__ == "__main__":
    main()
