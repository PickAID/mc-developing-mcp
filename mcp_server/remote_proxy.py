#!/usr/bin/env python3
"""
remote_proxy.py — Lite stdio proxy for mc-developing-mcp.

Use this on devices that do NOT have the SQLite databases.
It provides the same stdio JSON-RPC interface as server.py but
forwards every call to a remote mc-developing-mcp HTTP server.

Configuration (config.json):
    {
        "remote_url": "http://192.168.1.10:8765",   ← required
        "api_key":    "your-secret-key",             ← if server requires auth
        "remote_timeout": 30                         ← seconds (default 30)
    }

AI client config (Claude Desktop, Cursor, etc.):
    {
        "mcpServers": {
            "mc-developing-mcp": {
                "command": "python3",
                "args": ["/path/to/mc-developing-mcp/mcp_server/remote_proxy.py"]
            }
        }
    }

Lite install — only these files are needed on the client device:
    mcp_server/remote_proxy.py    ← this file
    SKILL.md                      ← AI query rules
    docs/reference/               ← static reference markdown
    config.json                   ← with remote_url set
    version.json

No SQLite databases, no Python dependencies beyond stdlib.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TIMEOUT = 30


def _load_config() -> dict:
    cfg = ROOT / "config.json"
    if cfg.exists():
        try:
            return json.loads(cfg.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _call(url: str, api_key: str, request: dict, timeout: int) -> dict:
    body = json.dumps(request, ensure_ascii=False).encode("utf-8")
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "Accept":       "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    req = urllib.request.Request(
        url + "/call", data=body, headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _test_connection(url: str, api_key: str, timeout: int) -> bool:
    """GET /health to verify connectivity before entering the main loop."""
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        req = urllib.request.Request(url + "/health", headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
            ver = data.get("version", "?")
            sys.stderr.write(f"[mc-proxy] Connected to {url} (server v{ver})\n")
            return True
    except Exception as e:
        sys.stderr.write(f"[mc-proxy] WARNING: health check failed: {e}\n")
        sys.stderr.write("[mc-proxy] Continuing anyway — server may still respond.\n")
        return False


def main() -> int:
    config      = _load_config()
    remote_url  = str(config.get("remote_url", "")).rstrip("/").strip()
    api_key     = str(config.get("api_key", "")).strip()
    timeout     = int(config.get("remote_timeout", DEFAULT_TIMEOUT))

    if not remote_url:
        sys.stderr.write(
            "[mc-proxy] ERROR: remote_url is not set in config.json\n"
            "[mc-proxy] Add:  \"remote_url\": \"http://<server-host>:8765\"\n"
        )
        return 1

    sys.stderr.write(f"[mc-proxy] Remote → {remote_url}\n")
    _test_connection(remote_url, api_key, timeout)

    request: dict = {}
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            request  = json.loads(line)
            response = _call(remote_url, api_key, request, timeout)
            # Ensure response carries the original request id
            if "id" not in response:
                response["id"] = request.get("id")

        except urllib.error.HTTPError as e:
            response = {
                "id":    request.get("id"),
                "error": {"message": f"Remote server HTTP {e.code}: {e.reason}"},
            }
        except urllib.error.URLError as e:
            response = {
                "id":    request.get("id"),
                "error": {"message": f"Cannot reach {remote_url}: {e.reason}"},
            }
        except json.JSONDecodeError as e:
            response = {
                "id":    request.get("id"),
                "error": {"message": f"Invalid JSON from server: {e}"},
            }
        except Exception as e:
            response = {
                "id":    request.get("id"),
                "error": {"message": str(e)},
            }

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
