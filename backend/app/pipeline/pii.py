from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
import uuid
from app.pipeline.encryption import encrypt
from app.pipeline.asymmetric_encryption import encrypt_with_public_key

_analyzer = AnalyzerEngine()
_anonymizer = AnonymizerEngine()

def strip_pii(
    text: str,
    user_id: str = None,
    language: str = "en",
    user_public_key: str | None = None,
):
    return text, {}
