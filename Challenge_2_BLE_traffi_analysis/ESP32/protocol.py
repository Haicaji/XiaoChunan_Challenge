try:
    from .des import decrypt_ecb, encrypt_ecb
except ImportError:
    from des import decrypt_ecb, encrypt_ecb

import time

VALID_USERNAME = "NISAXIAO"
VALID_PASSWORD = "ILOVEYOU"

OPCODE_HANDSHAKE_REQUEST = 0xAA
OPCODE_HANDSHAKE_RESPONSE = 0xAB
OPCODE_UNLOCK_REQUEST = 0xBA
OPCODE_UNLOCK_RESPONSE = 0xBB
INVALID_RESPONSE = b"\x00\x00"
DEBUG = True

_CRC_TABLE = []
for _i in range(256):
    _c = _i
    for _bit in range(8):
        if _c & 1:
            _c = 0xEDB88320 ^ (_c >> 1)
        else:
            _c >>= 1
    _CRC_TABLE.append(_c & 0xFFFFFFFF)


def crc32(data):
    crc = 0xFFFFFFFF
    for byte in data:
        crc = _CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >> 8)
    return (crc ^ 0xFFFFFFFF) & 0xFFFFFFFF


def u32be(value):
    return bytes(((value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF))


def read_u32be(data, offset):
    return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) & 0xFFFFFFFF


def append_crc32(payload):
    return bytes(payload) + u32be(crc32(payload))


def verify_crc32(frame):
    frame = bytes(frame)
    return len(frame) >= 5 and crc32(frame[:-4]) == read_u32be(frame, len(frame) - 4)


def key_from_crc(crc_value):
    return u32be(crc_value) + b"\x00\x00\x00\x00"


def _current_timestamp():
    try:
        return int(time.time()) & 0xFFFFFFFF
    except Exception:
        return 0


def _make_marker():
    try:
        import os
        return os.urandom(8)
    except Exception:
        seed = crc32(str(_current_timestamp()).encode())
        return u32be(seed) + u32be(seed ^ 0xA5A5A5A5)


def _parse_account(frame):
    if len(frame) < 1 + 4 + 1 + 4:
        raise ValueError("frame too short")
    account_length = frame[5]
    account_start = 6
    account_end = account_start + account_length
    if account_end > len(frame) - 4:
        raise ValueError("account length overflow")
    account = frame[account_start:account_end].decode()
    return account, account_end


def _debug(*parts):
    if DEBUG:
        try:
            print("proto:", *parts)
        except Exception:
            pass


def _build_unlock_response(account, marker, status):
    encrypted_status = encrypt_ecb(status, marker)
    account_bytes = account.encode()
    payload = (
        bytes((OPCODE_UNLOCK_RESPONSE,))
        + u32be(_current_timestamp())
        + bytes((len(account_bytes),))
        + account_bytes
        + encrypted_status
    )
    return append_crc32(payload)


def build_handshake_request(account, timestamp=0):
    account_bytes = account.encode()
    payload = bytes((OPCODE_HANDSHAKE_REQUEST,)) + u32be(timestamp) + bytes((len(account_bytes),)) + account_bytes
    return append_crc32(payload)


def build_unlock_request(account, password, marker, timestamp=0):
    account_bytes = account.encode()
    encrypted_password = encrypt_ecb(password.encode(), marker)
    payload = bytes((OPCODE_UNLOCK_REQUEST,)) + u32be(timestamp) + bytes((len(account_bytes),)) + account_bytes + encrypted_password
    return append_crc32(payload)


def handle_packet(packet, state=None, marker_factory=None):
    if state is None:
        state = {}
    packet = bytes(packet)
    marker_factory = marker_factory or _make_marker

    try:
        if not verify_crc32(packet):
            _debug("bad_crc", packet.hex())
            return INVALID_RESPONSE

        opcode = packet[0]
        _debug("opcode", hex(opcode), "len", len(packet))

        if opcode == OPCODE_HANDSHAKE_REQUEST:
            account, account_end = _parse_account(packet)
            _debug("handshake_account", account, "account_end", account_end, "frame_end", len(packet) - 4)
            if account_end != len(packet) - 4:
                _debug("handshake_extra_bytes")
                return INVALID_RESPONSE

            request_crc = read_u32be(packet, len(packet) - 4)
            marker = bytes(marker_factory())[:8]
            if len(marker) != 8:
                _debug("marker_len", len(marker))
                return INVALID_RESPONSE

            state["marker"] = marker
            state["account"] = account
            _debug("marker", marker.hex(), "state_account", account)
            encrypted_marker = encrypt_ecb(marker, key_from_crc(request_crc))
            payload = bytes((OPCODE_HANDSHAKE_RESPONSE,)) + u32be(_current_timestamp()) + encrypted_marker
            return append_crc32(payload)

        if opcode == OPCODE_UNLOCK_REQUEST:
            marker = state.get("marker")
            if not marker:
                _debug("unlock_no_marker", "state", state)
                return INVALID_RESPONSE

            account, account_end = _parse_account(packet)
            encrypted_password = packet[account_end:-4]
            _debug("unlock_account", account, "state_account", state.get("account"), "enc_len", len(encrypted_password))
            if not encrypted_password or len(encrypted_password) % 8 != 0:
                _debug("unlock_bad_cipher_len")
                return INVALID_RESPONSE

            try:
                password = decrypt_ecb(encrypted_password, marker).rstrip(b"\x00").decode()
            except UnicodeError:
                _debug("unlock_bad_password_utf8")
                return _build_unlock_response(account, marker, b"\x11")

            authenticated = (
                state.get("account") == account
                and account == VALID_USERNAME
                and password == VALID_PASSWORD
            )
            _debug("unlock_password", password, "authenticated", authenticated)
            status = b"\x00" if authenticated else b"\x11"
            return _build_unlock_response(account, marker, status)

        _debug("unknown_opcode")
        return INVALID_RESPONSE
    except Exception as exc:
        _debug("exception", repr(exc))
        return INVALID_RESPONSE
