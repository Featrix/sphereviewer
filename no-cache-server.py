#!/usr/bin/env python3
import http.server
import socketserver
import os
import time
import subprocess
import sys
import signal
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

def kill_existing_instances():
    """Kill existing instances of this server and other servers on port 8080"""
    killed_any = False
    
    # Method 1: Use lsof to find processes using port 8080
    try:
        result = subprocess.run(['lsof', '-t', '-i:8080'], capture_output=True, text=True)
        if result.returncode == 0:
            pids = [p for p in result.stdout.strip().split('\n') if p and p != str(os.getpid())]
            for pid in pids:
                try:
                    print(f"🔪 Killing process using port 8080 (PID: {pid})")
                    os.kill(int(pid), signal.SIGTERM)
                    killed_any = True
                    time.sleep(0.2)
                except (ProcessLookupError, ValueError):
                    pass
                except Exception as e:
                    print(f"⚠️ Failed to kill PID {pid}: {e}")
                    try:
                        os.kill(int(pid), signal.SIGKILL)  # Force kill if SIGTERM fails
                        killed_any = True
                    except:
                        pass
    except FileNotFoundError:
        pass  # lsof not available
    
    # Method 2: Use fuser to kill processes on port 8080
    try:
        result = subprocess.run(['fuser', '-k', '8080/tcp'], capture_output=True, text=True)
        if result.returncode == 0:
            print("🔪 Used fuser to kill processes on port 8080")
            killed_any = True
    except FileNotFoundError:
        pass
    
    # Method 3: Kill common HTTP server processes (avoid killing ourselves)
    current_pid = os.getpid()
    
    # Kill http.server instances on port 8080
    try:
        result = subprocess.run(['pgrep', '-f', 'python.*http.server.*8080'], capture_output=True, text=True)
        if result.returncode == 0:
            pids = [p for p in result.stdout.strip().split('\n') if p and p != str(current_pid)]
            for pid in pids:
                try:
                    print(f"🔪 Killing http.server (PID: {pid})")
                    os.kill(int(pid), signal.SIGTERM)
                    killed_any = True
                except:
                    pass
    except FileNotFoundError:
        try:
            result = subprocess.run(['pkill', '-f', 'python.*http.server.*8080'], capture_output=True, text=True)
            if result.returncode == 0:
                print("🔪 Killed http.server processes on port 8080")
                killed_any = True
        except FileNotFoundError:
            pass
    
    # Only kill OTHER no-cache-server.py instances, not ourselves
    try:
        result = subprocess.run(['pgrep', '-f', 'python.*no-cache-server.py'], capture_output=True, text=True)
        if result.returncode == 0:
            pids = [p for p in result.stdout.strip().split('\n') if p and p != str(current_pid)]
            for pid in pids:
                try:
                    print(f"🔪 Killing old no-cache-server.py (PID: {pid})")
                    os.kill(int(pid), signal.SIGTERM)
                    killed_any = True
                except:
                    pass
    except FileNotFoundError:
        pass
    
    if killed_any:
        print("⏳ Waiting for processes to terminate...")
        time.sleep(1)  # Wait for processes to die
        
        # Double-check that port is actually free now
        try:
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(('localhost', 8080))
            sock.close()
            if result == 0:
                print("⚠️ Port 8080 still in use after cleanup, trying nuclear option...")
                subprocess.run(['sudo', 'fuser', '-k', '8080/tcp'], capture_output=True)
                time.sleep(1)
        except:
            pass

def start_server(port=8080):
    """Start the server with auto-restart on address conflicts"""
    PORT = port
    Handler = NoCacheHTTPRequestHandler

    # Kill any existing instances first
    print(f"🚀 Starting no-cache server on http://localhost:{PORT}/")
    print("🧹 Cleaning up any existing processes on port...")
    kill_existing_instances()
    
    max_retries = 2  # Reduced retries since we clean up first
    
    for attempt in range(max_retries):
        try:
            print(f"📡 Starting server (attempt {attempt + 1}/{max_retries})")
            print("🚫 JS files will be served with no-cache headers")

            with socketserver.TCPServer(("", PORT), Handler) as httpd:
                print(f"✅ Server successfully started on port {PORT}")
                print(f"🌐 Access your app at: http://localhost:{PORT}/")
                httpd.serve_forever()
                
        except OSError as e:
            if e.errno == 98:  # Address already in use
                print(f"❌ Port {PORT} still in use (attempt {attempt + 1}/{max_retries})")
                
                if attempt < max_retries - 1:
                    print("🔄 Final cleanup attempt...")
                    kill_existing_instances()
                    # Try to wait for port to be truly free
                    for wait_attempt in range(5):
                        try:
                            import socket
                            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                            sock.settimeout(0.5)
                            result = sock.connect_ex(('localhost', PORT))
                            sock.close()
                            if result != 0:
                                print(f"✅ Port {PORT} is now free!")
                                break
                            time.sleep(0.5)
                        except:
                            break
                else:
                    print(f"💥 FAILED: Could not free port {PORT} after all attempts")
                    print("🔧 Manual cleanup commands:")
                    print(f"   sudo lsof -ti:{PORT} | xargs kill -9")
                    print(f"   sudo fuser -k {PORT}/tcp")
                    sys.exit(1)
            else:
                print(f"💥 Server error: {e}")
                sys.exit(1)
                
        except KeyboardInterrupt:
            print("\n👋 Server stopped by user")
            sys.exit(0)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    start_server(port) 