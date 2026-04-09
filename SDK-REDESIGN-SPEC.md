# Sphere Viewer SDK Redesign Spec

## Problem

The current API was designed for the Featrix monitor page where the viewer owns the entire data lifecycle — fetching sessions, polling status, loading epochs. This doesn't work for embedders like Beagle who already have their own API layer, auth, and data.

Embedders currently have to:
1. Fake a session envelope (`{ session: { done: true, status: "done" } }`)
2. Accept wasted polling cycles
3. Work without TypeScript types
4. Navigate duplicate/inconsistent prop names (`pointOpacity` vs `pointAlpha`, `data` vs `initial_data`)

## Design Principle

**The viewer is a pure visualization component.** It renders what it's given and calls back to the host when it needs more. The host decides where data comes from.

Same pattern as `<DataGrid onLoadMore={...} onRowClick={...} />`.

## Target API

### Minimal (just render static data)

```tsx
<FeatrixSphereViewer data={projectionData} />
```

No session ID, no API base URL, no polling. Just coords + clusters in, 3D sphere out.

### With callbacks (host provides data on demand)

```tsx
<FeatrixSphereViewer
  data={projectionData}
  
  // Data callbacks — viewer calls these when it needs more
  onRequestRows={(rowIds: number[]) => Promise<RowData[]>}
  onRequestClusterDetail={(k: number, clusterId: number) => Promise<ClusterDetail>}
  onRequestMorePoints={(limit: number, offset: number) => Promise<ProjectionData>}
  onRequestEpochs={(epochRange: [number, number]) => Promise<EpochData>}
  
  // UI event callbacks
  onPointClick={(point: PointInfo) => void}
  onPointsSelected={(points: PointInfo[]) => void}
  onClusterFocused={(clusterId: number | null) => void}
  onFrameChange={(epoch: number, totalEpochs: number) => void}
  
  // Visual config
  theme="dark"
  pointSize={0.01}
  pointAlpha={0.5}
  colormap="tab10"
  mode="full"
/>
```

### Self-fetching mode (backwards compat, monitor page)

```tsx
<FeatrixSphereViewer
  sessionId="abc-123"
  apiBaseUrl="https://sphere-api.featrix.com"
  authToken="eyJ..."
/>
```

When `sessionId` is provided instead of `data`, the viewer uses its internal fetch logic. This is the existing behavior, preserved for the monitor page and public viewer.

## Data Types

### `ProjectionData` (what you pass to `data`)

```typescript
interface ProjectionData {
  /** Per-epoch coordinates. Key = epoch name, value = array of points */
  epochs?: Record<string, EpochFrame>;
  
  /** Single-frame data (no animation, just render these points) */
  coords?: PointCoord[];
  
  /** Cluster assignments for multiple k values */
  clusters?: ClusterResults;
  
  /** Total points available (for pagination UI) */
  totalCount?: number;
}
```

### `EpochFrame`

```typescript
interface EpochFrame {
  coords: PointCoord[];
  clusters?: ClusterResults;
}
```

### `PointCoord`

```typescript
interface PointCoord {
  x: number;
  y: number;
  z: number;
  rowId: number;          // original row ID from source dataset
  rowOffset: number;      // sequential index, used for cluster_labels lookup
  cluster?: number;       // pre-assigned cluster label (optional)
}
```

### `ClusterResults`

```typescript
/** Keyed by cluster count (e.g. "3", "5", "7") */
interface ClusterResults {
  [k: string]: {
    labels: number[];     // length = num points, index = rowOffset
    score: number;        // silhouette or similar quality metric
    bestK?: boolean;      // is this the recommended k?
    
    /** Rich per-cluster metadata (optional, from backend) */
    clusters?: Record<number, ClusterInfo>;
    
    /** Global field rankings for this k (optional) */
    fieldRankings?: FieldRanking[];
  };
}
```

### `ClusterInfo` (rich cluster metadata from backend)

```typescript
interface ClusterInfo {
  size: number;
  centroid: { x: number; y: number; z: number };
  radius: number;
  label?: string;                    // auto-generated human name
  signatures?: ClusterSignature[];   // what makes this cluster unique
  columnDistributions?: Record<string, ColumnDistribution>;
  distinguishingFields?: { field: string; importance: number }[];
}
```

### `ClusterSignature`

```typescript
interface ClusterSignature {
  field: string;
  value?: string;           // for categorical
  direction?: 'high' | 'low';  // for numeric
  clusterPct: number;       // % of cluster with this value
  overallPct: number;       // % of total dataset
  lift: number;             // clusterPct / overallPct
  fieldType: 'scalar' | 'set' | 'string';
}
```

### `ColumnDistribution`

```typescript
type ColumnDistribution = {
  type: 'numeric';
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  histogram?: { bins: number[]; counts: number[] };
} | {
  type: 'categorical';
  valueCounts: Record<string, number>;
  topValues: string[];
  uniqueCount: number;
};
```

### Callback types

```typescript
/** Row data returned by onRequestRows */
interface RowData {
  rowId: number;
  fields: Record<string, any>;  // column name -> value
}

/** Returned by onRequestClusterDetail */
interface ClusterDetail {
  clusterId: number;
  k: number;
  info: ClusterInfo;
  /** Source rows in this cluster (first page) */
  rows?: RowData[];
}

/** Returned by onRequestMorePoints */
// Returns ProjectionData with coords for the next batch

/** Returned by onRequestEpochs */
interface EpochData {
  epochs: Record<string, EpochFrame>;
}
```

### UI event types

```typescript
interface PointInfo {
  rowId: number;
  rowOffset: number;
  clusterId: number;
  position: { x: number; y: number; z: number };
  color: string;
  /** Source data fields — only present if rows were loaded */
  fields?: Record<string, any>;
}
```

## What the viewer does with callbacks

| User action | Viewer behavior |
|---|---|
| Click a point | Calls `onPointClick`. If point has no `fields`, calls `onRequestRows([rowId])` to populate the Data Inspector. |
| Click "Load 1,000 more" | Calls `onRequestMorePoints(1000, currentOffset)`. Appends returned coords to scene. |
| Open Cluster Analysis modal | Calls `onRequestClusterDetail(k, clusterId)` for each visible cluster. Renders the returned signatures/distributions. |
| Scrub to epoch not yet loaded | Calls `onRequestEpochs([startEpoch, endEpoch])`. Appends to training movie. |
| Search by column value | Searches locally within loaded `fields`. Does NOT call back — search only works on data already fetched via `onRequestRows`. |

## What changes

| Area | Current | New |
|---|---|---|
| Props naming | `initial_data`, `pointOpacity` + `pointAlpha` | `data`, `pointAlpha` only |
| Data fetching | Viewer fetches from sphere-api | Viewer calls host callbacks (or fetches if `sessionId` provided) |
| Cluster analysis | 200 lines of client-side computation | Renders `ClusterInfo` from backend/host, falls back to client-side |
| Types | Not shipped | `.d.ts` in npm package |
| Exports | `FeatrixSphereEmbedded`, `FeatrixSphereViewer`, `EmbeddableEntry`, `export * from data-access` | `FeatrixSphereViewer` (React component), types |
| Script tag builds | Still work, unchanged | Still work, unchanged |

## Migration path

1. **v1.x (now):** Ship types, add `data` as alias for `initial_data`, deprecate `pointOpacity`
2. **v2.0:** New callback-based API as primary. `sessionId` mode still works but is the "managed" variant. Clean exports, clean types.
3. Script tag builds (`sphere-viewer-includes-react.js`, `sphere-viewer-bring-your-own-react.js`) continue to work as-is — they're a separate entry point that wraps the React component.

## Non-goals

- The viewer does NOT become a headless data processing library
- The viewer does NOT drop Three.js or change rendering approach
- Script tag / `data-*` attribute API stays the same
- Internal architecture of `featrix_sphere_control.ts` doesn't change
