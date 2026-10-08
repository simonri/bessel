"""Input-only idle detection on Wayland, without any helper program.

swayidle (and the plain ext-idle-notify request) honour idle inhibitors, so a
playing video or a page holding a wake lock keeps the user "active" all night.
ext-idle-notify-v1 version 2 adds get_input_idle_notification, which looks at
keyboard and pointer input only. This speaks just enough of the Wayland wire
protocol to ask for it; it reads nothing and changes nothing for other clients.
"""

import os
import socket
import struct
import threading
import time
from pathlib import Path

_DISPLAY_ID = 1
_REGISTRY_ID = 2
_SYNC_ID = 3
_SEAT_ID = 4
_NOTIFIER_ID = 5
_NOTIFICATION_ID = 6

# Opcodes, from wayland.xml and ext-idle-notify-v1.xml.
_DISPLAY_SYNC = 0
_DISPLAY_GET_REGISTRY = 1
_DISPLAY_ERROR = 0
_REGISTRY_BIND = 0
_REGISTRY_GLOBAL = 0
_CALLBACK_DONE = 0
_NOTIFIER_GET_INPUT_IDLE_NOTIFICATION = 2
_NOTIFICATION_IDLED = 0
_NOTIFICATION_RESUMED = 1

_NOTIFIER_INTERFACE = "ext_idle_notifier_v1"
_INPUT_IDLE_SINCE_VERSION = 2


class WaylandError(Exception):
    pass


def _socket_path() -> Path | None:
    display = os.environ.get("WAYLAND_DISPLAY")
    runtime = os.environ.get("XDG_RUNTIME_DIR")
    if not display:
        return None
    if display.startswith("/"):
        return Path(display)
    return Path(runtime) / display if runtime else None


def _string(value: str) -> bytes:
    data = value.encode() + b"\0"
    return struct.pack("=I", len(data)) + data + b"\0" * (-len(data) % 4)


def _message(object_id: int, opcode: int, args: bytes = b"") -> bytes:
    return struct.pack("=II", object_id, ((8 + len(args)) << 16) | opcode) + args


def _read_string(payload: bytes, offset: int) -> tuple[str, int]:
    (length,) = struct.unpack_from("=I", payload, offset)
    start = offset + 4
    value = payload[start : start + length - 1].decode(errors="replace")
    return value, start + length + (-length % 4)


class _Connection:
    def __init__(self, sock: socket.socket):
        self._sock = sock
        self._buffer = b""

    def send(self, data: bytes) -> None:
        self._sock.sendall(data)

    def events(self):
        """Yields (object_id, opcode, payload) until the compositor hangs up."""
        while True:
            while len(self._buffer) >= 8:
                object_id, size_opcode = struct.unpack_from("=II", self._buffer)
                size = size_opcode >> 16
                if size < 8:
                    raise WaylandError(f"Malformed message of {size} bytes")
                if len(self._buffer) < size:
                    break
                payload = self._buffer[8:size]
                self._buffer = self._buffer[size:]
                yield object_id, size_opcode & 0xFFFF, payload
            chunk = self._sock.recv(4096)
            if not chunk:
                return
            self._buffer += chunk


def _raise_if_error(object_id: int, opcode: int, payload: bytes) -> None:
    if object_id == _DISPLAY_ID and opcode == _DISPLAY_ERROR:
        _, code = struct.unpack_from("=II", payload)
        message, _ = _read_string(payload, 8)
        raise WaylandError(f"Compositor error {code}: {message}")


def subscribe(sock: socket.socket, timeout_ms: int) -> _Connection:
    """Binds the seat and the idle notifier, and asks for input-only idle.

    Raises WaylandError when the compositor doesn't offer it (version < 2).
    """
    conn = _Connection(sock)
    conn.send(_message(_DISPLAY_ID, _DISPLAY_GET_REGISTRY, struct.pack("=I", _REGISTRY_ID)))
    conn.send(_message(_DISPLAY_ID, _DISPLAY_SYNC, struct.pack("=I", _SYNC_ID)))

    globals_: dict[str, tuple[int, int]] = {}
    for object_id, opcode, payload in conn.events():
        _raise_if_error(object_id, opcode, payload)
        if object_id == _REGISTRY_ID and opcode == _REGISTRY_GLOBAL:
            (name,) = struct.unpack_from("=I", payload)
            interface, offset = _read_string(payload, 4)
            (version,) = struct.unpack_from("=I", payload, offset)
            globals_.setdefault(interface, (name, version))
        elif object_id == _SYNC_ID and opcode == _CALLBACK_DONE:
            break
    else:
        raise WaylandError("Compositor hung up during setup")

    notifier = globals_.get(_NOTIFIER_INTERFACE)
    seat = globals_.get("wl_seat")
    if notifier is None or notifier[1] < _INPUT_IDLE_SINCE_VERSION:
        raise WaylandError("Compositor has no input-only idle notifications")
    if seat is None:
        raise WaylandError("Compositor has no seat")

    def bind(name: int, interface: str, version: int, new_id: int) -> bytes:
        args = struct.pack("=I", name) + _string(interface) + struct.pack("=II", version, new_id)
        return _message(_REGISTRY_ID, _REGISTRY_BIND, args)

    conn.send(bind(seat[0], "wl_seat", 1, _SEAT_ID))
    conn.send(bind(notifier[0], _NOTIFIER_INTERFACE, _INPUT_IDLE_SINCE_VERSION, _NOTIFIER_ID))
    conn.send(
        _message(
            _NOTIFIER_ID,
            _NOTIFIER_GET_INPUT_IDLE_NOTIFICATION,
            struct.pack("=III", _NOTIFICATION_ID, timeout_ms, _SEAT_ID),
        )
    )
    return conn


class InputIdle:
    """Tracks whether there has been no keyboard or pointer input for `timeout`.

    Runs a background thread holding one Wayland connection. `alive` turns false
    if the compositor goes away; start a new instance to reconnect.
    """

    def __init__(self, timeout_secs: int):
        self._timeout_ms = timeout_secs * 1000
        self._idle = False
        self._alive = False
        self._sock: socket.socket | None = None

    @classmethod
    def connect(cls, timeout_secs: int) -> "InputIdle":
        """Raises WaylandError (or OSError) when input-only idle isn't available."""
        path = _socket_path()
        if path is None:
            raise WaylandError("Not in a Wayland session")
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect(str(path))
        watcher = cls(timeout_secs)
        try:
            conn = subscribe(sock, watcher._timeout_ms)
        except BaseException:
            sock.close()
            raise
        watcher._sock = sock
        watcher._alive = True
        threading.Thread(target=watcher._listen, args=(conn,), daemon=True).start()
        return watcher

    @property
    def idle(self) -> bool:
        return self._idle

    @property
    def alive(self) -> bool:
        return self._alive

    def close(self) -> None:
        self._alive = False
        if self._sock is not None:
            try:
                self._sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self._sock.close()
            self._sock = None

    def _listen(self, conn: _Connection) -> None:
        try:
            for object_id, opcode, payload in conn.events():
                _raise_if_error(object_id, opcode, payload)
                if object_id == _NOTIFICATION_ID:
                    if opcode == _NOTIFICATION_IDLED:
                        self._idle = True
                    elif opcode == _NOTIFICATION_RESUMED:
                        self._idle = False
        except (OSError, WaylandError):
            pass
        finally:
            self._idle = False
            self._alive = False


if __name__ == "__main__":
    # Manual check: prints idle/active as it changes, with a 5 s threshold.
    watcher = InputIdle.connect(5)
    last = None
    while watcher.alive:
        if watcher.idle != last:
            last = watcher.idle
            print(time.strftime("%H:%M:%S"), "idle" if last else "active", flush=True)
        time.sleep(0.2)
