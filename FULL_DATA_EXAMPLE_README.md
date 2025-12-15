# 🧪 Full Data Example - Interactive Test Environment

A complete test environment for the Featrix Sphere Viewer that demonstrates:
- Loading data from external APIs
- Encoding data with Featrix API
- Dynamically adding points to the sphere
- Mouseover tooltips showing original data
- Cluster color management

## 🚀 Quick Start

### Option 1: Use the Setup Script (Recommended)

```bash
./run-full-data-example.sh
```

The script will:
- ✅ Check Python installation
- ✅ Install Flask dependencies
- ✅ Build sphere viewer (if Node.js available)
- ✅ Start the server

### Option 2: Manual Setup

```bash
# Install Python dependencies
pip install flask flask-cors requests

# Build the sphere viewer
npm run build:embed

# Start the server
python3 full-data-example-server.py
```

## 📋 Features

### 1. External API Integration
- Fetch data from any external API
- Handles CORS automatically via proxy
- Supports GET, POST, PUT, DELETE methods

### 2. Featrix Session Loading
- Enter a Featrix Session ID
- Automatically loads:
  - Session metadata
  - Final projections (3D coordinates + cluster results)
  - Training movie data (if available)
- Initializes sphere viewer with loaded data

### 3. Dynamic Point Encoding
- Encode new data points using Featrix API
- Add encoded points to the sphere in real-time
- Points appear with original data preserved

### 4. Mouseover Tooltips
- Hover over points to see:
  - Record ID
  - Cluster assignment
  - 3D coordinates
  - All original data fields

### 5. Cluster Color Management
- View available cluster counts from loaded session
- Set custom colors for each cluster
- Colors apply to all points in that cluster

## 🔧 Configuration

### Default Featrix Session

The HTML file includes a default session ID: `public-alphafreight-xxlarge-derived1-375e6c5d-985d-4ef6-9728-fadc2c82e06f`

To use a different session:
1. Enter your session ID in the "Featrix Session ID" field
2. Click "📥 Load Session Data"
3. The sphere will populate with your data

### API Endpoints

The Flask server provides:

- `GET /` - Serves interactive-test.html
- `GET /proxy/external?url=<api_url>` - Proxy external API calls
- `POST /proxy/external?url=<api_url>` - Proxy POST requests
- `GET /proxy/featrix/<endpoint>` - Proxy Featrix API calls
- `POST /proxy/featrix/<endpoint>` - Proxy Featrix POST requests
- `GET /api/example-data?type=user` - Example data endpoint
- `GET /api/batch-example?count=5` - Batch example data
- `GET /api/health` - Health check

### Featrix API Endpoints Used

- `GET /compute/session/{session_id}` - Session metadata
- `GET /compute/session/{session_id}/projections` - Final sphere data
- `GET /compute/session/{session_id}/epoch_projections` - Training movie
- `POST /compute/session/{session_id}/encode_records` - Encode new points

## 📝 Usage Workflow

1. **Load a Featrix Session**
   - Enter session ID (default: `public-alphafreight-xxlarge-derived1-375e6c5d-985d-4ef6-9728-fadc2c82e06f`)
   - Click "📥 Load Session Data"
   - Sphere populates with your data

2. **Fetch External Data** (Optional)
   - Enter API URL (e.g., `https://jsonplaceholder.typicode.com/users/1`)
   - Click "📡 Fetch External Data"
   - Data appears in "Data to Encode" field

3. **Encode and Add Point**
   - Enter JSON data in "Data to Encode" field
   - Click "🔮 Encode with Featrix"
   - Point appears on sphere with original data

4. **View Point Details**
   - Hover over any point to see tooltip
   - Tooltip shows all original data fields
   - Click points to select them

5. **Customize Cluster Colors**
   - Select cluster count from dropdown
   - Use color pickers to set cluster colors
   - Colors apply immediately

## 🐛 Troubleshooting

### "Sphere viewer not initialized"
- Make sure you've run `npm run build:embed`
- Check that `sphere-viewer.js` exists in the project root
- Verify browser console for errors

### "Session not found"
- Verify the session ID is correct
- Check that the session has completed processing
- Ensure Featrix API is accessible

### "CORS error"
- The Flask server proxies requests to avoid CORS
- If direct API calls fail, they'll use the proxy automatically
- Check server logs for proxy errors

### Port 8080 in use
The server automatically kills existing processes on port 8080. If it fails:
```bash
# Manual cleanup
sudo lsof -ti:8080 | xargs kill -9
```

## 📚 Files

- `interactive-test.html` - Main test interface
- `full-data-example-server.py` - Flask server
- `sphere-viewer.js` - Built sphere viewer (from `npm run build:embed`)

## 🎯 Example Session IDs

- `public-alphafreight-xxlarge-derived1-375e6c5d-985d-4ef6-9728-fadc2c82e06f` - Logistics dataset with training movie
- (Add your own session IDs here)

## 🔗 Related Documentation

- `FEATRIX_DATA_FORMAT.md` - Data format specification
- `README_USAGE.md` - General usage guide
- `QUICK_START.md` - Quick start guide

