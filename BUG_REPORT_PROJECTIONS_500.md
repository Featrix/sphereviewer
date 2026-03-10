# Bug Report: /projections Endpoint Returns 500 Error

**Date:** 2026-02-06
**Severity:** High
**Component:** sphere-api.featrix.com / compute API

---

## Summary

The `/compute/session/{sessionId}/projections` endpoint returns a 500 Internal Server Error, preventing the Sphere Viewer from displaying original dataset columns when users click on points.

---

## Affected Session

```
Session ID: credit-test-efa34c4a-9c2b-48d2-8a71-45374727e48c
```

---

## What We're Doing

The Sphere Viewer fetches full projection data to display original dataset columns when a user clicks on a point:

```
GET https://sphere-api.featrix.com/compute/session/credit-test-efa34c4a-9c2b-48d2-8a71-45374727e48c/projections?limit=10000
```

This call is made after successfully fetching:
- `/epoch_projections` (succeeds - 127 epochs, 500 points)
- `/training_metrics` (succeeds)

---

## What We Expect

A 200 response with the full projections data containing original dataset columns:

```json
{
  "projections": {
    "coords": [
      {
        "__featrix_row_offset": 0,
        "x": 0.123,
        "y": 0.456,
        "z": 0.789,
        "scalar_columns": {
          "credit_amount": 5000,
          "customer_age": 35,
          "income": 75000
        },
        "set_columns": {
          "loan_status": "approved",
          "region": "west"
        },
        "string_columns": {
          "customer_id": "CUST-12345"
        }
      }
    ],
    "entire_cluster_results": { ... }
  }
}
```

This data is used to populate the **Data Inspector** panel when users click points, showing the actual source data columns.

---

## What We Get

```
HTTP 500 Internal Server Error
```

Console output:
```
/compute/session/credit-test-efa34c4a-9c2b-48d2-8a71-45374727e48c/projections?limit=10000:1
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
```

---

## Impact

When `/projections` fails, the Sphere Viewer falls back to epoch_projections data which only contains **computed training metrics**, not original data:

| Shows (training metrics) | Should show (original data) |
|--------------------------|----------------------------|
| cumulative_distance      | credit_amount              |
| epoch_distance           | customer_age               |
| net_displacement_5       | income                     |
| net_displacement_25      | loan_status                |
| net_displacement_35      | region                     |
| split                    | customer_id                |
| label (row number)       | etc.                       |

Users clicking on points see meaningless training metrics instead of their actual data.

---

## Steps to Reproduce

1. Open Sphere Viewer with session `credit-test-efa34c4a-9c2b-48d2-8a71-45374727e48c`
2. Wait for training movie to load (succeeds)
3. Click on any point in the visualization
4. Observe Data Inspector shows only training metrics, not original columns

---

## Related API Calls (for context)

These endpoints work correctly for the same session:

```
GET /compute/session/{sessionId}/epoch_projections?limit=10000  ✅ 200 OK
GET /compute/session/{sessionId}/training_metrics               ✅ 200 OK
GET /compute/session/{sessionId}                                ✅ 200 OK
GET /compute/session/{sessionId}/projections?limit=10000        ❌ 500 Error
```

---

## Frontend Code Reference

The API call is made in [FeatrixSphereEmbedded.tsx:2089](src/FeatrixSphereEmbedded.tsx#L2089):

```typescript
const projectionsResponse = await fetch(
  `${baseUrl}/compute/session/${sessionId}/projections?limit=10000`
);
```

Fallback behavior when it fails (line 2114):
```typescript
coords: usingFullProjections
  ? fullProjectionsCoords
  : (apiTrainingData.epoch_projections[firstEpochKey]?.coords || [])
```

---

## Requested Action

Please investigate and fix the `/projections` endpoint for this session (and potentially others). The endpoint should return the full projection data with original dataset columns (`scalar_columns`, `set_columns`, `string_columns`).
