# Backend API Changes for Incremental Point Loading

## Overview

The sphere viewer needs to support a "Load another 1,000 points" button so users can incrementally load large datasets instead of fetching everything at once.

## What already works (frontend)

- `limit` query param is already supported on both `/projections?limit=N` and `/epoch_projections?limit=N`
- `add_point_to_sphere()` can add individual points to a live scene — no rebuild needed
- Cluster coloring works per-point (`cluster_pre` comes with each coord), so new points arrive pre-labeled

## What we need from the backend

### 1. `offset` parameter on `/projections` and `/epoch_projections`

Add an `offset` integer query parameter (default 0) to both endpoints:

```
GET /compute/session/{id}/projections?limit=1000&offset=0    → points 0-999
GET /compute/session/{id}/projections?limit=1000&offset=1000 → points 1000-1999
```

### 2. `total_count` in the response metadata

Include pagination metadata so the frontend knows how many points exist total and can show "Showing 1,000 of 5,000 points" / hide the button when all points are loaded.

**`/projections` response:**
```json
{
  "projections": {
    "coords": [...],
    "total_count": 5000,
    "offset": 0,
    "limit": 1000
  }
}
```

**`/epoch_projections` response:**
```json
{
  "epoch_projections": {
    "epoch_0": {
      "coords": [...],
      "total_count": 5000,
      "offset": 0,
      "limit": 1000
    },
    "epoch_1": { ... }
  }
}
```

### 3. Consistent row subsets across epochs

For `/epoch_projections`, the backend must return the **same** point subset across all epochs, keyed by `__featrix_row_offset`. This is critical so points can be tracked consistently across the training movie animation. E.g., if `offset=1000&limit=1000` returns rows 1000-1999 in epoch_0, those same rows must appear in epoch_1, epoch_2, etc.
