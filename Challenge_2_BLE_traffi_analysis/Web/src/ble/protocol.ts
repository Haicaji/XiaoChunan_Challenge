import { appendCrc32, concatBytes, crc32, readU32be, u32be, verifyCrc32 } from "./crc32";
import { desDecryptEcb, desEncryptEcb } from "./des";

export const OPCODE_HANDSHAKE_REQUEST = 0xaa;
export const OPCODE_HANDSHAKE_RESPONSE = 0xab;
export const OPCODE_UNLOCK_REQUEST = 0xba;
export const OPCODE_UNLOCK_RESPONSE = 0xbb;
export const INVALID_RESPONSE = new Uint8Array([0x00, 0x00]);

export type UnlockStatus = "success" | "failure";

export interface BuiltHandshakeRequest {
  packet: Uint8Array;
  crc: number;
  timestamp: number;
}

export interface ParsedHandshakeResponse {
  timestamp: number;
  marker: Uint8Array;
}

export interface BuiltUnlockRequest {
  packet: Uint8Array;
  timestamp: number;
}

export interface ParsedUnlockResponse {
  timestamp: number;
  account: string;
  status: UnlockStatus;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function timestampSeconds(): number {
  return Math.floor(Date.now() / 1000) >>> 0;
}

export function isInvalidResponse(packet: Uint8Array): boolean {
  return packet.length === 2 && packet[0] === 0x00 && packet[1] === 0x00;
}

export function keyFromCrc(crc: number): Uint8Array {
  const key = new Uint8Array(8);
  key.set(u32be(crc));
  return key;
}

export function buildHandshakeRequest(account: string, timestamp = timestampSeconds()): BuiltHandshakeRequest {
  const accountBytes = encoder.encode(account);
  if (accountBytes.length > 255) {
    throw new Error("Account is too long for BLE frame");
  }

  const body = concatBytes(
    new Uint8Array([OPCODE_HANDSHAKE_REQUEST]),
    u32be(timestamp),
    new Uint8Array([accountBytes.length]),
    accountBytes
  );
  const crc = crc32(body);
  return { packet: appendCrc32(body), crc, timestamp };
}

export function parseHandshakeResponse(packet: Uint8Array, requestCrc: number): ParsedHandshakeResponse {
  if (isInvalidResponse(packet)) {
    throw new Error("ESP32 returned invalid-frame marker 0000");
  }
  if (!verifyCrc32(packet)) {
    throw new Error("Handshake response CRC32 mismatch");
  }
  if (packet[0] !== OPCODE_HANDSHAKE_RESPONSE) {
    throw new Error("Unexpected handshake response opcode");
  }

  const encryptedMarker = packet.slice(5, -4);
  if (encryptedMarker.length !== 8) {
    throw new Error("Handshake marker must be 8 encrypted bytes");
  }

  return {
    timestamp: readU32be(packet, 1),
    marker: desDecryptEcb(encryptedMarker, keyFromCrc(requestCrc)).slice(0, 8)
  };
}

export function buildUnlockRequest(
  account: string,
  password: string,
  marker: Uint8Array,
  timestamp = timestampSeconds()
): BuiltUnlockRequest {
  if (marker.length !== 8) {
    throw new Error("Handshake marker must be exactly 8 bytes");
  }

  const accountBytes = encoder.encode(account);
  if (accountBytes.length > 255) {
    throw new Error("Account is too long for BLE frame");
  }

  const encryptedPassword = desEncryptEcb(encoder.encode(password), marker);
  const body = concatBytes(
    new Uint8Array([OPCODE_UNLOCK_REQUEST]),
    u32be(timestamp),
    new Uint8Array([accountBytes.length]),
    accountBytes,
    encryptedPassword
  );

  return { packet: appendCrc32(body), timestamp };
}

export function parseUnlockResponse(packet: Uint8Array, marker: Uint8Array): ParsedUnlockResponse {
  if (isInvalidResponse(packet)) {
    throw new Error("ESP32 returned invalid-frame marker 0000");
  }
  if (!verifyCrc32(packet)) {
    throw new Error("Unlock response CRC32 mismatch");
  }
  if (packet[0] !== OPCODE_UNLOCK_RESPONSE) {
    throw new Error("Unexpected unlock response opcode");
  }
  if (packet.length < 1 + 4 + 1 + 4 + 8) {
    throw new Error("Unlock response is too short");
  }

  const accountLength = packet[5];
  const accountStart = 6;
  const accountEnd = accountStart + accountLength;
  const encryptedStatus = packet.slice(accountEnd, -4);

  if (encryptedStatus.length === 0 || encryptedStatus.length % 8 !== 0) {
    throw new Error("Unlock status ciphertext length is invalid");
  }

  const statusByte = desDecryptEcb(encryptedStatus, marker)[0];
  if (statusByte !== 0x00 && statusByte !== 0x11) {
    throw new Error("Unlock status byte is invalid");
  }

  return {
    timestamp: readU32be(packet, 1),
    account: decoder.decode(packet.slice(accountStart, accountEnd)),
    status: statusByte === 0x00 ? "success" : "failure"
  };
}
