#!/bin/bash
# Full Data Example - Setup and Run Script
# Installs dependencies and starts the Flask server

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Python
check_python() {
    print_info "Checking Python installation..."
    
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
        print_success "Python 3 found: $PYTHON_VERSION"
        PYTHON_CMD="python3"
    elif command_exists python; then
        PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
        if python -c "import sys; exit(0 if sys.version_info >= (3, 6) else 1)"; then
            print_success "Python found: $PYTHON_VERSION"
            PYTHON_CMD="python"
        else
            print_error "Python 3.6+ required. Found: $PYTHON_VERSION"
            exit 1
        fi
    else
        print_error "Python 3 not found. Please install Python 3.6+"
        exit 1
    fi
}

# Check pip
check_pip() {
    print_info "Checking pip installation..."
    
    if command_exists pip3; then
        PIP_CMD="pip3"
        print_success "pip3 found"
    elif command_exists pip; then
        PIP_CMD="pip"
        print_success "pip found"
    else
        print_error "pip not found. Installing pip..."
        $PYTHON_CMD -m ensurepip --upgrade
        PIP_CMD="$PYTHON_CMD -m pip"
    fi
}

# Install Python dependencies
install_python_deps() {
    print_header "Installing Python Dependencies"
    
    print_info "Installing Flask, flask-cors, and requests..."
    
    $PIP_CMD install --quiet --upgrade flask flask-cors requests 2>/dev/null || {
        print_warning "pip install failed, trying without --quiet..."
        $PIP_CMD install --upgrade flask flask-cors requests
    }
    
    print_success "Python dependencies installed"
}

# Check Node.js and npm
check_node() {
    print_info "Checking Node.js installation..."
    
    if command_exists node; then
        NODE_VERSION=$(node --version)
        print_success "Node.js found: $NODE_VERSION"
    else
        print_warning "Node.js not found. Skipping sphere-viewer build."
        print_warning "You'll need to build manually: npm run build:embed"
        return 1
    fi
    
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        print_success "npm found: $NPM_VERSION"
    else
        print_warning "npm not found. Skipping sphere-viewer build."
        return 1
    fi
    
    return 0
}

# Build sphere viewer
build_sphere_viewer() {
    print_header "Building Sphere Viewer"
    
    if ! check_node; then
        print_warning "Skipping build (Node.js/npm not available)"
        return
    fi
    
    if [ ! -f "package.json" ]; then
        print_warning "package.json not found. Skipping build."
        return
    fi
    
    print_info "Installing npm dependencies..."
    if npm install --silent 2>/dev/null || npm install; then
        print_success "npm dependencies installed"
    else
        print_warning "npm install failed. Continuing anyway..."
    fi
    
    print_info "Building embeddable sphere viewer..."
    if npm run build:embed 2>/dev/null || npm run build:embed; then
        if [ -f "sphere-viewer.js" ]; then
            print_success "sphere-viewer.js built successfully"
        else
            print_warning "Build completed but sphere-viewer.js not found"
        fi
    else
        print_warning "Build failed. You may need to build manually."
    fi
}

# Check if files exist
check_files() {
    print_header "Checking Required Files"
    
    local missing_files=()
    
    if [ ! -f "full-data-example-server.py" ]; then
        missing_files+=("full-data-example-server.py")
    fi
    
    if [ ! -f "interactive-test.html" ]; then
        missing_files+=("interactive-test.html")
    fi
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        print_error "Missing required files:"
        for file in "${missing_files[@]}"; do
            echo "  - $file"
        done
        exit 1
    fi
    
    print_success "All required files found"
    
    if [ ! -f "sphere-viewer.js" ]; then
        print_warning "sphere-viewer.js not found. The app may not work without it."
        print_info "Run: npm run build:embed"
    fi
}

# Kill existing server
kill_existing_server() {
    print_info "Checking for existing server on port 8080..."
    
    if command_exists lsof; then
        EXISTING_PID=$(lsof -ti:8080 2>/dev/null || echo "")
        if [ -n "$EXISTING_PID" ]; then
            print_warning "Killing existing process on port 8080 (PID: $EXISTING_PID)"
            kill -9 $EXISTING_PID 2>/dev/null || true
            sleep 1
        fi
    elif command_exists fuser; then
        if fuser 8080/tcp >/dev/null 2>&1; then
            print_warning "Killing existing process on port 8080"
            fuser -k 8080/tcp 2>/dev/null || true
            sleep 1
        fi
    fi
}

# Start server
start_server() {
    print_header "Starting Flask Server"
    
    kill_existing_server
    
    print_success "Server starting on http://localhost:8080"
    print_info "Press Ctrl+C to stop"
    echo ""
    
    $PYTHON_CMD full-data-example-server.py
}

# Main execution
main() {
    print_header "🧪 Full Data Example - Setup & Run"
    
    # Check prerequisites
    check_python
    check_pip
    
    # Install dependencies
    install_python_deps
    
    # Build sphere viewer (optional)
    build_sphere_viewer
    
    # Check files
    check_files
    
    # Start server
    start_server
}

# Run main function
main "$@"

