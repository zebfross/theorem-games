"""A static server for development that does not let the browser cache anything.

`python3 -m http.server` sends no cache headers at all, so browsers fall back to
heuristic caching off Last-Modified — which means an edited script can keep
running in its old form long after it was saved. That wastes a great deal of
time chasing errors whose line numbers refer to a file no longer on disk, and
it is invisible while it is happening.

Usage:  python3 tools/serve.py [port]
"""

import functools
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass                                   # quiet; failures still surface


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True                 # restart without waiting on TIME_WAIT
    daemon_threads = True


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8421
    handler = functools.partial(NoCache, directory=ROOT)
    with Server(('127.0.0.1', port), handler) as httpd:
        print(f'serving {ROOT} on http://127.0.0.1:{port} with caching off')
        httpd.serve_forever()
