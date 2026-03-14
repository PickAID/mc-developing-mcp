#!/usr/bin/env python3
"""
http_server.py — HTTP server wrapper for mc-developing-mcp.

Exposes all 10 MCP methods over HTTP so other devices can query the databases
without needing a local copy. Run this on the machine that has the SQLite files.

Usage:
    python mcp_server/http_server.py [--host HOST] [--port PORT]

    HOST  defaults to config.json "server_host"  (fallback: 0.0.0.0)
    PORT  defaults to config.json "server_port"  (fallback: 8765)

Authentication:
    Set "api_key" in config.json.  Clients must send:
        Authorization: Bearer <api_key>
    If api_key is empty, the server runs unauthenticated (LAN use only).

API:
    POST /call      — JSON body: {"method": "find_class", "params": {...}}
                      Returns:   {"id": ..., "result": ...}
                              or {"id": ..., "error": {"message": "..."}}
    GET  /health    — Returns:   {"status": "ok", "version": "..."}
"""
from __future__ import annotations

import argparse
import json
import signal
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# ── Import MCPServer from sibling module ──────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))
from server import MCPServer  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]


def _load_server_config() -> dict:
    cfg = ROOT / "config.json"
    if cfg.exists():
        try:
            return json.loads(cfg.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _read_release_version() -> str:
    raw = (ROOT / "version.json").read_text(encoding="utf-8").strip()
    if not raw:
        return "unknown"
    if raw.startswith("{"):
        obj = json.loads(raw)
        return str(obj.get("version", "unknown")).strip() or "unknown"
    return raw


def make_handler(mcp: MCPServer, api_key: str, version: str) -> type:
    """Return a BaseHTTPRequestHandler class with injected MCPServer state."""

    class MCPHTTPHandler(BaseHTTPRequestHandler):

        def do_GET(self) -> None:
            if self.path == "/health":
                self._json(200, {"status": "ok", "version": version})
            else:
                self.send_error(404, "Not Found")

        def do_POST(self) -> None:
            if self.path != "/call":
                self.send_error(404, "Not Found")
                return

            # ── Auth ───────────────────────────────────────────────────────
            if api_key:
                auth = self.headers.get("Authorization", "")
                if auth != f"Bearer {api_key}":
                    self._json(401, {"error": {"message": "Unauthorized"}})
                    return

            # ── Read body ──────────────────────────────────────────────────
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)

            req_id = None
            try:
                request = json.loads(body)
                req_id = request.get("id")
                result = mcp.handle(request)
                self._json(200, {"id": req_id, "result": result})
            except json.JSONDecodeError as e:
                self._json(400, {"id": req_id, "error": {"message": f"Invalid JSON: {e}"}})
            except ValueError as e:
                self._json(200, {"id": req_id, "error": {"message": str(e)}})
            except Exception as e:
                self._json(500, {"id": req_id, "error": {"message": str(e)}})

        def _json(self, code: int, payload: dict) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            sys.stderr.write(f"[mc-mcp] {self.address_string()} — {format % args}\n")

    return MCPHTTPHandler


def main() -> int:
    parser = argparse.ArgumentParser(
        description="mc-developing-mcp HTTP server — run on the device with databases",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--host", default="", help="Bind address (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=0, help="Port (default: 8765)")
    args = parser.parse_args()

    raw = _load_server_config()

    host    = args.host or str(raw.get("server_host", "0.0.0.0"))
    port    = args.port or int(raw.get("server_port", 8765))
    api_key = str(raw.get("api_key", "")).strip()

    # Read version for health endpoint
    version = "unknown"
    try:
        version = _read_release_version()
    except Exception:
        pass

    sys.stderr.write("[mc-mcp] Loading databases...\n")
    mcp = MCPServer()
    sys.stderr.write(f"[mc-mcp] HTTP server ready on http://{host}:{port}\n")

    if api_key:
        sys.stderr.write("[mc-mcp] API key authentication enabled\n")
    else:
        sys.stderr.write(
            "[mc-mcp] WARNING: api_key not set — server is unauthenticated.\n"
            "[mc-mcp]          Set api_key in config.json for network use.\n"
        )

    handler_class = make_handler(mcp, api_key, version)
    httpd = ThreadingHTTPServer((host, port), handler_class)

    def _shutdown(sig: int, _frame: object) -> None:
        sys.stderr.write("\n[mc-mcp] Shutting down...\n")
        httpd.shutdown()

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
