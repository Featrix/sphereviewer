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
| `width` | string | `'100%'` | Container width (e.g. `'100%'`, `'800px'`) |
| `height` | string | `'500px'` | Container height (e.g. `'100vh'`, `'600px'`) |
| `isRotating` | boolean | `true` | Enable automatic rotation |
| `rotationSpeed` | number | `0.1` | Rotation speed (radians/sec) |
| `pointSize` | number | `0.05` | Size of data points |
| `pointOpacity` | number | `0.5` | Transparency of points |
| `pointAlpha` | number | `0.5` | Default alpha/opacity for points (0–1) |
| `animateClusters` | boolean | `false` | Enable cluster animations |
| `authToken` | string | `undefined` | JWT bearer token for authenticated API requests |
| `mode` | string | `'full'` | Display mode: `'full'` or `'thumbnail'` (Canvas2D only, no UI controls) |
| `theme` | string | `'dark'` | Color theme: `'dark'` or `'light'` |
| `backgroundColor` | string | `undefined` | Custom background color for the sphere area |
| `colormap` | string | `undefined` | Matplotlib colormap name for cluster colors (e.g. `'viridis'`, `'tab10'`, `'plasma'`) |
| `dataEndpoint` | string | `undefined` | Custom data endpoint URL (overrides default epoch_projections URL) |
| `onSphereReady` | function | `undefined` | Callback when sphere is initialized: `(sphereRef) => void` |
| `onMaximize` | function | `undefined` | Callback when maximize button is clicked in thumbnail mode: `(sessionId?) => void`. If not provided, defaults to browser fullscreen. |

## 🎬 Using with Other Data Sources

The Sphere Viewer works with **any 3D point data** — not just Featrix exports. You can animate your own training processes, visualize time-series 3D data, or display any animated 3D point cloud.

### Static Sphere (Single Frame)

For a single, non-animated 3D visualization, provide coordinates and optional clustering:

```javascript
const viewer = new FeatrixSphereViewer();
viewer.init({
  data: {
    session: { session_id: "my-analysis", status: "done", done: true },
    coords: [
      { "0": -2.5, "1": 1.3, "2": 0.8, "__featrix_row_id": 0, "__featrix_row_offset": 0,
        scalar_columns: { temperature: 98.6 },
        set_columns: { category: "A" } },
      { "0": 1.2, "1": -0.5, "2": 0.3, "__featrix_row_id": 1, "__featrix_row_offset": 1,
        scalar_columns: { temperature: 72.1 },
        set_columns: { category: "B" } }
      // ... more points
    ],
    entire_cluster_results: {
      "2": { cluster_labels: [0, 1], n_clusters: 2, silhouette_score: 0.75 }
    }
  }
});
```

**Coordinate formats supported:**
- Object with numeric keys: `{ "0": x, "1": y, "2": z }` (standard)
- Object with named keys: `{ "x": x, "y": y, "z": z }`
- Simple arrays: `[x, y, z]`

### Animated Training Movie (Multi-Epoch)

To animate your own training process, dimensionality reduction, or any time-varying 3D data, provide an `epoch_projections` object. Each epoch contains the positions of all points at that timestep — the viewer animates between them as a "training movie."

**Via `dataEndpoint`** (recommended for large datasets):

Point `dataEndpoint` at a URL that returns the epoch projections JSON. The viewer fetches, caches, and plays the animation automatically:

```javascript
viewer.init({
  data: { session: { session_id: "my-training" } },
  dataEndpoint: '/api/my-training/projections',  // Your server endpoint
  colormap: 'viridis',
  pointAlpha: 0.7
});
```

Your endpoint should return:

```json
{
  "epoch_projections": {
    "epoch_1": {
      "coords": [
        { "0": -2.5, "1": 1.3, "2": 0.8, "__featrix_row_offset": 0 },
        { "0": 1.2, "1": -0.5, "2": 0.3, "__featrix_row_offset": 1 }
      ],
      "entire_cluster_results": {
        "3": { "cluster_labels": [0, 1], "n_clusters": 3 }
      }
    },
    "epoch_2": {
      "coords": [
        { "0": -2.4, "1": 1.4, "2": 0.7, "__featrix_row_offset": 0 },
        { "0": 1.3, "1": -0.4, "2": 0.4, "__featrix_row_offset": 1 }
      ]
    },
    "epoch_10": {
      "coords": [
        { "0": -1.8, "1": 1.9, "2": 0.2, "__featrix_row_offset": 0 },
        { "0": 1.8, "1": -0.1, "2": 0.9, "__featrix_row_offset": 1 }
      ]
    }
  },
  "training_metrics": {
    "validation_loss": [
      { "epoch": 1, "value": 2.5 },
      { "epoch": 2, "value": 2.3 },
      { "epoch": 10, "value": 1.1 }
    ]
  }
}
```

**Key rules:**
- Epoch keys must be `"epoch_N"` where N is a number — they are sorted numerically
- All epochs must have the **same number of points** in `coords`
- Use `__featrix_row_offset` to track individual points across epochs (same offset = same point)
- `entire_cluster_results` is optional and typically only on the first or last epoch
- `training_metrics` is optional — if provided, a loss chart overlay appears during playback

### Python: Generate Training Movie Data

```python
import json
import numpy as np
from sklearn.manifold import TSNE

# Your training loop captures embeddings at each epoch
all_epoch_embeddings = {}  # epoch_num -> (N, hidden_dim) array

epoch_projections = {}
for epoch_num, embeddings in all_epoch_embeddings.items():
    # Project to 3D (use same random_state for consistency)
    coords_3d = TSNE(n_components=3, random_state=42).fit_transform(embeddings)

    epoch_projections[f"epoch_{epoch_num}"] = {
        "coords": [
            {
                "0": float(coords_3d[i, 0]),
                "1": float(coords_3d[i, 1]),
                "2": float(coords_3d[i, 2]),
                "__featrix_row_offset": i,
                "scalar_columns": {"label": int(labels[i])}
            }
            for i in range(len(coords_3d))
        ]
    }

# Add cluster results to the final epoch
from sklearn.cluster import KMeans
final_coords = list(all_epoch_embeddings.values())[-1]
km = KMeans(n_clusters=5, random_state=42).fit(final_coords)
last_key = list(epoch_projections.keys())[-1]
epoch_projections[last_key]["entire_cluster_results"] = {
    "5": {
        "cluster_labels": km.labels_.tolist(),
        "n_clusters": 5,
        "algorithm": "kmeans"
    }
}

with open("training_movie.json", "w") as f:
    json.dump({"epoch_projections": epoch_projections}, f)
```

Then serve it or host it as a static file and point `dataEndpoint` at it.

### Use Cases

- **ML Training Convergence** — Watch embeddings organize as your model trains
- **Dimensionality Reduction** — Animate t-SNE/UMAP perplexity sweeps
- **Simulation Playback** — Particle systems, molecular dynamics, agent-based models
- **Time-Series 3D Data** — Sensor grids, weather stations, GPS tracks over time
- **A/B Comparison** — Show before/after as two epochs

> For complete format details, see [TRAINING_MOVIE_JSON_FORMAT.md](TRAINING_MOVIE_JSON_FORMAT.md) and [FEATRIX_DATA_FORMAT.md](FEATRIX_DATA_FORMAT.md).

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

- **Bundle Size**: ~835KB (minified)
- **Gzipped**: ~220KB
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

BSD 4-Clause License - Copyright (c) 2023-2025 Featrix

## 🤝 Support

- 📧 Email: support@featrix.com
- 🐛 Issues: [GitHub Issues](https://github.com/Featrix/sphereviewer/issues)
- 📖 Docs: [Full Documentation](https://github.com/Featrix/sphereviewer)

---

**Made with ❤️ by [Featrix](https://featrix.com)** - Professional ML Data Visualization