const CRC32_TABLE = new Uint32Array(256);

for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let bit = 0; bit < 8; bit += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function u32be(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ]);
}

export function readU32be(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] << 24) >>> 0) |
    (data[offset + 1] << 16) |
    (data[offset + 2] << 8) |
    data[offset + 3]
  ) >>> 0;
}

export function appendCrc32(payload: Uint8Array): Uint8Array {
  return concatBytes(payload, u32be(crc32(payload)));
}

export function verifyCrc32(frame: Uint8Array): boolean {
  if (frame.length < 5) {
    return false;
  }
  const body = frame.slice(0, -4);
  return crc32(body) === readU32be(frame, frame.length - 4);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function toHex(data: Uint8Array): string {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function fromHex(hex: string): Uint8Array {
  const normalized = hex.replace(/\s+/g, "");
  if (normalized.length % 2 !== 0) {
    throw new Error("HEX length must be even");
  }
  const output = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < output.length; i += 1) {
    output[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return output;
}
