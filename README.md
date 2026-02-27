# @featrix/sphere-viewer

🌐 **Professional 3D Data Visualization Component**

An embeddable, high-performance 3D sphere visualization component for data exploration and analysis. Features interactive WebGL rendering, dynamic clustering, and training movie playback.

## ✨ Features

- 🌟 **Interactive 3D Sphere Visualization** - Smooth WebGL rendering with Three.js
- 🎬 **Training Movie Playback** - Watch ML training convergence in real-time
- 🎯 **Dynamic Clustering** - Live cluster assignment and color coding
- 📱 **Mobile Responsive** - Touch controls and adaptive layouts
- ⚡ **High Performance** - Optimized for large datasets (1000+ points)
- 🔗 **Easy Embedding** - Drop-in script tag or React component
- 🎨 **Customizable** - Configurable colors, animations, and interactions
- 🔒 **JWT Authentication** - Pass bearer tokens for authenticated API access
- 🖥️ **Canvas2D Fallback** - Automatic software rendering when WebGL is unavailable
- 📸 **Thumbnail Mode** - Lightweight Canvas2D-only mode for grids of viewers

## 🚀 Quick Start

### Method 1: Script Tag (Recommended)

```html
<!-- Load React dependencies -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<!-- Embed sphere viewer -->
<script>
window.myData = {
  session: { session_id: "your-session-id", status: "done", done: true },
  coords: [/* your 3D coordinates */],
  entire_cluster_results: {/* clustering data */}
};
</script>
<script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js" 
        data-use-window-data="myData"></script>
```

### Method 2: JavaScript API

```html
<script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js"></script>
<div id="sphere-container"></div>

<script>
const viewer = new window.FeatrixSphereViewer();
viewer.init({
  data: yourDataObject,
  containerId: 'sphere-container',
  isRotating: true,
  pointSize: 0.05,
  pointOpacity: 0.7
});
</script>
```

### Method 3: NPM Install

```bash
npm install @featrix/sphere-viewer
```

## 📊 Data Format

Your data should follow this structure:

```javascript
{
  session: {
    session_id: "unique-session-id",
    status: "done", 
    done: true
  },
  coords: [
    {
      __featrix_row_id: 0,
      __featrix_row_offset: 0,
      cluster_pre: 2,
      scalar_columns: { "feature1": 1.5, "feature2": 2.3 },
      set_columns: { "category": "A", "type": "premium" }
    }
    // ... more data points
  ],
  entire_cluster_results: {
    "12": {
      cluster_labels: [2, 1, 0, 2, 1, ...] // cluster assignment per point
    }
  }
}
```

## ⚙️ Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `data` | Object | required | Your formatted data object |
| `containerId` | string | `'sphere-viewer-container'` | Target DOM element ID |
| `isRotating` | boolean | `true` | Enable automatic rotation |
| `rotationSpeed` | number | `0.1` | Rotation speed (radians/sec) |
| `pointSize` | number | `0.05` | Size of data points |
| `pointOpacity` | number | `0.5` | Transparency of points |
| `animateClusters` | boolean | `false` | Enable cluster animations |
| `authToken` | string | `undefined` | JWT bearer token for authenticated API requests |
| `mode` | string | `'full'` | Display mode: `'full'` or `'thumbnail'` (Canvas2D only, no UI controls) |

## 🎬 Training Movies

For ML training visualization, provide epoch progression data:

```javascript
const trainingData = {
  "epoch_1": { coords: [[x1,y1,z1], [x2,y2,z2], ...] },
  "epoch_2": { coords: [[x1,y1,z1], [x2,y2,z2], ...] },
  // ... more epochs
};

viewer.init({
  data: {
    session: { session_id: "training-session" },
    trainingMovieData: trainingData
  }
});
```

## 🎨 Advanced Features

### Dynamic Point Sizing
```javascript
viewer.updateAnimationSettings({
  pointSize: 0.08,
  pointOpacity: 0.9
});
```

### Cluster Spotlight
```javascript
viewer.sphereRef.spotlightCluster = 2; // Highlight cluster 2
```

### Memory Trails
```javascript
viewer.sphereRef.showDynamicPoints = true;
viewer.sphereRef.memoryTrailLength = 10;
```

## 🔧 API Methods

```javascript
const viewer = new FeatrixSphereViewer();

// Initialize
viewer.init(config);

// Update data
viewer.update({ data: newData });

// Update settings
viewer.updateAnimationSettings({
  isRotating: false,
  pointSize: 0.1
});

// Cleanup
viewer.destroy();
```

## 📱 Mobile Support

- ✅ Touch gestures (pinch to zoom, drag to rotate)
- ✅ Responsive layouts
- ✅ Optimized rendering for mobile GPUs
- ✅ Adaptive point sizes and UI elements

## 🌐 Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

Browsers without WebGL support (or with GPU crashes) automatically fall back to Canvas2D software rendering.

## 📈 Performance

- **Bundle Size**: 567KB (minified)
- **Gzipped**: ~180KB 
- **Load Time**: <2s on 3G
- **Max Points**: 5000+ (smooth 60fps)

## 🛠️ Development

```bash
git clone https://github.com/Featrix/sphereviewer.git
cd sphereviewer
npm install
npm run build:embed  # Build embeddable version
npm run dev          # Development server
```

## 📄 License

MIT License - Copyright (c) 2024-2025 Featrix

## 🤝 Support

- 📧 Email: support@featrix.com
- 🐛 Issues: [GitHub Issues](https://github.com/Featrix/sphereviewer/issues)
- 📖 Docs: [Full Documentation](https://github.com/Featrix/sphereviewer)

---

**Made with ❤️ by [Featrix](https://featrix.com)** - Professional ML Data Visualization