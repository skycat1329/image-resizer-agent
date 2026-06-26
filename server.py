import os
import sys
import json
import urllib.request
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from html.parser import HTMLParser

class ImageParser(HTMLParser):
    def __init__(self, base_url):
        super().__init__()
        self.base_url = base_url
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag == 'img':
            for name, value in attrs:
                if name == 'src' and value:
                    # Clean up data URIs if they exist, or resolve relative URLs
                    if not value.startswith('data:'):
                        absolute_url = urllib.parse.urljoin(self.base_url, value)
                        if absolute_url not in self.images:
                            self.images.append(absolute_url)

class ScrapingHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow CORS for proxying
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_path.query)

        if parsed_path.path == '/api/scrape':
            self.handle_scrape(query_params)
        elif parsed_path.path == '/api/proxy':
            self.handle_proxy(query_params)
        else:
            # Fallback to serving static files
            super().do_GET()

    def handle_scrape(self, params):
        if 'url' not in params or not params['url']:
            self.send_error_json(400, "URL parameter is missing")
            return

        target_url = params['url'][0]
        # Auto-prefix http if missing
        if not target_url.startswith(('http://', 'https://')):
            target_url = 'https://' + target_url

        try:
            req = urllib.request.Request(
                target_url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                html_content = response.read().decode('utf-8', errors='ignore')
                
            parser = ImageParser(target_url)
            parser.feed(html_content)
            
            # Send JSON response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'images': parser.images}).encode('utf-8'))
        except Exception as e:
            self.send_error_json(500, f"Failed to scrape page: {str(e)}")

    def handle_proxy(self, params):
        if 'url' not in params or not params['url']:
            self.send_error(400, "URL is missing")
            return

        image_url = params['url'][0]
        try:
            req = urllib.request.Request(
                image_url,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                content_type = response.headers.get('Content-Type', 'image/jpeg')
                image_data = response.read()

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            # Add CORS headers so Javascript canvas load doesn't crash on tainted canvas
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'max-age=86400')
            self.end_headers()
            self.wfile.write(image_data)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

    def send_error_json(self, status_code, message):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode('utf-8'))

def run(port=8000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, ScrapingHandler)
    print(f"[+] Local Image Resizer Server running at http://localhost:{port}")
    print("[+] Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[-] Stopping server...")
        sys.exit(0)

if __name__ == '__main__':
    run()
