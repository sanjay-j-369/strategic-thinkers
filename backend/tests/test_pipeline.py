import os
import pytest

# Set a test master key before importing
os.environ.setdefault("MASTER_FERNET_KEY", "test-master-key-for-unit-tests-only")

from app.pipeline.encryption import encrypt, decrypt, get_fernet


USER_ID = "test-user-123"
PLAINTEXT = "Confidential: investor meeting notes for Q2."


def test_encrypt_returns_string():
    ciphertext = encrypt(USER_ID, PLAINTEXT)
    assert isinstance(ciphertext, str)
    assert ciphertext != PLAINTEXT


def test_decrypt_roundtrip():
    ciphertext = encrypt(USER_ID, PLAINTEXT)
    recovered = decrypt(USER_ID, ciphertext)
    assert recovered == PLAINTEXT


def test_different_users_different_keys():
    ct1 = encrypt("user-aaa", PLAINTEXT)
    ct2 = encrypt("user-bbb", PLAINTEXT)
    assert ct1 != ct2


def test_wrong_user_cannot_decrypt():
    ciphertext = encrypt("user-aaa", PLAINTEXT)
    with pytest.raises(Exception):
        decrypt("user-bbb", ciphertext)


def test_encrypt_empty_string():
    ciphertext = encrypt(USER_ID, "")
    recovered = decrypt(USER_ID, ciphertext)
    assert recovered == ""


def test_encrypt_unicode():
    text = "Meeting with 张伟 about Series A — €500k"
    ciphertext = encrypt(USER_ID, text)
    recovered = decrypt(USER_ID, ciphertext)
    assert recovered == text
