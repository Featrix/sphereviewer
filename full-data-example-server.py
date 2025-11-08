#!/usr/bin/env python3
"""
Full Data Example Server
Flask server for the interactive sphere viewer test environment.

Features:
- Serves the interactive test HTML page
- Proxies external API calls (CORS handling)
- Proxies Featrix API calls
- Provides example data endpoints
- Serves static files (sphere-viewer.js, etc.)
"""

from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import requests
import os
import json
import sys
from datetime import datetime
from pathlib import Path

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
PORT = 8080
FEATRIX_API_BASE = "https://sphere-api.featrix.com"
STATIC_DIR = Path(__file__).parent

# Logging
def log(message, level="INFO"):
    timestamp = datetime.now().strftime('[%Y-%m-%d %H:%M:%S]')
    print(f"{timestamp} [{level}] {message}")

@app.route('/')
def index():
    """Serve the interactive test HTML page"""
    html_file = STATIC_DIR / 'interactive-test.html'
    if html_file.exists():
        return send_from_directory(STATIC_DIR, 'interactive-test.html')
    else:
        return f"""
        <html>
            <head><title>Full Data Example Server</title></head>
            <body style="font-family: Arial, sans-serif; padding: 40px;">
                <h1>🧪 Full Data Example Server</h1>
                <p><strong>interactive-test.html</strong> not found in {STATIC_DIR}</p>
                <p>Available HTML files:</p>
                <ul>
                    {''.join([f'<li><a href="/{f.name}">{f.name}</a></li>' for f in STATIC_DIR.glob('*.html')])}
                </ul>
                <hr>
                <h2>Usage</h2>
                <ol>
                    <li>Make sure <code>interactive-test.html</code> exists in the project directory</li>
                    <li>Build the sphere viewer: <code>npm run build:embed</code></li>
                    <li>Start this server: <code>python3 full-data-example-server.py</code></li>
                    <li>Open <a href="/interactive-test.html">http://localhost:8080/interactive-test.html</a></li>
                </ol>
            </body>
        </html>
        """, 404

@app.route('/training', strict_slashes=False)
@app.route('/training/', strict_slashes=False)
@app.route('/training/<session_id>', strict_slashes=False)
def training(session_id=None):
    """Serve the training movie viewer page"""
    html_file = STATIC_DIR / 'training.html'
    if html_file.exists():
        return send_from_directory(STATIC_DIR, 'training.html')
    else:
        return f"""
        <html>
            <head><title>Training Movie Viewer</title></head>
            <body style="font-family: Arial, sans-serif; padding: 40px;">
                <h1>🎬 Training Movie Viewer</h1>
                <p><strong>training.html</strong> not found in {STATIC_DIR}</p>
                <p>Available HTML files:</p>
                <ul>
                    {''.join([f'<li><a href="/{f.name}">{f.name}</a></li>' for f in STATIC_DIR.glob('*.html')])}
                </ul>
            </body>
        </html>
        """, 404

@app.route('/proxy/external', methods=['GET', 'POST', 'PUT', 'DELETE'])
def proxy_external():
    """
    Proxy external API calls to handle CORS issues.
    
    Usage:
        GET /proxy/external?url=https://api.example.com/data
        POST /proxy/external?url=https://api.example.com/data
            Body: {"key": "value"}
    """
    target_url = request.args.get('url')
    
    if not target_url:
        return jsonify({'error': 'Missing url parameter'}), 400
    
    try:
        # Get request data
        data = None
        headers = {}
        
        if request.method in ['POST', 'PUT']:
            if request.is_json:
                data = request.get_json()
            else:
                data = request.get_data()
        
        # Copy relevant headers (excluding host, etc.)
        excluded_headers = ['host', 'content-length', 'connection']
        for header, value in request.headers:
            if header.lower() not in excluded_headers:
                headers[header] = value
        
        log(f"Proxying {request.method} request to {target_url}")
        
        # Make the request
        response = requests.request(
            method=request.method,
            url=target_url,
            json=data if isinstance(data, dict) else None,
            data=data if not isinstance(data, dict) else None,
            headers=headers,
            timeout=30
        )
        
        # Return response
        return Response(
            response.content,
            status=response.status_code,
            headers=dict(response.headers),
            mimetype=response.headers.get('Content-Type', 'application/json')
        )
        
    except requests.exceptions.RequestException as e:
        log(f"Proxy error: {str(e)}", "ERROR")
        return jsonify({'error': f'Proxy request failed: {str(e)}'}), 500
    except Exception as e:
        log(f"Unexpected error: {str(e)}", "ERROR")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@app.route('/proxy/featrix/<path:endpoint>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def proxy_featrix(endpoint):
    """
    Proxy Featrix API calls.
    
    Usage:
        GET /proxy/featrix/compute/session/{session_id}
        POST /proxy/featrix/compute/session/{session_id}/encode_records
            Body: {"query_record": {...}}
    """
    target_url = f"{FEATRIX_API_BASE}/{endpoint}"
    
    try:
        # Get request data
        data = None
        headers = {
            'Content-Type': 'application/json'
        }
        
        if request.method in ['POST', 'PUT']:
            if request.is_json:
                data = request.get_json()
            else:
                data = request.get_data()
        
        log(f"Proxying Featrix {request.method} request to {target_url}")
        
        # Make the request
        response = requests.request(
            method=request.method,
            url=target_url,
            json=data if isinstance(data, dict) else None,
            data=data if not isinstance(data, dict) else None,
            headers=headers,
            timeout=30
        )
        
        # Return response
        return Response(
            response.content,
            status=response.status_code,
            headers={'Content-Type': 'application/json'},
            mimetype='application/json'
        )
        
    except requests.exceptions.RequestException as e:
        log(f"Featrix proxy error: {str(e)}", "ERROR")
        return jsonify({'error': f'Featrix API request failed: {str(e)}'}), 500
    except Exception as e:
        log(f"Unexpected error: {str(e)}", "ERROR")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@app.route('/api/example-data', methods=['GET'])
def example_data():
    """
    Example endpoint that returns sample data for testing.
    
    Returns different data based on query parameters:
        ?type=user - User data
        ?type=product - Product data
        ?type=customer - Customer data
    """
    data_type = request.args.get('type', 'user')
    
    examples = {
        'user': {
            'id': 1,
            'name': 'John Doe',
            'email': 'john@example.com',
            'age': 30,
            'city': 'San Francisco',
            'score': 85.5
        },
        'product': {
            'id': 101,
            'name': 'Widget Pro',
            'category': 'Electronics',
            'price': 299.99,
            'rating': 4.5,
            'in_stock': True
        },
        'customer': {
            'customer_id': 'CUST-001',
            'name': 'Acme Corp',
            'industry': 'Technology',
            'revenue': 1000000,
            'employees': 50,
            'region': 'North America'
        }
    }
    
    return jsonify(examples.get(data_type, examples['user']))

@app.route('/api/batch-example', methods=['GET'])
def batch_example():
    """
    Returns multiple example records for batch processing.
    """
    count = int(request.args.get('count', 5))
    
    examples = []
    for i in range(count):
        examples.append({
            'id': i + 1,
            'name': f'Item {i + 1}',
            'value': 10.0 + i * 5,
            'category': ['A', 'B', 'C'][i % 3],
            'active': i % 2 == 0
        })
    
    return jsonify(examples)

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'featrix_api': FEATRIX_API_BASE
    })

# Custom 404 handler to return JSON instead of HTML
@app.errorhandler(404)
def not_found(error):
    """Return JSON for 404 errors instead of HTML"""
    return jsonify({'error': 'File not found'}), 404

# Serve static files (sphere-viewer.js, etc.) - must be last to avoid conflicts
@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files from the current directory"""
    # Skip if it's a route we've already handled
    if filename in ['training'] or filename.startswith('training/'):
        return jsonify({'error': 'File not found'}), 404
    
    if Path(STATIC_DIR / filename).exists():
        return send_from_directory(STATIC_DIR, filename)
    else:
        return jsonify({'error': 'File not found'}), 404

def kill_existing_instances():
    """Kill existing instances on port 8080"""
    import subprocess
    import signal
    
    try:
        result = subprocess.run(['lsof', '-t', '-i:8080'], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            pids = [p.strip() for p in result.stdout.strip().split('\n') if p.strip()]
            current_pid = os.getpid()
            parent_pid = os.getppid()
            
            for pid in pids:
                try:
                    pid_int = int(pid)
                    # Don't kill ourselves or our parent (Flask reloader)
                    if pid_int != current_pid and pid_int != parent_pid:
                        log(f"Killing process on port 8080 (PID: {pid})")
                        os.kill(pid_int, signal.SIGTERM)
                except (ProcessLookupError, ValueError):
                    pass
    except FileNotFoundError:
        pass  # lsof not available

if __name__ == '__main__':
    # Only kill existing instances on initial startup, not on reload
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        kill_existing_instances()
    
    log(f"Starting Full Data Example Server on port {PORT}")
    log(f"Serving from: {STATIC_DIR}")
    log(f"Featrix API: {FEATRIX_API_BASE}")
    log(f"Access the app at: http://localhost:{PORT}/")
    
    try:
        app.run(
            host='0.0.0.0',
            port=PORT,
            debug=True,
            threaded=True,
            use_reloader=True
        )
    except KeyboardInterrupt:
        log("Server stopped by user")
        sys.exit(0)
    except Exception as e:
        log(f"Server error: {str(e)}", "ERROR")
        sys.exit(1)

