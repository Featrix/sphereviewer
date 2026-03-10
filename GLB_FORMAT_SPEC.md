# GLB Binary Format for Training Movie Data

## Overview

Training movie data (100+ epochs × 1000+ points) currently ships as JSON, often 100+ MB. This spec defines a compact binary format using the GLB container that achieves 80–97% size reduction by packing coordinates as typed arrays and shipping metadata separately.

**Two files per session:**
1. **GLB file** — coordinates + per-epoch cluster labels (the heavy binary data)
2. **JSON sidecar** — point metadata, source data, training metrics, session cluster results

## API Endpoints

```
GET /compute/session/{session_id}/epoch_projections.glb
GET /compute/session/{session_id}/epoch_projections_meta.json
```

The frontend tries GLB first. If the endpoint returns 404, it falls back to the existing JSON `epoch_projections` endpoint. Both endpoints support the same `Authorization: Bearer <token>` header.

---

## GLB File Format

Standard GLB container: 12-byte header + JSON chunk + BIN chunk.

### Binary Layout

```
Offset  Size    Description
──────  ──────  ─────────────────────────────
0       4       Magic: 0x46546C67 ('glTF')
4       4       Version: 2
8       4       Total file length in bytes

12      4       JSON chunk length
16      4       JSON chunk type: 0x4E4F534A ('JSON')
20      N       JSON chunk data (UTF-8, padded to 4-byte boundary with spaces)

20+N    4       BIN chunk length
24+N    4       BIN chunk type: 0x004E4942 ('BIN\0')
28+N    M       BIN chunk data (padded to 4-byte boundary with 0x00)
```

### JSON Chunk Schema

```json
{
  "featrix_version": 1,
  "num_epochs": 100,
  "num_points": 1000,
  "epoch_keys": ["epoch_0", "epoch_5", "epoch_10", "..."],
  "has_cluster_labels": true,
  "cluster_k_values": [2, 3, 4, 5, 6, 7, 8],
  "has_prob_positive": false,
  "bufferViews": {
    "positions": {
      "byteOffset": 0,
      "byteLength": 1200000
    },
    "clusterLabels": {
      "byteOffset": 1200000,
      "byteLength": 700000
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `featrix_version` | int | Format version, currently `1` |
| `num_epochs` | int | Number of training epochs in the file |
| `num_points` | int | Number of data points per epoch (constant) |
| `epoch_keys` | string[] | Ordered list of epoch identifiers (e.g., `"epoch_0"`, `"epoch_5"`) |
| `has_cluster_labels` | bool | Whether per-epoch cluster labels are included |
| `cluster_k_values` | int[] | Cluster counts (k values) included, e.g., `[2, 3, 4, 5, 6, 7, 8]` |
| `has_prob_positive` | bool | Whether prob_positive values are included (manifold viz) |
| `bufferViews` | object | Byte offsets and lengths into the BIN chunk |

### BIN Chunk Layout

All data is **little-endian** (native for x86/ARM).

#### Positions: `Float32Array`

```
Layout: [epoch_0_point_0_x, epoch_0_point_0_y, epoch_0_point_0_z,
         epoch_0_point_1_x, epoch_0_point_1_y, epoch_0_point_1_z,
         ...
         epoch_1_point_0_x, epoch_1_point_0_y, epoch_1_point_0_z,
         ...]

Size: num_epochs × num_points × 3 × 4 bytes
```

**Epoch-major ordering**: all points for epoch 0 come first, then epoch 1, etc. Within each epoch, points are ordered by `__featrix_row_offset` (index `i` = row offset `i`).

#### Cluster Labels: `Uint8Array` (optional)

```
Layout: [k0_epoch0_point0, k0_epoch0_point1, ...,
         k0_epoch1_point0, k0_epoch1_point1, ...,
         k1_epoch0_point0, k1_epoch0_point1, ...,
         ...]

Size: num_k_values × num_epochs × num_points × 1 byte
```

**Grouped by k, then epoch**: all epochs for k=2 first, then all epochs for k=3, etc. Labels are 0-indexed cluster IDs (max 255 clusters per k).

#### Prob Positive: `Float32Array` (optional, manifold viz only)

```
Layout: [epoch_0_point_0, epoch_0_point_1, ...,
         epoch_1_point_0, epoch_1_point_1, ...,
         ...]

Size: num_epochs × num_points × 4 bytes
```

---

## JSON Sidecar Format

Endpoint: `GET /compute/session/{session_id}/epoch_projections_meta.json`

```json
{
  "featrix_sidecar_version": 1,
  "session_id": "sess_abc123",
  "point_metadata": {
    "num_points": 1000,
    "row_ids": [42, 17, 99, 256, "..."],
    "source_data": [
      { "name": "Alice", "age": 30, "city": "NYC", "score": 0.85 },
      { "name": "Bob", "age": 25, "city": "LA", "score": 0.72 },
      "..."
    ]
  },
  "training_metrics": {
    "validation_loss": [
      { "epoch": 0, "value": 2.1 },
      { "epoch": 5, "value": 1.8 },
      { "epoch": 10, "value": 1.2 },
      "..."
    ]
  },
  "session_cluster_results": {
    "2": { "cluster_labels": [0, 1, 0, 1, "..."], "silhouette_score": 0.75 },
    "3": { "cluster_labels": [0, 1, 2, 0, "..."], "silhouette_score": 0.68 },
    "..."
  }
}
```

| Field | Description |
|-------|-------------|
| `point_metadata.row_ids` | `__featrix_row_id` for each point, indexed by `__featrix_row_offset` |
| `point_metadata.source_data` | Original dataset columns per point (indexed by row_offset) |
| `training_metrics.validation_loss` | Loss curve data for the 3D loss plot overlay |
| `session_cluster_results` | Session-level (final) cluster assignments for convergence view |

---

## Size Comparison

| Scenario | JSON | GLB + Sidecar | Reduction |
|----------|------|---------------|-----------|
| 100 epochs × 1K points, no source_data | ~12 MB | ~1.2 MB GLB + ~4 KB sidecar | **90%** |
| 100 epochs × 1K points, 500B source_data/point | ~100 MB | ~1.2 MB GLB + ~500 KB sidecar | **98%** |
| 50 epochs × 5K points, no source_data | ~30 MB | ~3 MB GLB | **90%** |

The savings come from:
- **No text encoding overhead**: floats as 4 bytes instead of ~10 chars in JSON
- **No structural overhead**: no `{`, `}`, `"x":`, `"y":`, `"z":` per point per epoch
- **Source data sent once**: not duplicated across every epoch

---

## Python Backend Generation

```python
import struct
import json

def generate_training_glb(epoch_data, cluster_data, session_id):
    """
    Generate a GLB file for training movie data.

    Args:
        epoch_data: dict of { epoch_key: { coords: [{ x, y, z, __featrix_row_offset }, ...] } }
        cluster_data: dict of { epoch_key: { k_value: [labels...] } }
        session_id: str

    Returns:
        bytes: GLB binary data
    """
    import numpy as np

    epoch_keys = sorted(epoch_data.keys(), key=lambda k: int(k.replace('epoch_', '')))
    num_epochs = len(epoch_keys)
    num_points = len(epoch_data[epoch_keys[0]]['coords'])

    # Collect all k values
    first_epoch_clusters = cluster_data.get(epoch_keys[0], {})
    k_values = sorted([int(k) for k in first_epoch_clusters.keys()])

    # Pack positions: Float32, epoch-major
    positions = np.zeros((num_epochs, num_points, 3), dtype=np.float32)
    for ei, ek in enumerate(epoch_keys):
        coords = epoch_data[ek]['coords']
        # Sort by __featrix_row_offset to ensure stable ordering
        coords_sorted = sorted(coords, key=lambda c: c.get('__featrix_row_offset', 0))
        for pi, c in enumerate(coords_sorted):
            positions[ei, pi, 0] = c.get('x', c.get(0, c.get('0', 0)))
            positions[ei, pi, 1] = c.get('y', c.get(1, c.get('1', 0)))
            positions[ei, pi, 2] = c.get('z', c.get(2, c.get('2', 0)))

    pos_bytes = positions.tobytes()

    # Pack cluster labels: Uint8, k-major then epoch-major
    cluster_bytes = b''
    if k_values:
        labels = np.zeros((len(k_values), num_epochs, num_points), dtype=np.uint8)
        for ki, k in enumerate(k_values):
            for ei, ek in enumerate(epoch_keys):
                epoch_clusters = cluster_data.get(ek, {})
                k_labels = epoch_clusters.get(str(k), {}).get('cluster_labels', [])
                for pi in range(min(len(k_labels), num_points)):
                    labels[ki, ei, pi] = k_labels[pi]
        cluster_bytes = labels.tobytes()

    # Build JSON metadata chunk
    pos_byte_length = len(pos_bytes)
    cluster_byte_length = len(cluster_bytes)

    buffer_views = {
        "positions": {"byteOffset": 0, "byteLength": pos_byte_length}
    }
    if cluster_bytes:
        buffer_views["clusterLabels"] = {
            "byteOffset": pos_byte_length,
            "byteLength": cluster_byte_length
        }

    json_metadata = {
        "featrix_version": 1,
        "num_epochs": num_epochs,
        "num_points": num_points,
        "epoch_keys": epoch_keys,
        "has_cluster_labels": bool(cluster_bytes),
        "cluster_k_values": k_values,
        "has_prob_positive": False,
        "bufferViews": buffer_views
    }

    json_bytes = json.dumps(json_metadata).encode('utf-8')
    # Pad JSON to 4-byte boundary with spaces
    while len(json_bytes) % 4 != 0:
        json_bytes += b' '

    # Combine binary data
    bin_data = pos_bytes + cluster_bytes
    # Pad BIN to 4-byte boundary with zeros
    while len(bin_data) % 4 != 0:
        bin_data += b'\x00'

    # Build GLB
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_data)

    glb = bytearray()
    # Header
    glb += struct.pack('<I', 0x46546C67)  # magic: 'glTF'
    glb += struct.pack('<I', 2)            # version
    glb += struct.pack('<I', total_length)
    # JSON chunk
    glb += struct.pack('<I', len(json_bytes))
    glb += struct.pack('<I', 0x4E4F534A)  # 'JSON'
    glb += json_bytes
    # BIN chunk
    glb += struct.pack('<I', len(bin_data))
    glb += struct.pack('<I', 0x004E4942)  # 'BIN\0'
    glb += bin_data

    return bytes(glb)


def generate_sidecar_json(session_id, coords, cluster_results, training_metrics=None):
    """
    Generate the JSON sidecar for a GLB training movie.

    Args:
        session_id: str
        coords: list of final-epoch coord dicts (with source_data, __featrix_row_id)
        cluster_results: dict of { k: { cluster_labels: [...] } }
        training_metrics: optional dict with validation_loss, etc.

    Returns:
        dict: sidecar JSON object
    """
    # Sort by row_offset for stable ordering
    sorted_coords = sorted(coords, key=lambda c: c.get('__featrix_row_offset', 0))

    row_ids = [c.get('__featrix_row_id', i) for i, c in enumerate(sorted_coords)]
    source_data = [c.get('source_data', {}) for c in sorted_coords]

    return {
        "featrix_sidecar_version": 1,
        "session_id": session_id,
        "point_metadata": {
            "num_points": len(sorted_coords),
            "row_ids": row_ids,
            "source_data": source_data
        },
        "training_metrics": training_metrics,
        "session_cluster_results": cluster_results
    }
```

---

## Frontend Integration

The frontend (`FeatrixSphereEmbedded.tsx`) uses this flow:

1. Try `fetch_training_glb()` — fetches `.glb` and `_meta.json` in parallel
2. If successful, `parseTrainingGLB()` extracts typed arrays from the GLB binary
3. `glbToTrainingMovieData()` converts to standard `{ epoch_key: { coords, entire_cluster_results } }` format
4. All existing consumers (`load_training_movie()`, `Canvas2DFallback`, movement analysis) work unchanged
5. If GLB endpoint returns 404 or parsing fails, falls back to existing JSON `epoch_projections` endpoint

GLB is only used for completed sessions. During live training, JSON polling continues as-is.
