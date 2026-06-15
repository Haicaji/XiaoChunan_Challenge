import { CHARACTERISTIC_UUID, DEVICE_NAME_PREFIX, SERVICE_UUID } from "./constants";
import { toHex } from "./crc32";
import {
  buildHandshakeRequest,
  buildUnlockRequest,
  parseHandshakeResponse,
  parseUnlockResponse,
  type ParsedUnlockResponse
} from "./protocol";

export interface BleLogEntry {
  direction: "tx" | "rx" | "info";
  label: string;
  payload?: string;
  timestamp: string;
}

export interface BleUnlockResult {
  deviceName: string;
  response: ParsedUnlockResponse;
}

export type BleLogger = (entry: Omit<BleLogEntry, "timestamp">) => void;

function dataviewToBytes(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}

async function writeCharacteristic(characteristic: BluetoothRemoteGATTCharacteristic, packet: Uint8Array): Promise<void> {
  const payload: Uint8Array<ArrayBuffer> = new Uint8Array(packet.length);
  payload.set(packet);

  if (characteristic.properties.write) {
    await characteristic.writeValue(payload);
  } else if (characteristic.properties.writeWithoutResponse) {
    await characteristic.writeValueWithoutResponse(payload);
  } else {
    throw new Error("Characteristic does not support write");
  }
}

async function exchange(
  characteristic: BluetoothRemoteGATTCharacteristic,
  packet: Uint8Array,
  label: string,
  log: BleLogger
): Promise<Uint8Array> {
  log({ direction: "tx", label, payload: toHex(packet) });

  await writeCharacteristic(characteristic, packet);
  await new Promise((resolve) => window.setTimeout(resolve, 180));

  const response = dataviewToBytes(await characteristic.readValue());
  log({ direction: "rx", label: `${label} response`, payload: toHex(response) });
  return response;
}

export async function unlockOverBle(account: string, password: string, log: BleLogger): Promise<BleUnlockResult> {
  if (!navigator.bluetooth) {
    throw new Error("当前浏览器不支持 Web Bluetooth，请使用 Chrome/Edge 并在 HTTPS 或 localhost 下访问。");
  }

  log({ direction: "info", label: `Requesting ${DEVICE_NAME_PREFIX} over Web Bluetooth` });
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: DEVICE_NAME_PREFIX, services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID]
  });

  if (!device.gatt) {
    throw new Error("Selected BLE device does not expose a GATT server");
  }

  log({ direction: "info", label: `Connecting to ${device.name || "unknown device"}` });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

  const handshake = buildHandshakeRequest(account);
  const handshakeResponse = await exchange(characteristic, handshake.packet, "handshake", log);
  const parsedHandshake = parseHandshakeResponse(handshakeResponse, handshake.crc);

  const unlock = buildUnlockRequest(account, password, parsedHandshake.marker);
  const unlockResponse = await exchange(characteristic, unlock.packet, "unlock", log);
  const response = parseUnlockResponse(unlockResponse, parsedHandshake.marker);

  return {
    deviceName: device.name || DEVICE_NAME_PREFIX,
    response
  };
}
