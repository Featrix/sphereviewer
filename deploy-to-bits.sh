#!/bin/bash

# FeatrixSphereViewer Deployment Script
# Deploys embeddable sphere viewer to bits host

set -e  # Exit on any error

HOST="bits"
REMOTE_PATH="/var/www/html/sv"
LOCAL_BUILD_DIR="dist"

echo "🚀 Deploying FeatrixSphereViewer to $HOST:$REMOTE_PATH"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we have the required files
print_status "Checking local files..."

if [ ! -f "$LOCAL_BUILD_DIR/sphere-viewer.js" ]; then
    print_error "sphere-viewer.js not found in $LOCAL_BUILD_DIR/"
    print_warning "Run 'npm run build:embed' first"
    exit 1
fi

print_success "Local files verified"

# Create remote directory if it doesn't exist
print_status "Creating remote directory $REMOTE_PATH on $HOST..."
ssh $HOST "sudo mkdir -p $REMOTE_PATH && sudo chown \$(whoami):\$(whoami) $REMOTE_PATH"
print_success "Remote directory ready"

# Copy main embeddable script
print_status "Copying embeddable script..."
scp $LOCAL_BUILD_DIR/sphere-viewer.js $HOST:$REMOTE_PATH/
print_success "sphere-viewer.js deployed"

# Copy example data
print_status "Copying example data..."
scp example-featrix-data.json $HOST:$REMOTE_PATH/
print_success "example-featrix-data.json deployed"



# Copy documentation
print_status "Copying documentation..."
scp README_USAGE.md $HOST:$REMOTE_PATH/
scp FINAL_NAMING_SUMMARY.md $HOST:$REMOTE_PATH/
scp NAMING_UPDATE_SUMMARY.md $HOST:$REMOTE_PATH/
print_success "Documentation deployed"

# Create public-facing branded landing page
print_status "Creating branded public landing page..."
cat > /tmp/sv-index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Featrix Sphere Viewer - 3D Data Visualization</title>
    <meta name="description" content="Professional embeddable 3D data visualization component by Featrix. Transform your data into interactive spheres with no API dependencies.">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background: linear-gradient(135deg, #059669 0%, #10b981 50%, #047857 100%);
            min-height: 100vh;
        }
        
        .hero {
            background: linear-gradient(135deg, rgba(5,150,105,0.95), rgba(4,120,87,0.95));
            color: white;
            padding: 80px 20px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        
        .hero::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="80" r="1.5" fill="rgba(255,255,255,0.1)"/></svg>');
            animation: float 20s linear infinite;
        }
        
        @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
            100% { transform: translateY(0px); }
        }
        
        .hero h1 {
            font-size: 3.5rem;
            font-weight: 700;
            margin-bottom: 20px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .hero .tagline {
            font-size: 1.3rem;
            margin-bottom: 40px;
            opacity: 0.95;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
        }
        
        .main-content {
            background: white;
            margin: -60px auto 0;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            padding: 60px 40px;
            position: relative;
            z-index: 10;
        }
        
        .section {
            margin: 50px 0;
        }
        
        .featrix-info {
            background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
            border: 2px solid #10b981;
            border-radius: 16px;
            padding: 40px;
            margin: 40px 0;
            text-align: center;
        }
        
        .featrix-info h2 {
            color: #047857;
            font-size: 2rem;
            margin-bottom: 20px;
        }
        
        .featrix-link {
            display: inline-block;
            padding: 15px 30px;
            background: linear-gradient(135deg, #059669, #10b981);
            color: white;
            text-decoration: none;
            border-radius: 50px;
            font-weight: 600;
            font-size: 1.1rem;
            margin: 20px 10px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(5,150,105,0.3);
        }
        
        .featrix-link:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(5,150,105,0.4);
        }
        
        .demo-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin: 40px 0;
        }
        
        .demo-card {
            background: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 16px;
            padding: 30px;
            text-align: center;
            transition: all 0.3s ease;
        }
        
        .demo-card:hover {
            border-color: #10b981;
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        
        .demo-card h3 {
            color: #047857;
            font-size: 1.3rem;
            margin-bottom: 15px;
        }
        
        .demo-btn {
            display: inline-block;
            padding: 12px 25px;
            background: #059669;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 500;
            margin-top: 15px;
            transition: background 0.2s;
        }
        
        .demo-btn:hover { background: #047857; }
        
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 30px;
            margin: 40px 0;
        }
        
        .feature {
            text-align: center;
            padding: 20px;
        }
        
        .feature-icon {
            font-size: 3rem;
            margin-bottom: 15px;
        }
        
        .integration-code {
            background: #1f2937;
            color: #f9fafb;
            padding: 25px;
            border-radius: 12px;
            overflow-x: auto;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 14px;
            margin: 20px 0;
            position: relative;
        }
        
        .integration-code::before {
            content: 'HTML';
            position: absolute;
            top: 8px;
            right: 15px;
            background: #059669;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
        }
        
        .footer {
            background: #1f2937;
            color: #d1d5db;
            padding: 60px 20px 40px;
            text-align: center;
            margin-top: 60px;
        }
        
        .footer-links {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin: 20px 0;
            flex-wrap: wrap;
        }
        
        .footer-links a {
            color: #10b981;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
        }
        
        .footer-links a:hover { color: #34d399; }
        
        @media (max-width: 768px) {
            .hero h1 { font-size: 2.5rem; }
            .hero .tagline { font-size: 1.1rem; }
            .main-content { margin: -40px 20px 0; padding: 40px 20px; }
        }
    </style>
</head>
<body>
    <div class="hero">
        <div class="container">
            <h1>Featrix Sphere Viewer</h1>
            <p class="tagline">Professional 3D data visualization that transforms your datasets into interactive spheres. Self-contained, embeddable, and API-free.</p>
        </div>
    </div>

    <div class="container">
        <div class="main-content">
            
            <div class="featrix-info">
                <h2>🚀 Powered by Featrix</h2>
                <p style="font-size: 1.1rem; margin-bottom: 25px;">
                    <strong>Featrix</strong> is the leading platform for AI-powered data transformation and visualization. 
                    We help organizations turn complex datasets into actionable insights through advanced machine learning 
                    and intuitive visualizations.
                </p>
                <p style="margin-bottom: 25px;">
                    Our mission is to democratize data science by making sophisticated analytics accessible to everyone. 
                    The Featrix Sphere Viewer is part of our commitment to providing powerful, easy-to-use tools 
                    for data exploration and presentation.
                </p>
                <a href="https://featrix.ai" class="featrix-link" target="_blank">🌐 Discover Featrix Platform</a>
                <a href="mailto:hello@featrix.ai" class="featrix-link">✉️ Contact Our Team</a>
            </div>

            <div class="section">
                <h2 style="text-align: center; color: #047857; font-size: 2.2rem; margin-bottom: 30px;">
                    🎯 Interactive Demos
                </h2>
                
                <div class="demo-grid">
                    <div class="demo-card">
                        <h3>📊 Complete Demo</h3>
                        <p>Full-featured data-driven visualization with all integration methods, sample data, and interactive controls.</p>
                        <a href="demo.html" class="demo-btn">Try Complete Demo</a>
                    </div>
                    
                    <div class="demo-card">
                        <h3>⚡ Quick Test</h3>
                        <p>Simple functionality test showing basic embedding and data loading capabilities.</p>
                        <a href="simple-test.html" class="demo-btn">Try Quick Test</a>
                    </div>
                    
                    <div class="demo-card">
                        <h3>🏷️ Component Test</h3>
                        <p>Verification of the FeatrixSphereViewer component naming and API functionality.</p>
                        <a href="test-new-naming.html" class="demo-btn">Try Component Test</a>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2 style="text-align: center; color: #047857; font-size: 2.2rem; margin-bottom: 40px;">
                    ✨ Key Features
                </h2>
                
                <div class="features">
                    <div class="feature">
                        <div class="feature-icon">🚀</div>
                        <h3>No API Dependencies</h3>
                        <p>Self-contained component that works offline. No server setup or API keys required.</p>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">📊</div>
                        <h3>Data-Driven</h3>
                        <p>Accepts Featrix data exports directly. Just export from Featrix and visualize instantly.</p>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">🔧</div>
                        <h3>Easy Integration</h3>
                        <p>Embed with a simple script tag. Works with any website, framework, or CMS.</p>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">⚡</div>
                        <h3>High Performance</h3>
                        <p>Optimized WebGL rendering with smooth interactions and responsive design.</p>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">🎨</div>
                        <h3>Professional Design</h3>
                        <p>Beautiful, modern interface with customizable themes and branding options.</p>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">📱</div>
                        <h3>Mobile Ready</h3>
                        <p>Responsive design that works perfectly on desktop, tablet, and mobile devices.</p>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2 style="text-align: center; color: #047857; font-size: 2.2rem; margin-bottom: 30px;">
                    🔧 Simple Integration
                </h2>
                <p style="text-align: center; font-size: 1.1rem; margin-bottom: 30px;">
                    Add 3D data visualization to your website with just a few lines of code:
                </p>
                
                <div class="integration-code">
&lt;!-- Load your Featrix data --&gt;
&lt;script&gt;
window.myFeatrixData = {
  session: { session_id: "your-session", status: "done" },
  coords: [/* your 3D coordinates */],
  entire_cluster_results: {/* clustering info */}
};
&lt;/script&gt;

&lt;!-- React dependencies --&gt;
&lt;script src="https://unpkg.com/react@18/umd/react.production.min.js"&gt;&lt;/script&gt;
&lt;script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"&gt;&lt;/script&gt;

&lt;!-- Featrix Sphere Viewer --&gt;
&lt;script src="sphere-viewer.js" data-use-window-data="myFeatrixData"&gt;&lt;/script&gt;
                </div>
                
                <p style="text-align: center; margin-top: 20px;">
                    <strong>That's it!</strong> Your 3D visualization will appear automatically. 
                    <a href="demo.html" style="color: #059669; font-weight: 600;">See it in action →</a>
                </p>
            </div>
        </div>
    </div>

    <div class="footer">
        <div class="container">
            <h3 style="color: #10b981; margin-bottom: 20px;">Ready to Transform Your Data?</h3>
            <p style="font-size: 1.1rem; margin-bottom: 30px;">
                Join thousands of organizations using Featrix to unlock insights from their data.
            </p>
            
            <div class="footer-links">
                <a href="https://featrix.ai" target="_blank">🌐 Featrix Platform</a>
                <a href="mailto:hello@featrix.ai">✉️ Contact Sales</a>
                <a href="https://github.com/Featrix/sphereviewer" target="_blank">📚 GitHub</a>
                <a href="demo.html">🎯 Live Demo</a>
                <a href="README_USAGE.md">📖 Documentation</a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #374151; margin: 40px 0 20px;">
            <p style="color: #9ca3af;">
                © 2024 Featrix. Professional data visualization solutions.<br>
                <a href="https://featrix.ai" style="color: #10b981;">featrix.ai</a> | 
                Built with ❤️ for the data community
            </p>
        </div>
    </div>
</body>
</html>
EOF

scp /tmp/sv-index.html $HOST:$REMOTE_PATH/index.html
rm /tmp/sv-index.html
print_success "Branded public landing page created"

# Copy demo as separate file
print_status "Copying demo and test files..."
scp data-driven-test.html $HOST:$REMOTE_PATH/demo.html  # Demo as separate file
scp simple-test.html $HOST:$REMOTE_PATH/
scp test-new-naming.html $HOST:$REMOTE_PATH/
print_success "Demo files deployed"

# Set proper permissions
print_status "Setting file permissions..."
ssh $HOST "find $REMOTE_PATH -type f -exec chmod 644 {} \; && find $REMOTE_PATH -type d -exec chmod 755 {} \;"
print_success "Permissions set"

# Display deployment summary
echo ""
echo "🎯 ==============================================="
print_success "FeatrixSphereViewer Successfully Deployed!"
echo "🎯 ==============================================="
echo ""
print_status "Deployed to: $HOST:$REMOTE_PATH"
print_status "Files deployed:"
echo "  📦 sphere-viewer.js (573KB) - Main embeddable component"
echo "  📄 example-featrix-data.json - Sample data"
echo "  🌐 index.html - Branded public landing page"
echo "  🎯 demo.html - Complete data-driven demo"
echo "  ⚡ simple-test.html - Basic test"
echo "  🏷️ test-new-naming.html - Naming verification"
echo "  📚 Documentation files"
echo ""
print_status "Access URLs:"
echo "  🌐 Public Landing: http://$HOST/sv/"
echo "  🎯 Live Demo: http://$HOST/sv/demo.html"
echo "  ⚡ Simple Test: http://$HOST/sv/simple-test.html"
echo ""
print_success "Deployment complete! FeatrixSphereViewer is now live! 🚀" 