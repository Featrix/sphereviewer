# Featrix Sphere Viewer - User Guide

## Overview

The **Featrix Sphere Viewer** is an embeddable 3D data visualization component that transforms your data into an interactive 3D sphere. It works seamlessly with data exported from the Featrix Platform, but can also be used with data from any source when properly formatted.

### Key Features

- 🌟 **Interactive 3D Sphere Visualization** - Smooth WebGL rendering with Three.js
- 🎬 **Training Movie Playback** - Watch ML training convergence in real-time
- 🎯 **Dynamic Clustering** - Live cluster assignment and color coding
- 📱 **Mobile Responsive** - Touch controls and adaptive layouts
- ⚡ **High Performance** - Optimized for large datasets (1000+ points)
- 🔗 **Easy Embedding** - Drop-in script tag or React component
- 🎨 **Customizable** - Configurable colors, animations, and interactions

## Quick Start

### Prerequisites

- A web page where you want to embed the viewer
- Your data in the Featrix format (see Data Format section)
- React 18+ and ReactDOM 18+ (loaded from CDN or your build)

### Method 1: Window Data (Recommended)

**Best for**: Maximum control and performance

```html
<!-- Load React dependencies -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<!-- Set your Featrix data -->
<script>
window.myFeatrixData = {
  session: { session_id: "your-session-id", status: "done", done: true },
  coords: [/* your 3D coordinates */],
  entire_cluster_results: {/* clustering info */}
};
</script>

<!-- Auto-initialize with window data -->
<script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js" 
        data-use-window-data="myFeatrixData"></script>
```

### Method 2: JSON File

**Best for**: Clean separation of data and code

```html
<!-- Load React dependencies -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<!-- Load from JSON file -->
<script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js" 
        data-featrix-data="path/to/your/sphere-data.json"></script>
```

### Method 3: Manual JavaScript API

**Best for**: Dynamic applications and full control

```html
<script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js"></script>
<div id="my-sphere-container"></div>

<script>
// Load your data (from API, localStorage, etc.)
const featrixData = await fetch('/api/my-sphere-data').then(r => r.json());

// Initialize manually
const viewer = new window.FeatrixSphereViewer();
viewer.init({
  data: featrixData,
  containerId: 'my-sphere-container',
  isRotating: true,
  pointSize: 0.05,
  pointOpacity: 0.7
});

// Update with new data
viewer.update({ data: newFeatrixData });

// Cleanup
viewer.destroy();
</script>
```

### Method 4: NPM Package (React/Next.js)

```bash
npm install @featrix/sphere-viewer
```

```tsx
import { FeatrixSphereViewer } from '@featrix/sphere-viewer';

function MyApp({ data }) {
  return (
    <div style={{ height: '600px' }}>
      <FeatrixSphereViewer data={data} />
    </div>
  );
}
```

## Data Format

The Sphere Viewer expects data in the Featrix export format. When you export data from the Featrix Platform, it automatically generates data in this exact format.

### Complete Data Structure

```json
{
  "session": {
    "session_id": "unique-session-id",
    "status": "done",
    "done": true,
    "failed": false,
    "created_at": "2024-07-18T12:00:00Z",
    "metadata": {
      "dataset_name": "Your Dataset",
      "num_rows": 1000,
      "num_columns": 15
    }
  },
  "coords": [
    {
      "0": -2.5,              // X coordinate
      "1": 1.3,               // Y coordinate
      "2": 0.8,               // Z coordinate
      "cluster_pre": 0,       // Cluster assignment
      "__featrix_row_id": 1,
      "__featrix_row_offset": 0,
      "scalar_columns": {
        "age": 25,
        "income": 50000,
        "score": 0.85
      },
      "set_columns": {
        "category": "A",
        "region": "North"
      },
      "string_columns": {
        "name": "John Doe",
        "description": "Sample record"
      }
    }
    // ... more coordinate records
  ],
  "entire_cluster_results": {
    "2": {
      "cluster_labels": [0, 1, 0, 1, 0],
      "silhouette_score": 0.75,
      "n_clusters": 2,
      "algorithm": "kmeans"
    },
    "3": {
      "cluster_labels": [0, 1, 2, 1, 0],
      "silhouette_score": 0.68,
      "n_clusters": 3,
      "algorithm": "kmeans"
    }
    // ... clustering results for different cluster counts
  }
}
```

### Required Fields

- `session` object with `session_id`, `status`, and `done` fields
- `coords` array with at least one coordinate object
- Each coordinate must have `"0"`, `"1"`, `"2"` (X, Y, Z coordinates) and `__featrix_row_id`

### Optional Fields

- `scalar_columns` - Numeric data for tooltips and analysis
- `set_columns` - Categorical data for grouping and filtering
- `string_columns` - Text data for labels and descriptions
- `entire_cluster_results` - Clustering analysis for segmentation
- `cluster_pre` - Pre-assigned cluster for each point

## Configuration Options

### Data Attributes (Auto-initialization)

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-use-window-data` | ✅ | Use data from window object (e.g., `data-use-window-data="myFeatrixData"`) |
| `data-featrix-data` | ✅ | Load data from JSON file (e.g., `data-featrix-data="data/sphere.json"`) |
| `data-session-id` | ⚠️ | Legacy API mode - requires API access (deprecated, use data-driven methods) |
| `data-container-id` | ❌ | Target container ID (default: `sphere-viewer-container`) |
| `data-api-base-url` | ❌ | Custom API endpoint (only needed for `data-session-id` mode) |
| `data-is-rotating` | ❌ | Enable automatic rotation (default: `true`) |
| `data-rotation-speed` | ❌ | Rotation speed in radians/sec (default: `0.1`) |
| `data-point-size` | ❌ | Size of data points (default: `0.05`) |
| `data-point-opacity` | ❌ | Transparency of points (default: `0.5`) |
| `data-animate-clusters` | ❌ | Enable cluster animations (default: `false`) |

### JavaScript API Configuration

```javascript
const viewer = new window.FeatrixSphereViewer();

viewer.init({
  // Data (required - use one of these)
  data: featrixDataObject,           // Direct data object
  sessionId: 'session-id',           // Legacy: Load from API
  
  // Container (optional)
  containerId: 'my-container',       // Default: 'sphere-viewer-container'
  apiBaseUrl: 'https://api.com',     // Only for sessionId mode
  
  // Animation controls (optional)
  isRotating: true,                   // Default: true
  rotationSpeed: 0.1,                 // Default: 0.1
  animateClusters: false,             // Default: false
  
  // Visual controls (optional)
  pointSize: 0.05,                    // Default: 0.05
  pointOpacity: 0.5,                  // Default: 0.5
  
  // Callback (optional)
  onSphereReady: (sphereRef) => {     // Called when sphere is initialized
    console.log('Sphere ready!', sphereRef);
  }
});
```

## API Methods

### Initialization

```javascript
const viewer = new window.FeatrixSphereViewer();
viewer.init(config);
```

### Update Data

```javascript
// Update with new data
viewer.update({ data: newFeatrixData });

// Update to new session (legacy API mode)
viewer.update({ sessionId: 'new-session-id' });
```

### Update Settings

```javascript
// Update animation and visual settings
viewer.updateAnimationSettings({
  isRotating: false,
  rotationSpeed: 0.2,
  pointSize: 0.08,
  pointOpacity: 0.9,
  animateClusters: true
});
```

### Cleanup

```javascript
// Destroy the viewer and clean up resources
viewer.destroy();
```

## Integration Examples

### WordPress

```html
<!-- In your WordPress post/page (HTML mode) -->
<script>
window.wordpressSphereData = <?php echo json_encode($featrix_data); ?>;
</script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js" 
        data-use-window-data="wordpressSphereData"></script>
```

### Static HTML Site

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Data Visualization</title>
</head>
<body>
    <h1>Customer Analysis Results</h1>
    
    <!-- Load React dependencies -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    
    <!-- Load sphere viewer with JSON data -->
    <script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js" 
            data-featrix-data="data/customer-analysis.json"></script>
</body>
</html>
```

### Documentation Sites (GitBook, Notion, etc.)

```html
<div style="height: 500px; border: 1px solid #ddd; border-radius: 8px;">
  <script>
  window.docsSphereData = {
    // Your Featrix data here
  };
  </script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js" 
          data-use-window-data="docsSphereData"></script>
</div>
```

### React/Next.js Application

```tsx
import { FeatrixSphereViewer } from '@featrix/sphere-viewer';

function MyPage({ featrixData }) {
  return (
    <div style={{ height: '600px' }}>
      <FeatrixSphereViewer 
        data={featrixData}
        isRotating={true}
        pointSize={0.05}
        pointOpacity={0.7}
      />
    </div>
  );
}
```

## Training Movies

The Sphere Viewer supports training movie playback for visualizing ML training convergence. Training movie data is automatically loaded when available from the Featrix API.

### Accessing Training Movies

Training movies are available when:
- Using `data-session-id` mode (legacy API mode)
- Your data includes training movie metadata
- The session has completed training with epoch progression data

The training movie shows the evolution of data points through training epochs, displaying the convergence process in a fixed 10-second window with continuous looping.

## Troubleshooting

### Common Issues

1. **"No data provided" error**
   - Ensure your data object has the correct structure
   - Check that `window.yourDataName` exists before the script loads
   - Verify JSON file path is correct and accessible

2. **"React is not defined" error**
   - Load React dependencies before `sphere-viewer.js`
   - Use the correct CDN URLs for React 18+
   - Ensure scripts load in the correct order

3. **Empty or broken visualization**
   - Check browser console for errors
   - Verify your data format matches the required structure
   - Ensure coordinates are valid numbers (not NaN or Infinity)
   - Check that `coords` array is not empty

4. **CORS errors**
   - Use data-driven methods (`data-use-window-data` or `data-featrix-data`) instead of API mode
   - Ensure JSON files are served from the same origin or with proper CORS headers
   - For cross-origin data, use the window data method

### Debug Mode

```javascript
// Enable detailed logging
window.FeatrixSphereViewerDebug = true;

// Check if data loaded correctly
console.log(window.myFeatrixData);

// Test manual initialization
const viewer = new window.FeatrixSphereViewer();
viewer.init({ data: window.myFeatrixData, containerId: 'test' });
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Performance

- **Bundle Size**: ~567KB (minified)
- **Gzipped**: ~180KB
- **Load Time**: <2s on 3G
- **Max Points**: 5000+ (smooth 60fps)

## Best Practices

1. **Optimize Data Size**: Remove unnecessary fields from your Featrix export if file size is a concern
2. **Use Compression**: Serve JSON files with gzip compression
3. **Cache Data**: Store frequently-used datasets in localStorage or IndexedDB
4. **Progressive Loading**: For very large datasets, consider loading in chunks
5. **Error Handling**: Wrap initialization in try-catch blocks for production use
6. **Prefer Data-Driven**: Use `data-use-window-data` or `data-featrix-data` instead of API mode for better performance and offline support

## Getting Help

- 📧 Email: support@featrix.com
- 🐛 Issues: [GitHub Issues](https://github.com/Featrix/sphereviewer/issues)
- 📖 Documentation: See `DEVELOPER_GUIDE.md` for technical details

---

**Made with ❤️ by [Featrix](https://featrix.com)** - Professional ML Data Visualization




