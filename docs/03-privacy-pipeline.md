# 03 — Privacy Pipeline ("The Shield")

All data passes through a strict **Clean-Room Pipeline** before touching any AI system. The AI never sees raw PII.

---

## Pipeline Stages

```
Raw Data (from Gmail/Slack/Calendar/Simulator)
        │
        ▼
┌───────────────────────────────┐
│  1. PII STRIP (Presidio)      │
│                               │
│  "John called 555-0199"       │
│       ──────────────►         │
│  "<PERSON> called <PHONE>"    │
└───────────────┬───────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌──────────────┐  ┌───────────────────────────┐
│ 2. ENCRYPT   │  │  3. EMBED (OpenAI)         │
│   (Fernet)   │  │                           │
│              │  │  Redacted text → vector   │
│  Raw text    │  │  Upsert → Pinecone         │
│  → ciphertext│  │  namespace: founder_memory │
│  → Postgres  │  └───────────────────────────┘
│    archive   │
└──────────────┘
```

**Key rule:** OpenAI only ever receives `content_redacted`. The `content_raw` (original text) is encrypted with Fernet and stored in Postgres — it never leaves the server unencrypted.

---

## 1. PII Stripping — Microsoft Presidio

**File:** `backend/app/pipeline/pii.py`

```python
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

_analyzer   = AnalyzerEngine()
_anonymizer = AnonymizerEngine()

def strip_pii(text: str, language: str = "en") -> str:
    """Returns PII-redacted version of text."""
    results   = _analyzer.analyze(text=text, language=language)
    anonymized = _anonymizer.anonymize(text=text, analyzer_results=results)
    return anonymized.text
```

**What Presidio detects by default:**

| PII Type | Example Input | Redacted Output |
|----------|--------------|-----------------|
| Person name | `John Doe` | `<PERSON>` |
| Phone number | `555-0199` | `<PHONE_NUMBER>` |
| Email address | `john@client.com` | `<EMAIL_ADDRESS>` |
| Credit card | `4111-1111-1111-1111` | `<CREDIT_CARD>` |
| US SSN | `123-45-6789` | `<US_SSN>` |
| IP address | `192.168.1.1` | `<IP_ADDRESS>` |

Custom recognizers (e.g., API keys, Slack user IDs) can be added via `recognizer_registry`.

---

## 2. Field-Level Encryption — Fernet (AES-128-CBC)

**File:** `backend/app/pipeline/encryption.py`

```python
from cryptography.fernet import Fernet
import base64, os, hmac, hashlib

def get_fernet(user_id: str) -> Fernet:
    """Derive a per-user Fernet cipher from the master key + user_id (HMAC-SHA256)."""
    master  = os.environ["MASTER_FERNET_KEY"].encode()
    derived = hmac.new(master, user_id.encode(), hashlib.sha256).digest()
    key     = base64.urlsafe_b64encode(derived)
    return Fernet(key)

def encrypt(user_id: str, plaintext: str) -> str:
    return get_fernet(user_id).encrypt(plaintext.encode()).decode()

def decrypt(user_id: str, ciphertext: str) -> str:
    return get_fernet(user_id).decrypt(ciphertext.encode()).decode()
```

### Per-User Key Derivation

- One `MASTER_FERNET_KEY` is stored in AWS Secrets Manager / Doppler — never in `.env` committed to git
- Each user gets a unique derived key: `HMAC-SHA256(master_key, user_id)`
- If one user's derived key is somehow compromised, all other users' data is still safe
- Key rotation: re-derive from a new master key and re-encrypt the archive table

### Where the Key Lives

```
AWS Secrets Manager
    └── /founders-helper/MASTER_FERNET_KEY   (never in source control)

Runtime injection:
    MASTER_FERNET_KEY=$(aws secretsmanager get-secret-value ...) docker compose up
```

---

## 3. Embedding — Anonymized Only

**File:** `backend/app/pipeline/embedder.py`

```python
import openai, pinecone, os

def upsert_to_pinecone(
    vector_id: str,
    text:      str,       # ALWAYS content_redacted — never content_raw
    namespace: str,       # "founder_memory" | "startup_playbooks"
    metadata:  dict,
):
    embedding = openai.embeddings.create(
        model="text-embedding-3-small",
        input=text
    ).data[0].embedding

    index = pinecone.Index(os.environ["PINECONE_INDEX"])
    index.upsert(
        vectors=[(vector_id, embedding, metadata)],
        namespace=namespace
    )
```

### Pinecone Namespaces

| Namespace | Contents | Populated By |
|-----------|----------|-------------|
| `founder_memory` | Founder's own emails/Slack/meetings (redacted) | Consumer worker (DATA_INGESTION) |
| `startup_playbooks` | YC essays, PG essays, First Round Review | One-time seed script (run once) |

---

## 4. Postgres Archive Table

Stores the **encrypted** raw content so founders can view their source data in the Privacy Center.

```sql
CREATE TABLE archive (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    source       VARCHAR(50),       -- GMAIL | SLACK | CALENDAR
    content_enc  TEXT NOT NULL,     -- Fernet ciphertext
    context_tags JSONB,
    ingested_at  TIMESTAMPTZ DEFAULT NOW()
);
```

The Privacy Center's "View" button calls `decrypt(user_id, content_enc)` server-side. The "Forget" button:
1. `DELETE FROM archive WHERE id = ?`
2. `pinecone.index.delete(ids=[trace_id], namespace="founder_memory")`

---

## Security Guarantees

| Threat | Protection |
|--------|-----------|
| Database leaked | All raw content is Fernet ciphertext — unreadable without master key |
| OpenAI data breach | OpenAI only ever received `<PERSON>` tokens, not real names |
| Key compromise (one user) | Per-user derived keys — blast radius is one user |
| Accidental log leak | `content_raw` never logged; Celery task args log only `trace_id` |
