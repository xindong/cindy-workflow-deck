"""Local-only browser fixture; no real Cindy tasks or project file access."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import json
import mimetypes
import sys

ROOT = Path(__file__).resolve().parent.parent / 'plugin'
JOURNAL = {}

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body=b'', content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/kv':
            return self.reply(200, json.dumps(JOURNAL, ensure_ascii=False).encode())
        if path == '/wake':
            return self.reply(200, b'{"ok":true,"state":"running"}')
        if path == '/app-context':
            return self.reply(200, b'{"ok":true,"context":{"locale":"zh-CN","region":"cn"}}')
        if path == '/test-host.js':
            return self.reply(200, (Path(__file__).parent / 'host-mock.js').read_bytes(), 'text/javascript')
        target = (ROOT / path.lstrip('/')).resolve()
        if not target.is_relative_to(ROOT) or not target.is_file():
            return self.reply(404)
        data = target.read_bytes()
        if path == '/panel.html':
            data = data.replace(b'<script type="module" src="panel.js">', b'<script type="module" src="/test-host.js"></script><script type="module" src="panel.js">')
        content_type = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css'}.get(target.suffix)
        return self.reply(200, data, content_type or mimetypes.guess_type(str(target))[0] or 'application/octet-stream')

    def do_PUT(self):
        global JOURNAL
        if urlparse(self.path).path != '/kv':
            return self.reply(404)
        length = int(self.headers.get('Content-Length', 0))
        if length > 65536:
            return self.reply(413)
        JOURNAL = json.loads(self.rfile.read(length))
        return self.reply(204)

    def log_message(self, *_):
        pass

if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 0), Handler)
    print('http://127.0.0.1:' + str(server.server_port), flush=True)
    server.serve_forever()
