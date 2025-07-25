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
    
    # First, try to find what's using port 8080
    try:
        result = subprocess.run(['lsof', '-t', '-i:8080'], capture_output=True, text=True)
        if result.returncode == 0:
            pids = result.stdout.strip().split('\n')
            current_pid = str(os.getpid())
            
            for pid in pids:
                if pid and pid != current_pid:
                    try:
                        print(f"🔪 Killing process using port 8080 (PID: {pid})")
                        os.kill(int(pid), signal.SIGTERM)
                        killed_any = True
                        time.sleep(0.5)
                    except ProcessLookupError:
                        pass  # Process already dead
                    except Exception as e:
                        print(f"⚠️ Failed to kill PID {pid}: {e}")
    except FileNotFoundError:
        print("⚠️ lsof not available, trying alternative methods")
    
    # Also specifically look for no-cache-server.py and http.server processes
    try:
        # Find no-cache-server.py processes
        result = subprocess.run(['pgrep', '-f', 'python.*no-cache-server.py'], 
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            pids = result.stdout.strip().split('\n')
            current_pid = str(os.getpid())
            
            for pid in pids:
                if pid and pid != current_pid:
                    try:
                        print(f"🔪 Killing no-cache-server.py (PID: {pid})")
                        os.kill(int(pid), signal.SIGTERM)
                        killed_any = True
                        time.sleep(0.5)
                    except ProcessLookupError:
                        pass
                    except Exception as e:
                        print(f"⚠️ Failed to kill PID {pid}: {e}")
        
        # Find http.server on port 8080
        result = subprocess.run(['pgrep', '-f', 'python.*http.server.*8080'], 
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            pids = result.stdout.strip().split('\n')
            current_pid = str(os.getpid())
            
            for pid in pids:
                if pid and pid != current_pid:
                    try:
                        print(f"🔪 Killing http.server on port 8080 (PID: {pid})")
                        os.kill(int(pid), signal.SIGTERM)
                        killed_any = True
                        time.sleep(0.5)
                    except ProcessLookupError:
                        pass
                    except Exception as e:
                        print(f"⚠️ Failed to kill PID {pid}: {e}")
            
    except FileNotFoundError:
        # pgrep not available, try ps alternative
        try:
            result = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
            lines = result.stdout.split('\n')
            current_pid = str(os.getpid())
            
            for line in lines:
                if ('no-cache-server.py' in line or 'http.server' in line) and current_pid not in line:
                    try:
                        pid = line.split()[1]
                        print(f"🔪 Killing server process (PID: {pid})")
                        os.kill(int(pid), signal.SIGTERM)
                        killed_any = True
                    except:
                        pass
        except:
            print("⚠️ Could not check for existing instances")
    
    if killed_any:
        print("⏳ Waiting for processes to terminate...")
        time.sleep(2)  # Give more time if we killed something

def start_server():
    """Start the server with auto-restart on address conflicts"""
    PORT = 8080
    Handler = NoCacheHTTPRequestHandler
    
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            print(f"🚀 Starting no-cache server on http://localhost:{PORT}/ (attempt {attempt + 1})")
            print("📝 JS files will be served with no-cache headers")
            
            with socketserver.TCPServer(("", PORT), Handler) as httpd:
                print(f"✅ Server successfully started on port {PORT}")
                httpd.serve_forever()
                
        except OSError as e:
            if e.errno == 98:  # Address already in use
                print(f"⚠️ Port {PORT} is already in use (attempt {attempt + 1}/{max_retries})")
                
                if attempt < max_retries - 1:
                    print("🔄 Attempting to kill existing instances and retry...")
                    kill_existing_instances()
                    time.sleep(2)  # Wait before retry
                else:
                    print("❌ Failed to start server after multiple attempts")
                    print("🔧 Try manually killing processes with: pkill -f 'python.*no-cache-server.py'")
                    sys.exit(1)
            else:
                print(f"❌ Server error: {e}")
                sys.exit(1)
                
        except KeyboardInterrupt:
            print("\n🛑 Server stopped by user")
            sys.exit(0)

if __name__ == "__main__":
    start_server() 