import base64
import json
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def encrypt_with_public_key(public_key_pem: str, plaintext: str) -> str:
    public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
    ciphertext = public_key.encrypt(
        plaintext.encode("utf-8"),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(ciphertext).decode("utf-8")


def encrypt_large_with_public_key(public_key_pem: str, plaintext: str) -> str:
    """Encrypt arbitrarily large content using AES-GCM + RSA-OAEP key wrapping."""
    public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
    aes_key = os.urandom(32)
    iv = os.urandom(12)
    ciphertext = AESGCM(aes_key).encrypt(iv, plaintext.encode("utf-8"), None)
    wrapped_key = public_key.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return json.dumps(
        {
            "scheme": "rsa_aes_gcm",
            "wrapped_key": base64.b64encode(wrapped_key).decode("utf-8"),
            "iv": base64.b64encode(iv).decode("utf-8"),
            "ciphertext": base64.b64encode(ciphertext).decode("utf-8"),
        }
    )
