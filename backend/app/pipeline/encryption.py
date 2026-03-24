from cryptography.fernet import Fernet
import base64
import os
import hmac
import hashlib


def get_fernet(user_id: str) -> Fernet:
    """Derive a per-user Fernet cipher from the master key + user_id (HMAC-SHA256)."""
    master = os.environ["MASTER_FERNET_KEY"].encode()
    derived = hmac.new(master, user_id.encode(), hashlib.sha256).digest()
    key = base64.urlsafe_b64encode(derived)
    return Fernet(key)


def encrypt(user_id: str, plaintext: str) -> str:
    return get_fernet(user_id).encrypt(plaintext.encode()).decode()


def decrypt(user_id: str, ciphertext: str) -> str:
    return get_fernet(user_id).decrypt(ciphertext.encode()).decode()
