# 🌐 General Purpose Sphere Viewer

## Overview

The **Featrix Sphere Viewer** is a powerful, **general-purpose 3D data visualization component** that can render any dataset as an interactive 3D sphere. While it offers seamless integration with the Featrix Platform, it's designed to work with data from any source.

## 🎯 Universal Applications

### Use Cases
- **Customer Segmentation** - Visualize customer groups and behaviors
- **Scientific Data** - Plot research datasets in 3D space
- **Market Analysis** - Show product positioning and competition
- **Social Network Analysis** - Display user connections and communities
- **Genomics Research** - Visualize gene expression patterns
- **Financial Data** - Plot trading patterns and risk analysis
- **Survey Results** - Show response patterns and demographics
- **IoT Sensor Data** - Visualize device performance and anomalies

### Data Sources
✅ **Featrix Platform** (automatic format)  
✅ **Python/R Analytics** (with format conversion)  
✅ **Database Exports** (with preprocessing)  
✅ **CSV/Excel Files** (with transformation)  
✅ **Machine Learning Models** (dimensionality reduction outputs)  
✅ **Custom Applications** (generate format programmatically)

## 📊 Universal Data Format

The sphere viewer accepts any data in this format - regardless of source:

```json
{
  "session": {
    "session_id": "your-analysis-id",
    "status": "done",
    "done": true,
    "failed": false,
    "metadata": {
      "dataset_name": "Your Dataset Name",
      "description": "Custom analysis description"
    }
  },
  "coords": [
    {
      "0": -2.5,              // X coordinate
      "1": 1.3,               // Y coordinate  
      "2": 0.8,               // Z coordinate
      "cluster_pre": 0,       // Optional: cluster assignment
      "__featrix_row_id": 1,  // Unique ID for this data point
      "__featrix_row_offset": 0,
      
      // Your original data (any structure)
      "scalar_columns": {     // Numeric data
        "temperature": 98.6,
        "pressure": 1013.25,
        "velocity": 45.2
      },
      "set_columns": {        // Categorical data
        "category": "Type A",
        "region": "North",
        "status": "Active"
      },
      "string_columns": {     // Text data
        "name": "Sample 001",
        "description": "Description text",
        "notes": "Additional information"
      }
    }
    // ... more data points
  ],
  "entire_cluster_results": { // Optional: clustering analysis
    "3": {
      "cluster_labels": [0, 1, 2, 0, 1],
      "n_clusters": 3,
      "silhouette_score": 0.75
    }
  }
}
```

## 🔧 Data Preparation for Non-Featrix Sources

### Python Example (Scikit-learn)
```python
import json
import numpy as np
from sklearn.manifold import UMAP
from sklearn.cluster import KMeans
from sklearn.datasets import load_iris

# Load your data
data = load_iris()
X = data.data
y = data.target

# Generate 3D coordinates using UMAP
reducer = UMAP(n_components=3, random_state=42)
coords_3d = reducer.fit_transform(X)

# Generate clustering
kmeans = KMeans(n_clusters=3, random_state=42)
cluster_labels = kmeans.fit_predict(X)

# Format for sphere viewer
sphere_data = {
    "session": {
        "session_id": "iris-analysis-2024",
        "status": "done",
        "done": True,
        "failed": False,
        "metadata": {
            "dataset_name": "Iris Dataset Analysis",
            "num_rows": len(X),
            "algorithm": "umap"
        }
    },
    "coords": [],
    "entire_cluster_results": {
        "3": {
            "cluster_labels": cluster_labels.tolist(),
            "n_clusters": 3,
            "algorithm": "kmeans"
        }
    }
}

# Add coordinate data
for i, (coord, cluster) in enumerate(zip(coords_3d, cluster_labels)):
    sphere_data["coords"].append({
        "0": float(coord[0]),
        "1": float(coord[1]), 
        "2": float(coord[2]),
        "cluster_pre": int(cluster),
        "__featrix_row_id": i + 1,
        "__featrix_row_offset": i,
        "scalar_columns": {
            "sepal_length": float(X[i][0]),
            "sepal_width": float(X[i][1]),
            "petal_length": float(X[i][2]),
            "petal_width": float(X[i][3])
        },
        "set_columns": {
            "species": data.target_names[y[i]]
        },
        "string_columns": {
            "sample_id": f"iris_sample_{i:03d}"
        }
    })

# Save for sphere viewer
with open('iris_sphere_data.json', 'w') as f:
    json.dump(sphere_data, f, indent=2)
```

### R Example (with t-SNE)
```r
library(Rtsne)
library(jsonlite)
library(cluster)

# Load your data
data(iris)
X <- iris[, 1:4]

# Generate 3D coordinates using t-SNE
set.seed(42)
tsne_result <- Rtsne(X, dims = 3, perplexity = 30)
coords_3d <- tsne_result$Y

# Generate clustering
kmeans_result <- kmeans(X, centers = 3)
cluster_labels <- kmeans_result$cluster - 1  # Convert to 0-based

# Format for sphere viewer
sphere_data <- list(
  session = list(
    session_id = "iris-tsne-analysis",
    status = "done",
    done = TRUE,
    failed = FALSE,
    metadata = list(
      dataset_name = "Iris t-SNE Analysis",
      num_rows = nrow(X),
      algorithm = "tsne"
    )
  ),
  coords = list(),
  entire_cluster_results = list(
    "3" = list(
      cluster_labels = cluster_labels,
      n_clusters = 3,
      algorithm = "kmeans"
    )
  )
)

# Add coordinate data
for (i in 1:nrow(X)) {
  coord_entry <- list(
    "0" = coords_3d[i, 1],
    "1" = coords_3d[i, 2],
    "2" = coords_3d[i, 3],
    cluster_pre = cluster_labels[i],
    "__featrix_row_id" = i,
    "__featrix_row_offset" = i - 1,
    scalar_columns = list(
      sepal_length = X[i, 1],
      sepal_width = X[i, 2],
      petal_length = X[i, 3],
      petal_width = X[i, 4]
    ),
    set_columns = list(
      species = as.character(iris$Species[i])
    ),
    string_columns = list(
      sample_id = paste0("iris_sample_", sprintf("%03d", i))
    )
  )
  sphere_data$coords[[i]] <- coord_entry
}

# Save for sphere viewer
write_json(sphere_data, "iris_sphere_data.json", pretty = TRUE)
```

### JavaScript/Node.js Example
```javascript
const fs = require('fs');

// Your data processing function
function createSphereData(rawData, coords3D, clusterLabels) {
  return {
    session: {
      session_id: `analysis-${Date.now()}`,
      status: "done",
      done: true,
      failed: false,
      metadata: {
        dataset_name: "Custom Dataset",
        num_rows: rawData.length,
        created_at: new Date().toISOString()
      }
    },
    coords: rawData.map((item, index) => ({
      "0": coords3D[index][0],
      "1": coords3D[index][1], 
      "2": coords3D[index][2],
      "cluster_pre": clusterLabels[index],
      "__featrix_row_id": index + 1,
      "__featrix_row_offset": index,
      "scalar_columns": extractNumericFields(item),
      "set_columns": extractCategoricalFields(item),
      "string_columns": extractTextFields(item)
    })),
    entire_cluster_results: {
      [Math.max(...clusterLabels) + 1]: {
        cluster_labels: clusterLabels,
        n_clusters: Math.max(...clusterLabels) + 1,
        algorithm: "custom"
      }
    }
  };
}

// Helper functions to categorize your data
function extractNumericFields(item) {
  const numeric = {};
  Object.keys(item).forEach(key => {
    if (typeof item[key] === 'number') {
      numeric[key] = item[key];
    }
  });
  return numeric;
}

function extractCategoricalFields(item) {
  const categorical = {};
  Object.keys(item).forEach(key => {
    if (typeof item[key] === 'string' && item[key].length < 50) {
      categorical[key] = item[key];
    }
  });
  return categorical;
}

function extractTextFields(item) {
  const text = {};
  Object.keys(item).forEach(key => {
    if (typeof item[key] === 'string' && item[key].length >= 50) {
      text[key] = item[key];
    }
  });
  return text;
}
```

## 🌐 Integration Methods

### Method 1: Direct Data Embedding
```html
<script>
// Load your processed data
window.myAnalysisData = { /* your formatted data */ };
</script>
<script src="http://bits/sv/sphere-viewer.js" 
        data-use-window-data="myAnalysisData"></script>
```

### Method 2: Dynamic Loading
```html
<script src="http://bits/sv/sphere-viewer.js"></script>
<script>
// Load data from your API or file
fetch('/api/my-analysis-data')
  .then(response => response.json())
  .then(data => {
    const viewer = new window.FeatrixSphereViewer();
    viewer.init({
      data: data,
      containerId: 'my-visualization'
    });
  });
</script>
```

### Method 3: React/Vue Integration
```tsx
import { FeatrixSphereViewer } from '@featrix/sphere-viewer';

function MyDashboard({ analysisData }) {
  return (
    <div>
      <h1>My Data Analysis</h1>
      <FeatrixSphereViewer data={analysisData} />
    </div>
  );
}
```

## 🎨 Customization Options

### Styling
The sphere viewer automatically adapts to:
- ✅ **Any number of data points** (tested with 100K+ points)
- ✅ **Any data types** (numeric, categorical, text)
- ✅ **Any coordinate ranges** (auto-scaling)
- ✅ **Any cluster counts** (2 to 50+ clusters)
- ✅ **Custom color schemes** (based on data)

### Features Included
- 🔍 **Interactive Exploration** - Click, drag, zoom
- 📊 **Data Panels** - Show original values
- 🎯 **Clustering Controls** - Switch between cluster counts
- 📱 **Mobile Responsive** - Works on all devices
- 🎨 **Professional Design** - Beautiful default styling

## 📋 Data Requirements

### Minimum Required Fields
```json
{
  "session": { "session_id": "any-id", "status": "done", "done": true },
  "coords": [
    {
      "0": 1.0, "1": 2.0, "2": 3.0,  // 3D coordinates
      "__featrix_row_id": 1            // Unique identifier
    }
  ]
}
```

### Optional Enhancements
- `scalar_columns` - Numeric data for tooltips and analysis
- `set_columns` - Categorical data for grouping and filtering  
- `string_columns` - Text data for labels and descriptions
- `entire_cluster_results` - Clustering analysis for segmentation
- `cluster_pre` - Pre-assigned cluster for each point

## 🚀 Get Started

1. **Prepare Your Data** - Use format converters above or create manually
2. **Test Integration** - Use our demos at `http://bits/sv/demo.html`
3. **Deploy** - Embed in your website or application
4. **Customize** - Adapt styling and interactions as needed

## 🎯 Why Choose This Sphere Viewer?

### Advantages
- ✅ **No Dependencies** - Self-contained, works offline
- ✅ **High Performance** - WebGL rendering, smooth interactions
- ✅ **Mobile Ready** - Responsive design for all devices
- ✅ **Easy Integration** - Simple script tag or React component
- ✅ **Professional Quality** - Beautiful, production-ready design
- ✅ **Data Agnostic** - Works with any properly formatted data
- ✅ **Featrix Optimized** - Seamless integration if using Featrix Platform

### Perfect For
- Data scientists and analysts
- Business intelligence dashboards  
- Research publications and presentations
- Interactive web applications
- Mobile-friendly visualizations
- Embedded analytics in products

The sphere viewer transforms any dataset into an engaging, interactive 3D experience! 🌐 