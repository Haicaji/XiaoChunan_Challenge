try:
    from micropython import const
except ImportError:
    def const(value):
        return value

import bluetooth
import struct

import protocol

DEVICE_NAME = "CTF-BLE-LOCK"
SERVICE_UUID = "7e57ff10-8f45-4f2a-9c6d-2f4d4f4b0001"
CHARACTERISTIC_UUID = "7e57ff11-8f45-4f2a-9c6d-2f4d4f4b0001"

_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

_FLAG_READ = const(0x0002)
_FLAG_WRITE_NO_RESPONSE = const(0x0004)
_FLAG_WRITE = const(0x0008)
_FLAG_NOTIFY = const(0x0010)

_ADV_TYPE_FLAGS = const(0x01)
_ADV_TYPE_NAME = const(0x09)
_ADV_TYPE_UUID128_COMPLETE = const(0x07)


def advertising_payload(name=None, services=None):
    payload = bytearray()

    def append(adv_type, value):
        payload.extend(struct.pack("BB", len(value) + 1, adv_type))
        payload.extend(value)

    append(_ADV_TYPE_FLAGS, struct.pack("B", 0x06))

    if name:
        append(_ADV_TYPE_NAME, name.encode())

    if services:
        for uuid in services:
            encoded = bytes(uuid)
            if len(encoded) == 16:
                append(_ADV_TYPE_UUID128_COMPLETE, encoded)

    return payload


class BleLock:
    def __init__(self, ble, name=DEVICE_NAME):
        self._ble = ble
        self._name = name
        self._connections = set()
        self._states = {}
        self._ble.active(True)
        self._ble.irq(self._irq)
        self._register()
        self._advertise()

    def _register(self):
        flags = _FLAG_READ | _FLAG_WRITE | _FLAG_WRITE_NO_RESPONSE | _FLAG_NOTIFY
        service = (
            bluetooth.UUID(SERVICE_UUID),
            ((bluetooth.UUID(CHARACTERISTIC_UUID), flags),),
        )
        ((self._handle,),) = self._ble.gatts_register_services((service,))
        self._ble.gatts_set_buffer(self._handle, 64, False)
        self._ble.gatts_write(self._handle, protocol.INVALID_RESPONSE)

    def _irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            conn_handle, _, _ = data
            self._connections.add(conn_handle)
            self._states[conn_handle] = {}
        elif event == _IRQ_CENTRAL_DISCONNECT:
            conn_handle, _, _ = data
            self._connections.discard(conn_handle)
            self._states.pop(conn_handle, None)
            self._advertise()
        elif event == _IRQ_GATTS_WRITE:
            conn_handle, value_handle = data
            if value_handle == self._handle:
                request = self._ble.gatts_read(self._handle)
                response = protocol.handle_packet(request, self._states.setdefault(conn_handle, {}))
                self._ble.gatts_write(self._handle, response)
                if conn_handle in self._connections:
                    self._ble.gatts_notify(conn_handle, self._handle, response)

    def _advertise(self, interval_us=100000):
        adv_payload = advertising_payload(services=[bluetooth.UUID(SERVICE_UUID)])
        resp_payload = advertising_payload(name=self._name)
        self._ble.gap_advertise(interval_us, adv_data=adv_payload, resp_data=resp_payload)


def main():
    BleLock(bluetooth.BLE())


if __name__ == "__main__":
    main()
