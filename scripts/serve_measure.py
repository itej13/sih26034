"""
Local runner for `api/measure.py`, the Vercel Python function `next dev` cannot serve.

`api/` is deliberately outside `app/` (see AGENTS.md's landmine section) so Vercel picks it up
as a serverless function; `next dev` has no route for it and returns 404, which `lib/api.ts`
maps to PipelineUnavailableError and the capture page swallows by falling back to `/api/scan`'s
stub. A local "live" inspection then looks like it worked while quietly measuring nothing.

    .venv/bin/python scripts/serve_measure.py

Serves the same `handler` class `api/measure.py` already defines, unmodified, on
127.0.0.1:8000. `next.config.ts` rewrites `/api/measure` here in development only; production
keeps talking to the real Vercel Python function.
"""

import importlib.util
import sys
from http.server import HTTPServer
from pathlib import Path

MEASURE_PY = Path(__file__).resolve().parents[1] / "api" / "measure.py"
HOST, PORT = "127.0.0.1", 8000


def load_handler():
    """Import api/measure.py by path — it is not a package, so a normal import can't reach it."""
    spec = importlib.util.spec_from_file_location("measure", MEASURE_PY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.handler


def main():
    handler = load_handler()
    server = HTTPServer((HOST, PORT), handler)
    print(f"serving api/measure.py's handler on http://{HOST}:{PORT}/api/measure")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    sys.exit(main())
