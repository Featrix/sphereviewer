#!/bin/bash
set -e

# Configuration
HOST="bits"
REMOTE_PATH="/var/www/html/sv"
LOCAL_BUILD_DIR="dist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo -e "${GREEN}🚀 Deploying FeatrixSphereViewer to $HOST:$REMOTE_PATH${NC}"

# Check if local files exist
print_status "Checking local files..."
if [ ! -f "$LOCAL_BUILD_DIR/sphere-viewer.js" ]; then
    print_error "sphere-viewer.js not found in $LOCAL_BUILD_DIR. Run 'npm run build' first."
    exit 1
fi

if [ ! -f "example-featrix-data.json" ]; then
    print_error "example-featrix-data.json not found. Please ensure the file exists."
    exit 1
fi

if [ ! -f "public-landing.html" ]; then
    print_error "public-landing.html not found. Please ensure the file exists."
    exit 1
fi

if [ ! -f "data-driven-test.html" ]; then
    print_error "data-driven-test.html not found. Please ensure the file exists."
    exit 1
fi

print_success "Local files verified"

# Create remote directory
print_status "Creating remote directory $REMOTE_PATH on $HOST..."
ssh $HOST "sudo mkdir -p $REMOTE_PATH && sudo chown \$(whoami):\$(whoami) $REMOTE_PATH"
print_success "Remote directory ready"

# Copy main embeddable script
print_status "Copying embeddable script..."
scp $LOCAL_BUILD_DIR/sphere-viewer.js $HOST:$REMOTE_PATH/
print_success "sphere-viewer.js deployed"

# Copy example data and real logistics data
print_status "Copying data files..."
scp example-featrix-data.json $HOST:$REMOTE_PATH/
if [ -f "logistics-featrix-data.json" ]; then
    scp logistics-featrix-data.json $HOST:$REMOTE_PATH/
    print_success "Data files deployed (example + real logistics data)"
else
    print_warning "logistics-featrix-data.json not found, skipping..."
    print_success "Data files deployed (example data only)"
fi

# Copy documentation
print_status "Copying documentation..."
scp README_USAGE.md $HOST:$REMOTE_PATH/
scp FINAL_NAMING_SUMMARY.md $HOST:$REMOTE_PATH/
scp NAMING_UPDATE_SUMMARY.md $HOST:$REMOTE_PATH/
scp FEATRIX_DATA_FORMAT.md $HOST:$REMOTE_PATH/
scp GENERAL_PURPOSE_USAGE.md $HOST:$REMOTE_PATH/
scp DEPLOYMENT_GUIDE.md $HOST:$REMOTE_PATH/
print_success "Documentation deployed"

# Copy public-facing branded landing page
print_status "Copying branded public landing page..."
scp public-landing.html $HOST:$REMOTE_PATH/index.html
print_success "Branded public landing page deployed"

# Copy demo and test files
print_status "Copying demo and test files..."
scp data-driven-test.html $HOST:$REMOTE_PATH/demo.html  # Technical demo
if [ -f "logistics-demo.html" ]; then
    scp logistics-demo.html $HOST:$REMOTE_PATH/logistics-demo.html  # Clean logistics demo
fi
if [ -f "simple-test.html" ]; then
    scp simple-test.html $HOST:$REMOTE_PATH/
fi
if [ -f "test-new-naming.html" ]; then
    scp test-new-naming.html $HOST:$REMOTE_PATH/
fi
print_success "Demo files deployed"

# Set proper permissions
print_status "Setting file permissions..."
ssh $HOST "find $REMOTE_PATH -type f -exec chmod 644 {} \; && find $REMOTE_PATH -type d -exec chmod 755 {} \;"
print_success "Permissions set"

echo ""
echo -e "${GREEN}🎯 ===============================================${NC}"
echo -e "${GREEN}[SUCCESS] FeatrixSphereViewer Successfully Deployed!${NC}"
echo -e "${GREEN}🎯 ===============================================${NC}"
echo ""
echo -e "${BLUE}[INFO]${NC} Deployed to: $HOST:$REMOTE_PATH"
echo -e "${BLUE}[INFO]${NC} Files deployed:"
echo -e "  📦 sphere-viewer.js ($(du -h $LOCAL_BUILD_DIR/sphere-viewer.js | cut -f1)) - Main embeddable component"
echo -e "  📄 example-featrix-data.json - Sample data"
echo -e "  🚛 logistics-featrix-data.json - Real logistics dataset (2000 companies)"
echo -e "  🌐 index.html - Branded public landing page"
echo -e "  🚛 logistics-demo.html - Professional logistics demo"
echo -e "  🎯 demo.html - Technical demo with multiple methods"
echo -e "  ⚡ simple-test.html - Basic test"
echo -e "  🏷️ test-new-naming.html - Naming verification"
echo -e "  📚 Documentation files"
echo ""
echo -e "${BLUE}[INFO]${NC} Access URLs:"
echo -e "  🌐 Public Landing: http://$HOST/sv/"
echo -e "  🚛 Logistics Demo: http://$HOST/sv/logistics-demo.html"
echo -e "  🎯 Technical Demo: http://$HOST/sv/demo.html"
echo -e "  ⚡ Simple Test: http://$HOST/sv/simple-test.html"
echo ""
echo -e "${GREEN}[SUCCESS] Deployment complete! FeatrixSphereViewer is now live! 🚀${NC}" 