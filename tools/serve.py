"""A static server for development that does not let the browser cache anything.

`python3 -m http.server` sends no cache headers at all, so browsers fall back to
heuristic caching off Last-Modified — which means an edited script can keep
running in its old form long after it was saved. That wastes a great deal of
time chasing errors whose line numbers refer to a file no longer on disk, and
it is invisible while it is happening.

It also answers /api the way the deployed site does when nobody is signed in.
That is not a backend — there is a real one in PHP at api/ — it exists so that
development and the tests see the same shape as production. Without it every
page load fetches /api/me, gets a 404, and Chrome writes an error to the
console, which fails the end-to-end tests for a fault that is not there.

Usage:  python3 tools/serve.py [port]
"""

import functools
import http.server
import json
import os
import socketserver
import sys
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@functools.lru_cache(maxsize=1)
def _game_ids():
    """The ids the site ships, as the real backend reads them."""
    try:
        with open(os.path.join(ROOT, 'games', 'registry.json')) as f:
            return {g['id'] for g in json.load(f).get('games', []) if 'id' in g}
    except OSError:
        return set()


class NoCache(http.server.SimpleHTTPRequestHandler):
    """Static files, plus a signed-out stand-in for the account endpoints."""

    def _api(self):
        """Answer as the real backend does with no session. None if not /api."""
        path = self.path.split('?')[0]
        if path == '/api/me':
            return 200, {'user': None}
        if path == '/api/progress':
            # Signed out: nothing stored, and nothing accepted.
            return (200, {'bests': {}}) if self.command == 'GET' \
                else (401, {'error': 'not signed in'})
        if path == '/api/logout':
            return 200, {'user': None}
        if path == '/api/counts':
            # A shared counter that has seen nothing, which is the shape the
            # homepage has to handle anyway on a freshly migrated database.
            return 200, {}
        if path.startswith('/api/play/'):
            if self.command != 'POST':
                return 404, {'error': 'no such endpoint'}
            # The real backend checks the id against the registry rather than
            # against a pattern, so this does too — a stand-in that accepts
            # what production refuses is a stand-in that hides a bug.
            game = unquote(path[len('/api/play/'):])
            if game not in _game_ids():
                return 404, {'error': 'no such game'}
            return 200, {'ok': True}
        if path.startswith('/api/'):
            return 404, {'error': 'no such endpoint'}
        return None

    def _send_api(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        got = self._api()
        if got:
            return self._send_api(*got)
        return super().do_GET()

    def do_POST(self):
        got = self._api()
        if got:
            return self._send_api(*got)
        self.send_error(405)

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
