"""Run with: python3 -m unittest test_wayland_idle"""

import socket
import struct
import threading
import time
import unittest

import wayland_idle as w


def _string(value: str) -> bytes:
    data = value.encode() + b"\0"
    return struct.pack("=I", len(data)) + data + b"\0" * (-len(data) % 4)


def _event(object_id: int, opcode: int, args: bytes = b"") -> bytes:
    return struct.pack("=II", object_id, ((8 + len(args)) << 16) | opcode) + args


def _read_requests(sock: socket.socket, count: int) -> list[tuple[int, int, bytes]]:
    buffer = b""
    requests = []
    while len(requests) < count:
        buffer += sock.recv(4096)
        while len(buffer) >= 8:
            object_id, size_opcode = struct.unpack_from("=II", buffer)
            size = size_opcode >> 16
            if len(buffer) < size:
                break
            requests.append((object_id, size_opcode & 0xFFFF, buffer[8:size]))
            buffer = buffer[size:]
    return requests


class FakeCompositor:
    """Answers the setup handshake the way Hyprland does."""

    def __init__(self, notifier_version: int = 2):
        self.client, self.server = socket.socketpair()
        self.notifier_version = notifier_version
        self.requests: list[tuple[int, int, bytes]] = []

    def handshake(self) -> None:
        self.requests += _read_requests(self.server, 2)  # get_registry, sync
        self.server.sendall(
            _event(2, 0, struct.pack("=I", 7) + _string("wl_seat") + struct.pack("=I", 9))
            + _event(2, 0, struct.pack("=I", 12) + _string("ext_idle_notifier_v1") + struct.pack("=I", self.notifier_version))
            + _event(3, 0, struct.pack("=I", 0))
        )
        if self.notifier_version >= 2:
            self.requests += _read_requests(self.server, 3)  # bind, bind, request


class InputIdleProtocolTest(unittest.TestCase):
    def test_asks_for_input_only_idle_on_the_seat(self):
        fake = FakeCompositor()
        thread = threading.Thread(target=fake.handshake)
        thread.start()
        w.subscribe(fake.client, 60_000)
        thread.join(timeout=5)

        bind_seat, bind_notifier, request = fake.requests[2:]
        self.assertEqual(bind_seat[:2], (2, 0))
        self.assertEqual(struct.unpack_from("=I", bind_seat[2])[0], 7)
        self.assertIn(b"ext_idle_notifier_v1", bind_notifier[2])
        # get_input_idle_notification(new_id=6, timeout_ms, seat=4)
        self.assertEqual(request[:2], (5, 2))
        self.assertEqual(struct.unpack("=III", request[2]), (6, 60_000, 4))

    def test_refuses_a_compositor_without_input_only_idle(self):
        fake = FakeCompositor(notifier_version=1)
        thread = threading.Thread(target=fake.handshake)
        thread.start()
        with self.assertRaises(w.WaylandError):
            w.subscribe(fake.client, 60_000)
        thread.join(timeout=5)

    def test_follows_idled_and_resumed_until_hangup(self):
        fake = FakeCompositor()
        thread = threading.Thread(target=fake.handshake)
        thread.start()
        conn = w.subscribe(fake.client, 60_000)
        thread.join(timeout=5)
        watcher = w.InputIdle(60)
        watcher._alive = True
        threading.Thread(target=watcher._listen, args=(conn,), daemon=True).start()

        def wait_for(condition):
            deadline = time.monotonic() + 2
            while not condition() and time.monotonic() < deadline:
                time.sleep(0.01)
            return condition()

        fake.server.sendall(_event(6, 0))
        self.assertTrue(wait_for(lambda: watcher.idle))
        fake.server.sendall(_event(6, 1))
        self.assertTrue(wait_for(lambda: not watcher.idle))
        fake.server.close()
        self.assertTrue(wait_for(lambda: not watcher.alive))


if __name__ == "__main__":
    unittest.main()
