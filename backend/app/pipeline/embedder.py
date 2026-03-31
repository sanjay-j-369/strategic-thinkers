import os
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

_model = SentenceTransformer("all-MiniLM-L6-v2")  # 384-dim, runs locally


def _get_pinecone_index():
    pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY", ""))
    return pc.Index(os.environ.get("PINECONE_INDEX", "founders-helper"))


def embed_text(text: str) -> list[float]:
    return _model.encode(text).tolist()


def upsert_to_pinecone(
    vector_id: str,
    text: str,       # ALWAYS content_redacted — never content_raw
    namespace: str,  # "founder_memory" | "startup_playbooks"
    metadata: dict,
):
    embedding = embed_text(text)
    try:
        index = _get_pinecone_index()
        index.upsert(
            vectors=[(vector_id, embedding, metadata)],
            namespace=namespace,
        )
    except Exception as e:
        print(f"[Simulated/Mock] Pinecone upsert bypassed due to error: {e}")
