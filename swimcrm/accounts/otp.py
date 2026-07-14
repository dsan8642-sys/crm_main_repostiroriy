import base64
import hmac
import secrets
import struct
import time
from hashlib import sha1
from urllib.parse import quote


def generate_totp_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _secret_bytes(secret):
    padding = "=" * ((8 - len(secret) % 8) % 8)
    return base64.b32decode((secret + padding).upper())


def totp_code(secret, *, for_time=None, step=30, digits=6):
    for_time = int(for_time if for_time is not None else time.time())
    counter = for_time // step
    digest = hmac.new(_secret_bytes(secret), struct.pack(">Q", counter), sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10 ** digits)).zfill(digits)


def verify_totp(secret, code, *, for_time=None, step=30, digits=6, window=1):
    code = "".join(ch for ch in str(code) if ch.isdigit())
    if len(code) != digits:
        return False
    now = int(for_time if for_time is not None else time.time())
    for drift in range(-window, window + 1):
        expected = totp_code(secret, for_time=now + drift * step, step=step, digits=digits)
        if hmac.compare_digest(expected, code):
            return True
    return False


def provisioning_uri(*, secret, username, issuer="SwimCRM"):
    label = f"{issuer}:{username}"
    return (
        f"otpauth://totp/{quote(label)}?secret={secret}"
        f"&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"
    )
