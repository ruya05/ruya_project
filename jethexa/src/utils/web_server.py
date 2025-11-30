import http.server
import socketserver
import threading
import time
from functools import partial
from ..config import WEB_SERVER_PORT, TEMPLATE_DIR

def start_web_server():
    """Start local web server in background thread serving from TEMPLATE_DIR"""
    
    def run_server():
        try:
            # Use partial to pass the directory argument to SimpleHTTPRequestHandler
            # This requires Python 3.7+
            Handler = partial(http.server.SimpleHTTPRequestHandler, directory=TEMPLATE_DIR)
            
            # Allow address reuse to avoid "Address already in use" errors on restart
            socketserver.TCPServer.allow_reuse_address = True
            
            with socketserver.TCPServer(("", WEB_SERVER_PORT), Handler) as httpd:
                print(f"✅ Web server running at http://localhost:{WEB_SERVER_PORT}")
                print(f"📂 Serving files from: {TEMPLATE_DIR}")
                httpd.serve_forever()
        except Exception as e:
            print(f"❌ Error starting web server: {e}")
    
    # Start server in daemon thread so it doesn't block
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    print(f"🌐 Web server starting on port {WEB_SERVER_PORT}...")
    time.sleep(1)  # Give it a moment to start
