import json
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER_PY = ROOT / "mcp_server" / "server.py"


def _send_request(proc, method: str, params: dict, req_id: int = 1) -> dict:
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params})
    line = body + "\n"
    proc.stdin.write(line.encode())
    proc.stdin.flush()
    raw = proc.stdout.readline()
    return json.loads(raw)


class TestServerProtocol(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proc = subprocess.Popen(
            [sys.executable, str(SERVER_PY)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        time.sleep(1.0)

    @classmethod
    def tearDownClass(cls):
        if cls.proc.stdin:
            cls.proc.stdin.close()
        cls.proc.terminate()
        cls.proc.wait(timeout=5)

    def _call(self, method: str, params: dict, req_id: int = 1) -> dict:
        return _send_request(self.proc, method, params, req_id)

    def test_versions_returns_list(self):
        resp = self._call("versions", {})
        self.assertIn("result", resp)
        self.assertIsInstance(resp["result"], list)
        self.assertGreater(len(resp["result"]), 0)

    def test_versions_has_required_fields(self):
        resp = self._call("versions", {})
        first = resp["result"][0]
        self.assertIn("version", first)
        self.assertIn("loader", first)
        self.assertIn("file_count", first)

    def test_search_returns_results(self):
        resp = self._call("search", {"version": "1.20.1", "loader": "forge", "query": "LivingHurtEvent"})
        self.assertIn("result", resp)
        self.assertIsInstance(resp["result"], list)

    def test_find_class_known_class(self):
        resp = self._call("find_class", {"version": "1.20.1", "loader": "forge", "class_name": "LivingHurtEvent"})
        self.assertIn("result", resp)
        result = resp["result"]
        self.assertIsNotNone(result)
        if isinstance(result, dict):
            self.assertIn("class_name", result)

    def test_get_class_detail_returns_methods(self):
        resp = self._call("get_class_detail", {"version": "1.20.1", "loader": "forge", "class_name": "LivingHurtEvent"})
        self.assertIn("result", resp)
        result = resp["result"]
        if result:
            self.assertIn("methods", result)

    def test_unknown_method_returns_error(self):
        resp = self._call("nonexistent_method", {})
        self.assertIn("error", resp)

    def test_missing_required_param_returns_error(self):
        resp = self._call("search", {"version": "1.20.1"})
        self.assertIn("error", resp)

    def test_invalid_version_returns_empty(self):
        resp = self._call("search", {"version": "9.99.9", "loader": "forge", "query": "anything"})
        self.assertIn("result", resp)
        self.assertEqual(resp["result"], [])

    def test_list_events_returns_list(self):
        resp = self._call("list_events", {"version": "1.20.1", "loader": "forge"})
        self.assertIn("result", resp)
        self.assertIsInstance(resp["result"], list)

    def test_search_methods_fts_fallback(self):
        resp = self._call("search_methods", {"version": "1.20.1", "loader": "forge", "query": "hurt"})
        self.assertIn("result", resp)
        self.assertIsInstance(resp["result"], list)

    def test_find_implementations_junction(self):
        resp = self._call("find_implementations", {"version": "1.20.1", "loader": "forge", "interface_or_class": "IModBusEvent"})
        self.assertIn("result", resp)
        self.assertIsInstance(resp["result"], list)
        self.assertGreater(len(resp["result"]), 0)

    def test_multiple_sequential_requests(self):
        for i in range(5):
            resp = self._call("versions", {}, req_id=i + 10)
            self.assertEqual(resp.get("id"), i + 10)
            self.assertIn("result", resp)

    def test_smart_search_composite(self):
        resp = self._call("smart_search", {"version": "1.20.1", "loader": "forge", "query": "LivingHurtEvent", "top_k": 2})
        self.assertIn("result", resp)
        self.assertIsInstance(resp["result"], list)

    def test_diff_versions_shape(self):
        resp = self._call("diff_versions", {
            "class_name": "ItemStack",
            "version_a": "1.20.1", "loader_a": "forge",
            "version_b": "1.21.1", "loader_b": "neoforge",
        })
        self.assertIn("result", resp)
        result = resp["result"]
        if result:
            self.assertIn("methods_added", result)
            self.assertIn("methods_removed", result)


class TestServerHTTPEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import socket
        s = socket.socket()
        s.bind(("", 0))
        cls.port = s.getsockname()[1]
        s.close()
        cls.proc = subprocess.Popen(
            [sys.executable, str(ROOT / "mcp_server" / "http_server.py"), "--port", str(cls.port)],
            stderr=subprocess.PIPE,
        )
        time.sleep(2.5)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=5)

    def _post(self, method: str, params: dict) -> dict:
        import urllib.request
        body = json.dumps({"method": method, "params": params}).encode()
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/call",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())

    def _get(self, path: str) -> dict:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}", timeout=5) as r:
            return json.loads(r.read())

    def test_health_endpoint(self):
        resp = self._get("/health")
        self.assertEqual(resp["status"], "ok")
        self.assertIn("version", resp)

    def test_call_versions(self):
        resp = self._post("versions", {})
        self.assertIn("result", resp)
        self.assertIsInstance(resp["result"], list)

    def test_call_search(self):
        resp = self._post("search", {"version": "1.20.1", "loader": "forge", "query": "ItemStack"})
        self.assertIn("result", resp)

    def test_call_unknown_method_error(self):
        resp = self._post("not_a_method", {})
        self.assertIn("error", resp)


if __name__ == "__main__":
    unittest.main()
