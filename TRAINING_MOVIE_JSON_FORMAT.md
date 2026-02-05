# 🎬 Training Movie JSON Format Specification

This document describes the exact JSON format required for training movie data in the Featrix Sphere Viewer.

## Overview

Training movie data represents the evolution of 3D embedding coordinates over multiple training epochs. Each epoch contains the 3D positions of data points at that stage of training, allowing visualization of how embeddings converge over time.

## Top-Level Structure

```json
{
  "epoch_projections": {
    "epoch_1": { /* epoch data */ },
    "epoch_2": { /* epoch data */ },
    "epoch_3": { /* epoch data */ }
    // ... more epochs
  },
  "training_metrics": { /* optional loss data */ }
}
```

## Required Fields

### `epoch_projections` (Required)

An object where each key is an epoch identifier and each value contains the 3D coordinates for that epoch.

**Key Format:**
- Must be a string starting with `"epoch_"` followed by the epoch number
- Examples: `"epoch_1"`, `"epoch_2"`, `"epoch_10"`, `"epoch_226"`
- Epochs are sorted numerically by parsing the number after `"epoch_"`

**Value Structure:**
Each epoch object must contain a `coords` array:

```json
{
  "epoch_1": {
    "coords": [ /* array of coordinate objects */ ],
    "entire_cluster_results": { /* optional clustering data */ }
  }
}
```

## Coordinate Formats

The `coords` array accepts multiple coordinate formats for flexibility:

### Format 1: Object with Numeric Keys (API Format)

This is the format returned by the Featrix API:

```json
{
  "coords": [
    {
      "0": -2.5,
      "1": 1.3,
      "2": 0.8,
      "__featrix_row_id": 1,
      "__featrix_row_offset": 0,
      "scalar_columns": {
        "age": 28,
        "income": 55000
      },
      "set_columns": {
        "category": "A"
      },
      "string_columns": {
        "name": "Alice"
      }
    }
  ]
}
```

**Fields:**
- `"0"`, `"1"`, `"2"`: X, Y, Z coordinates (required)
- `__featrix_row_id`: Unique row identifier (optional but recommended)
- `__featrix_row_offset`: Row index/offset (optional but recommended)
- `scalar_columns`: Object containing numeric data fields (optional)
- `set_columns`: Object containing categorical data fields (optional)
- `string_columns`: Object containing text data fields (optional)

### Format 2: Object with Named Keys

```json
{
  "coords": [
    {
      "x": -2.5,
      "y": 1.3,
      "z": 0.8,
      "__featrix_row_id": 1,
      "__featrix_row_offset": 0
    }
  ]
}
```

### Format 3: Array Format

```json
{
  "coords": [
    [-2.5, 1.3, 0.8],
    [1.2, -0.5, 0.3]
  ]
}
```

**Note:** When using array format, metadata fields (`__featrix_row_id`, `scalar_columns`, etc.) are not available. Use object formats if you need metadata.

## Optional Fields

### `entire_cluster_results` (Optional)

Clustering results for each epoch. This is typically only present in the first epoch or final epoch:

```json
{
  "epoch_1": {
    "coords": [ /* ... */ ],
    "entire_cluster_results": {
      "2": {
        "cluster_labels": [0, 1, 0, 2, 1, 0, ...],
        "silhouette_score": 0.75,
        "n_clusters": 2
      },
      "3": {
        "cluster_labels": [0, 1, 2, 0, 1, 2, ...],
        "silhouette_score": 0.68,
        "n_clusters": 3
      }
    }
  }
}
```

**Structure:**
- Keys are cluster count strings (e.g., `"2"`, `"3"`, `"5"`)
- Each value contains:
  - `cluster_labels`: Array of cluster assignments, one per data point
  - `silhouette_score`: Quality metric for this cluster count
  - `n_clusters`: Number of clusters

### `training_metrics` (Optional)

Loss and training metrics for visualization:

```json
{
  "training_metrics": {
    "validation_loss": [
      { "epoch": 1, "value": 2.5 },
      { "epoch": 2, "value": 2.3 },
      { "epoch": 3, "value": 2.1 }
      // ... more epochs
    ],
    "learning_rate": [
      { "epoch": 1, "value": 0.0003 },
      { "epoch": 2, "value": 0.0003 }
      // ... more epochs
    ]
  }
}
```

**Fields:**
- `validation_loss`: Array of `{epoch: number, value: number}` pairs
- `learning_rate`: Array of `{epoch: number, value: number}` pairs (optional)

## Complete Example

```json
{
  "epoch_projections": {
    "epoch_1": {
      "coords": [
        {
          "0": -2.5,
          "1": 1.3,
          "2": 0.8,
          "__featrix_row_id": 1,
          "__featrix_row_offset": 0,
          "scalar_columns": {
            "age": 28,
            "income": 55000
          },
          "set_columns": {
            "category": "A",
            "region": "North"
          }
        },
        {
          "0": 1.2,
          "1": -0.5,
          "2": 0.3,
          "__featrix_row_id": 2,
          "__featrix_row_offset": 1,
          "scalar_columns": {
            "age": 35,
            "income": 72000
          },
          "set_columns": {
            "category": "B",
            "region": "South"
          }
        }
      ],
      "entire_cluster_results": {
        "2": {
          "cluster_labels": [0, 1],
          "silhouette_score": 0.75,
          "n_clusters": 2
        }
      }
    },
    "epoch_2": {
      "coords": [
        {
          "0": -2.4,
          "1": 1.4,
          "2": 0.7,
          "__featrix_row_id": 1,
          "__featrix_row_offset": 0,
          "scalar_columns": {
            "age": 28,
            "income": 55000
          },
          "set_columns": {
            "category": "A",
            "region": "North"
          }
        },
        {
          "0": 1.3,
          "1": -0.4,
          "2": 0.4,
          "__featrix_row_id": 2,
          "__featrix_row_offset": 1,
          "scalar_columns": {
            "age": 35,
            "income": 72000
          },
          "set_columns": {
            "category": "B",
            "region": "South"
          }
        }
      ]
    }
  },
  "training_metrics": {
    "validation_loss": [
      { "epoch": 1, "value": 2.5 },
      { "epoch": 2, "value": 2.3 }
    ]
  }
}
```

## Data Consistency Requirements

1. **Point Count Consistency**: All epochs should have the same number of points in their `coords` arrays. The viewer expects consistent point counts across epochs.

2. **Row ID Consistency**: If using `__featrix_row_id` or `__featrix_row_offset`, the same identifiers should appear in the same order across all epochs. This allows the viewer to track individual points as they move.

3. **Epoch Ordering**: Epoch keys are sorted numerically. Ensure epoch numbers are sequential or at least monotonically increasing.

4. **Coordinate Ranges**: Coordinates are typically normalized to a reasonable range (e.g., -3 to +3). Very large coordinate values may cause rendering issues.

## API Endpoint Format

When fetching from the Featrix API, the format matches this specification:

```
GET /compute/session/{session_id}/epoch_projections
```

**Response:**
```json
{
  "epoch_projections": {
    "epoch_1": { /* ... */ },
    "epoch_2": { /* ... */ }
  }
}
```

## Usage in Code

### Loading Training Movie Data

```javascript
// From API
const response = await fetch('https://sphere-api.featrix.com/compute/session/{session_id}/epoch_projections');
const data = await response.json();
const trainingMovieData = data.epoch_projections;

// From JSON file
const trainingMovieData = {
  epoch_projections: {
    epoch_1: { coords: [...] },
    epoch_2: { coords: [...] }
  }
};

// Initialize viewer
const viewer = new window.FeatrixSphereViewer();
viewer.init({
  data: {
    session: { session_id: "your-session-id" },
    trainingMovieData: trainingMovieData
  }
});
```

### Direct Data Format

```javascript
// Minimal example
const trainingMovieData = {
  "epoch_1": {
    "coords": [
      {"0": -1.2, "1": 0.5, "2": 0.8, "__featrix_row_offset": 0},
      {"0": 1.5, "1": -0.3, "2": 0.2, "__featrix_row_offset": 1}
    ]
  },
  "epoch_2": {
    "coords": [
      {"0": -1.1, "1": 0.6, "2": 0.7, "__featrix_row_offset": 0},
      {"0": 1.4, "1": -0.2, "2": 0.3, "__featrix_row_offset": 1}
    ]
  }
};
```

## Validation Checklist

Before using training movie data, verify:

- [ ] `epoch_projections` object exists
- [ ] At least one epoch key exists (e.g., `"epoch_1"`)
- [ ] Each epoch has a `coords` array
- [ ] All epochs have the same number of points
- [ ] Coordinates are valid numbers (not NaN, not Infinity)
- [ ] If using row identifiers, they're consistent across epochs
- [ ] Epoch keys are properly formatted (`"epoch_N"` where N is a number)

## Common Issues

### Issue: "No epochs found in training movie data"
**Cause:** The `epoch_projections` object is empty or missing
**Fix:** Ensure at least one epoch key exists with valid data

### Issue: "No coords found in first epoch data"
**Cause:** The first epoch object doesn't have a `coords` array
**Fix:** Add `coords` array to each epoch object

### Issue: Point count mismatch between epochs
**Cause:** Different epochs have different numbers of points
**Fix:** Ensure all epochs have the same number of coordinate entries

### Issue: Coordinates not updating
**Cause:** Row identifiers (`__featrix_row_offset`) don't match between epochs
**Fix:** Use consistent row identifiers across all epochs

## Related Documentation

- `FEATRIX_DATA_FORMAT.md` - General data format specification
- `TRAINING_MOVIE_DATA.md` - Training movie feature overview
- `DEVELOPER_GUIDE.md` - Development and integration guide

