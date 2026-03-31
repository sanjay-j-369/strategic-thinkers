from cryptography.fernet import Fernet
import base64

key = b'7C9_xH7n-2TfA8XmK_j_yWkXN2q48R_bZ0J8m4lR5G8='
try:
    f = Fernet(key)
    print(f.encrypt(b"dev@myStartup.io").decode())
except Exception as e:
    print(e)
