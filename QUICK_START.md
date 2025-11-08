# 🚀 Quick Start Guide - Stand Up Demo App in 60 Seconds

## Prerequisites
- Node.js installed
- Python 3 (for the server)

## Step 1: Build the Embeddable Component

```bash
npm install
npm run build:embed
```

This creates `sphere-viewer.js` in the root directory.

## Step 2: Choose Your Demo HTML File

You have several example HTML files to choose from:

### Option A: **Simple Test** (Fastest)
```bash
# Use simple-test.html - minimal example
python3 no-cache-server.py 8080
# Open http://localhost:8080/simple-test.html
```

### Option B: **Data-Driven Demo** (Recommended)
```bash
# Use data-driven-test.html - shows all integration methods
python3 no-cache-server.py 8080
# Open http://localhost:8080/data-driven-test.html
```

### Option C: **Embed Test** (Full Featured)
```bash
# Use embed-test.html - comprehensive testing
python3 no-cache-server.py 8080
# Open http://localhost:8080/embed-test.html
```

## Step 3: Add Your Featrix Data

### Method 1: Window Data (Easiest)
Edit your HTML file and add your data:

```html
<script>
window.myFeatrixData = {
  session: { session_id: "your-session-id", status: "done", done: true },
  coords: [/* your coordinates */],
  entire_cluster_results: {/* clustering data */}
};
</script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="sphere-viewer.js" data-use-window-data="myFeatrixData"></script>
```

### Method 2: JSON File
Save your Featrix export as `my-data.json` in the same directory:

```html
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="sphere-viewer.js" data-featrix-data="my-data.json"></script>
```

### Method 3: JavaScript API
```html
<div id="my-sphere-container"></div>
<script src="sphere-viewer.js"></script>
<script>
const viewer = new window.FeatrixSphereViewer();
viewer.init({
  data: yourFeatrixDataObject,
  containerId: 'my-sphere-container'
});
</script>
```

## Complete Minimal Example

Create `demo.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Sphere Viewer Demo</title>
    <style>
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        #sphere-container { height: 600px; border: 2px solid #ddd; border-radius: 8px; }
    </style>
</head>
<body>
    <h1>🌐 Featrix Sphere Viewer Demo</h1>
    <div id="sphere-container"></div>

    <!-- Load React dependencies -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

    <!-- Your Featrix data -->
    <script>
    window.myData = {
        session: {
            session_id: "your-session-id",
            status: "done",
            done: true
        },
        coords: [
            {
                "0": -2.5, "1": 1.3, "2": 0.8,
                "__featrix_row_id": 1,
                "cluster_pre": 0
            }
            // ... more points
        ],
        entire_cluster_results: {
            "2": { "cluster_labels": [0, 1], "silhouette_score": 0.75, "n_clusters": 2 }
        }
    };
    </script>

    <!-- Load sphere viewer -->
    <script src="sphere-viewer.js" data-use-window-data="myData" data-container-id="sphere-container"></script>
</body>
</html>
```

## Run It

```bash
# Start the server (kills any existing instances on port 8080)
python3 no-cache-server.py 8080

# Open in browser
open http://localhost:8080/demo.html
```

## Troubleshooting

### "SphereViewer not found"
- Make sure you ran `npm run build:embed`
- Check that `sphere-viewer.js` exists in the root directory
- Verify the script tag loads before your initialization code

### "No data provided"
- Check your data object structure matches the format
- Verify `window.myData` exists before the script loads
- Check browser console for errors

### Port 8080 in use
The `no-cache-server.py` automatically kills existing processes, but if it fails:
```bash
# Manual cleanup
sudo lsof -ti:8080 | xargs kill -9
# Or
sudo fuser -k 8080/tcp
```

## Available Example Files

- `simple-test.html` - Minimal example
- `data-driven-test.html` - Shows all integration methods with sample data
- `embed-test.html` - Comprehensive testing suite
- `demo.html` - Basic demo page
- `training-movie-demo.html` - Training movie visualization

## Next Steps

1. Replace sample data with your real Featrix export
2. Customize styling and container size
3. Add controls and interactivity
4. Deploy to your website

For more details, see:
- `FEATRIX_DATA_FORMAT.md` - Complete data format specification
- `README_USAGE.md` - Full usage guide
- `EMBED_README.md` - Embedding instructions

