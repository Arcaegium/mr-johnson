"""Mr. Johnson dev server — plain http.server with caching disabled.

The stock `python -m http.server` sends no Cache-Control header, so
browsers heuristically cache modules and playtest rounds keep seeing
stale code (the "hard-refresh or it lies to you" problem). This
serves the same directory with `Cache-Control: no-store`: every load
refetches every file, always current, no Ctrl+F5 ritual.

Run:  python serve.py [port]     (default 8123)
Serves this file's own directory regardless of the working directory.
"""
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
BASE = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    http.server.test(
        HandlerClass=functools.partial(NoCacheHandler, directory=BASE),
        port=PORT,
    )
