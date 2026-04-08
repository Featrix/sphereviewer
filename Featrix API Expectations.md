# Featrix API Expectations — Sphere Viewer

## Endpoints

### 1. `GET /compute/session/{id}/epoch_projections`

Primary data source for the training movie. Returns per-epoch coordinates and cluster assignments.

**Query params:**
- `epoch=last` — return only the final epoch (used for thumbnails)
- `limit` — max points per epoch
- `point_limit` / `point_offset` — row-level pagination (distinct from epoch-level `limit`)

**Expected response:**

```json
{
  "epoch_projections": {
    "epoch_0": {
      "coords": [
        {
          "x": 0.5, "y": -0.3, "z": 0.8,
          "cluster_pre": 3,
          "__featrix_row_id": 42,
          "__featrix_row_offset": 0,
          "scalar_columns": { "revenue": 125000, "employee_count": 47 },
          "set_columns": { "state": "CA", "industry": "logistics" },
          "string_columns": { "company_name": "Acme Freight LLC" }
        }
      ],
      "entire_cluster_results": {
        "3": { "cluster_labels": [0, 1, 2, 0, 1], "score": 0.72 },
        "5": { "cluster_labels": [0, 1, 2, 3, 4], "score": 0.81 },
        "7": { "cluster_labels": [0, 1, 2, 3, 4], "score": 0.85 }
      },
      "total_count": 5000,
      "offset": 0,
      "limit": 1000
    },
    "epoch_1": { "..." : "same structure" }
  }
}
```

### 2. `GET /compute/session/{id}/projections`

Final-frame projection data with full cluster results and source columns.

**Query params:**
- `limit` — max points
- `offset` — row-level pagination offset

**Expected response:**

```json
{
  "projections": {
    "coords": [
      {
        "0": 0.5, "1": -0.3, "2": 0.8,
        "cluster_pre": 3,
        "__featrix_row_id": 42,
        "__featrix_row_offset": 0,
        "scalar_columns": { "revenue": 125000 },
        "set_columns": { "state": "CA" },
        "string_columns": { "company_name": "Acme Freight LLC" }
      }
    ],
    "entire_cluster_results": {
      "3":  { "cluster_labels": [0, 1, 2], "score": 0.72 },
      "5":  { "cluster_labels": [0, 1, 2, 3, 4], "score": 0.81 }
    },
    "total_count": 5000,
    "offset": 0,
    "limit": 1000
  }
}
```

**Note:** `/projections` uses numeric string keys (`"0"`, `"1"`, `"2"`) for coordinates. `/epoch_projections` uses named keys (`"x"`, `"y"`, `"z"`). The viewer handles both.

### 3. `GET /compute/session/{id}/epoch_projections.glb`

Binary GLB format for compact transfer of training movie data. Contains all epoch positions and cluster labels packed as typed arrays.

**Binary layout:**
- Positions: `Float32Array[num_epochs * num_points * 3]`
- Cluster labels: `Uint8Array[num_epochs * num_points]`

**Critical:** Each epoch entry must have valid position data. Do not pad with zero-filled duplicate epochs — the viewer will render them as points at the origin.

### 4. `GET /compute/session/{id}/epoch_projections_meta.json`

JSON sidecar for the GLB binary. Carries metadata that can't be packed into the binary.

**Expected response:**

```json
{
  "featrix_sidecar_version": 1,
  "session_id": "...",
  "session_cluster_results": {
    "3":  { "cluster_labels": [0, 1, 2], "score": 0.72 },
    "5":  { "cluster_labels": [0, 1, 2, 3, 4], "score": 0.81 }
  },
  "point_metadata": {
    "source_data": [
      { "revenue": 125000, "state": "CA", "company_name": "Acme Freight LLC" },
      { "revenue": 89000, "state": "TX", "company_name": "Star Logistics" }
    ]
  },
  "training_metrics": { "..." : "optional" }
}
```

`source_data[i]` is a flat dict of all original columns for point `i` (by `__featrix_row_offset`).

### 5. `GET /compute/session/{id}/model_card`

Per-column statistics used by the Cluster Analysis modal.

**Expected response:**

```json
{
  "column_statistics": {
    "revenue": {
      "mutual_information_bits": 2.3,
      "predictability_pct": 87.5,
      "marginal_loss": 0.02
    },
    "company_name": {
      "mutual_information_bits": 0.1,
      "predictability_pct": 12.0,
      "marginal_loss": null
    }
  }
}
```

### 6. `GET /compute/session/{id}/training_metrics`

Training loss curves for the convergence chart.

**Expected response:**

```json
{
  "training_metrics": {
    "epochs": [0, 1, 2, 3],
    "loss": [1.5, 0.8, 0.4, 0.2],
    "validation_loss": [1.6, 0.9, 0.5, 0.3]
  }
}
```

---

## Data Structures

### `entire_cluster_results`

Dict keyed by **cluster count** (string). Present in projections, epoch_projections, and the GLB sidecar.

**What we receive today:**

| Field | Type | Description |
|---|---|---|
| `cluster_labels` | `int[]` | Length N (one per point). Index = `__featrix_row_offset`, value = cluster ID (0-based) |
| `score` | `float` | Quality metric (silhouette score) for this k |

The viewer uses this to:
- Populate the **Cluster Coloring** dropdown (one entry per k value)
- Color points by `cluster_labels[rowOffset]`
- Filter by **Focus Cluster**
- Drive the **Cluster Analysis** modal
- If missing, the viewer falls back to client-side k-means

**What we want from the backend (per cluster count):**

The viewer currently computes cluster signatures, field ownership, lift, and overlap entirely client-side from raw point data. This is slow, limited to loaded points, and can't leverage Featrix's deeper knowledge of the embedding space. We want the backend to return rich cluster metadata so the viewer can display it directly.

```json
{
  "entire_cluster_results": {
    "5": {
      "cluster_labels": [0, 1, 2, 3, 4, 0, 1, ...],
      "score": 0.81,
      "best_k": true,

      "clusters": {
        "0": {
          "size": 120,
          "centroid": { "x": 0.42, "y": -0.31, "z": 0.85 },
          "radius": 0.15,
          "label": "West Coast Logistics",

          "signatures": [
            {
              "field": "state",
              "value": "CA",
              "cluster_pct": 0.72,
              "overall_pct": 0.18,
              "lift": 4.0,
              "field_type": "set"
            },
            {
              "field": "revenue",
              "direction": "high",
              "cluster_mean": 450000,
              "overall_mean": 180000,
              "lift": 2.5,
              "field_type": "scalar"
            }
          ],

          "column_distributions": {
            "state": {
              "type": "categorical",
              "value_counts": { "CA": 86, "OR": 18, "WA": 12, "NV": 4 },
              "top_values": ["CA", "OR", "WA"],
              "unique_count": 4
            },
            "revenue": {
              "type": "numeric",
              "mean": 450000,
              "median": 380000,
              "std": 120000,
              "min": 85000,
              "max": 1200000,
              "q1": 280000,
              "q3": 590000,
              "histogram": {
                "bins": [0, 200000, 400000, 600000, 800000, 1000000, 1200000],
                "counts": [5, 28, 42, 30, 12, 3]
              }
            }
          },

          "distinguishing_fields": [
            { "field": "state", "importance": 0.92, "mutual_information": 2.3 },
            { "field": "revenue", "importance": 0.78, "mutual_information": 1.8 }
          ]
        },
        "1": { "...": "same structure" }
      },

      "pairwise_overlap": {
        "0_1": 0.12,
        "0_2": 0.05,
        "1_2": 0.31
      },

      "field_rankings": [
        {
          "field": "state",
          "type": "set",
          "cluster_separation_score": 0.92,
          "mutual_information": 2.3,
          "predictability_pct": 87.5
        },
        {
          "field": "revenue",
          "type": "scalar",
          "cluster_separation_score": 0.78,
          "mutual_information": 1.8,
          "predictability_pct": 72.0
        }
      ]
    }
  }
}
```

**New fields explained:**

| Field | Where | Description |
|---|---|---|
| `best_k` | per cluster count | Boolean — is this the recommended k? |
| `clusters` | per cluster count | Dict keyed by cluster ID with rich per-cluster metadata |
| `clusters[i].size` | per cluster | Number of points in this cluster |
| `clusters[i].centroid` | per cluster | 3D centroid on the unit sphere |
| `clusters[i].radius` | per cluster | Angular radius (spread) of the cluster |
| `clusters[i].label` | per cluster | Auto-generated human-readable name based on signatures |
| `clusters[i].signatures` | per cluster | Top distinguishing values with lift scores (what makes this cluster unique) |
| `clusters[i].column_distributions` | per cluster | Per-column stats within this cluster (histograms for numeric, value_counts for categorical) |
| `clusters[i].distinguishing_fields` | per cluster | Ranked list of which fields best separate this cluster from others |
| `pairwise_overlap` | per cluster count | Jaccard/overlap similarity between each pair of clusters |
| `field_rankings` | per cluster count | Global ranking of which fields are most useful for cluster separation |

**Why this matters:** The viewer currently does ~200 lines of client-side computation (signatures, lift, overlap, field ownership) every time the Cluster Analysis modal opens, operating only on the loaded point subset. The backend has access to the full dataset, the embedding model's learned feature importances, and mutual information — it can produce far better results. The viewer would just render what it receives.

### `coords` per-point fields

| Field | Required | Description |
|---|---|---|
| `x` / `y` / `z` (or `"0"` / `"1"` / `"2"`) | Yes | 3D position on unit sphere |
| `cluster_pre` | No | Pre-assigned cluster label (legacy, prefer `entire_cluster_results`) |
| `__featrix_row_id` | Yes | Original row ID from source dataset |
| `__featrix_row_offset` | Yes | Sequential index (0-based), used to index into `cluster_labels` arrays |
| `scalar_columns` | Yes | Dict of numeric source columns (e.g. `{"revenue": 125000}`) |
| `set_columns` | Yes | Dict of categorical source columns (e.g. `{"state": "CA"}`) |
| `string_columns` | Yes | Dict of free-text source columns (e.g. `{"company_name": "..."}`) |

**If `scalar_columns`, `set_columns`, and `string_columns` are empty `{}`:** the viewer's Search panel shows "No searchable columns", the Data Inspector shows "0 fields", and column distribution charts have no data.

---

## Known Issues (as of 2026-04-07)

1. **Empty column dicts** — All three column dicts (`scalar_columns`, `set_columns`, `string_columns`) return `{}` for many sessions. The row IDs exist but the join back to source data isn't happening.

2. **Zero-padded GLB epochs** — Some GLB files contain duplicate epoch keys with all-zero positions (e.g., `epoch_1` appears twice, second copy is zeros). The frontend filters these, but the backend should not emit them.

3. **`/projections` returns 422** for sessions that only have epoch_projections data. The frontend falls back gracefully, but this generates noisy console errors.

---

## Embedding the Sphere Viewer

### Script tag (no build system needed)

Two builds are available:

| Build | File | Size | When to use |
|---|---|---|---|
| **Standalone** | `sphere-viewer-standalone.js` | ~1.1 MB | Pages without React (monitors, static HTML, dashboards) |
| **External** | `sphere-viewer.js` | ~870 KB | Pages that already load React 18 as `window.React` / `window.ReactDOM` |

```html
<!-- Standalone: zero dependencies, just drop in -->
<script src="https://bits.featrix.com/sv/sphere-viewer-standalone.js"
        data-session-id="your-session-id"
        data-api-base-url="https://sphere-api.featrix.com">
</script>

<!-- With React already on page -->
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://bits.featrix.com/sv/sphere-viewer.js"
        data-session-id="your-session-id"
        data-api-base-url="https://sphere-api.featrix.com">
</script>
```

### Data attributes

| Attribute | Default | Description |
|---|---|---|
| `data-session-id` | — | Featrix session ID to load |
| `data-api-base-url` | auto | API base URL (e.g. `https://sphere-api.featrix.com`) |
| `data-container-id` | `sphere-viewer-container` | ID of existing DOM element to render into |
| `data-auth-token` | — | JWT Bearer token for authenticated API requests |
| `data-mode` | `full` | `thumbnail` (no UI controls) or `full` |
| `data-theme` | `dark` | `dark` or `light` |
| `data-background-color` | — | CSS color for the container background |
| `data-point-size` | `0.05` | Point radius |
| `data-point-opacity` | `0.5` | Point opacity (0-1) |
| `data-point-alpha` | — | Alias for point-opacity |
| `data-colormap` | — | Matplotlib colormap name (e.g. `viridis`, `tab10`) |
| `data-is-rotating` | `true` | Auto-rotate the sphere |
| `data-rotation-speed` | `0.1` | Rotation speed |
| `data-width` | `100%` | Container width (CSS value) |
| `data-height` | `500px` | Container height (CSS value) |
| `data-endpoint` | — | Custom data URL (must return epoch_projections format) |
| `data-featrix-data` | — | URL to a JSON file to load as data |
| `data-use-window-data` | — | Key on `window` object containing pre-loaded data |
| `data-on-maximize` | — | Name of global function to call on maximize click |
| `data-quiet` | — | Set to `true` to suppress the console version banner |

### JavaScript API

```js
// Manual initialization
const viewer = new FeatrixSphereViewer();
await viewer.init({
  sessionId: 'your-session-id',
  apiBaseUrl: 'https://sphere-api.featrix.com',
  containerId: 'my-container',
  mode: 'full',
  theme: 'dark',
  authToken: 'eyJ...',
  onSphereReady: (sphere) => { console.log('Ready!', sphere); }
});

// Update settings live
viewer.updateAnimationSettings({
  isRotating: false,
  pointSize: 0.03,
  pointOpacity: 0.8
});

// Load different session
viewer.update({ sessionId: 'other-session-id' });

// Clean up
viewer.destroy();
```

### React / npm import

```bash
npm install @featrix/sphere-viewer
```

```tsx
import { FeatrixSphereEmbedded } from '@featrix/sphere-viewer';

function App() {
  return (
    <FeatrixSphereEmbedded
      initial_data={{ session: { session_id: 'your-session-id' } }}
      apiBaseUrl="https://sphere-api.featrix.com"
      authToken="eyJ..."
      mode="full"
      theme="dark"
      pointAlpha={0.5}
      colormap="tab10"
      onSphereReady={(sphere) => console.log('Ready!', sphere)}
    />
  );
}
```
