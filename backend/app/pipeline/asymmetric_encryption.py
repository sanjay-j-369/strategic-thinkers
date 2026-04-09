import base64

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


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
