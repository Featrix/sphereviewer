#!/usr/bin/env python3
import http.server
import socketserver
import os
import time
from datetime import datetime

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache') 
        self.send_header('Expires', '0')
        super().end_headers()
    
    def log_message(self, format, *args):
        timestamp = datetime.now().strftime('[%Y-%m-%d %H:%M:%S]')
        print(f"{self.address_string()} - - {timestamp} {format % args}")

PORT = 8080
Handler = NoCacheHTTPRequestHandler

print(f"🚀 No-cache server running at http://localhost:{PORT}/")
print("📝 JS files will be served with no-cache headers")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.") 