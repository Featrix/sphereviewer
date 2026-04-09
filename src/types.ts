/**
 * @license
 * Featrix Sphere Viewer — Public SDK Types
 *
 * Copyright (c) 2023-2026 Featrix
 * Licensed under the BSD 4-Clause License (see LICENSE file)
 */

// ── Point & Coordinate Types ──

export interface PointCoord {
  x: number;
  y: number;
  z: number;
  /** Original row ID from source dataset */
  rowId: number;
  /** Sequential index (0-based), used for cluster_labels lookup */
  rowOffset: number;
  /** Pre-assigned cluster label (optional) */
  cluster?: number;
}

// ── Epoch / Training Movie Types ──

export interface EpochFrame {
  coords: PointCoord[];
  clusters?: ClusterResults;
}

export interface EpochData {
  epochs: Record<string, EpochFrame>;
}

// ── Cluster Types ──

/** Keyed by cluster count as string (e.g. "3", "5", "7") */
export interface ClusterResults {
  [k: string]: {
    labels: number[];
    score: number;
    bestK?: boolean;
    /** Rich per-cluster metadata (optional, from backend) */
    clusters?: Record<number, ClusterInfo>;
    /** Global field rankings for this k */
    fieldRankings?: FieldRanking[];
  };
}

export interface ClusterInfo {
  size: number;
  centroid: { x: number; y: number; z: number };
  radius: number;
  /** Auto-generated human-readable name */
  label?: string;
  /** What makes this cluster unique */
  signatures?: ClusterSignature[];
  /** Per-column stats within this cluster */
  columnDistributions?: Record<string, ColumnDistribution>;
  /** Ranked list of fields that best separate this cluster from others */
  distinguishingFields?: { field: string; importance: number }[];
}

export interface ClusterSignature {
  field: string;
  /** For categorical fields */
  value?: string;
  /** For numeric fields */
  direction?: 'high' | 'low';
  /** % of cluster with this value */
  clusterPct: number;
  /** % of total dataset */
  overallPct: number;
  /** clusterPct / overallPct */
  lift: number;
  fieldType: 'scalar' | 'set' | 'string';
}

export type ColumnDistribution = {
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

export interface FieldRanking {
  field: string;
  type: 'scalar' | 'set' | 'string';
  clusterSeparationScore: number;
  mutualInformation?: number;
  predictabilityPct?: number;
}

// ── Projection Data (top-level data prop) ──

export interface ProjectionData {
  /** Per-epoch coordinates for training movie animation */
  epochs?: Record<string, EpochFrame>;
  /** Single-frame data (no animation, just render these points) */
  coords?: PointCoord[];
  /** Cluster assignments for multiple k values */
  clusters?: ClusterResults;
  /** Total points available (for "Load more" pagination UI) */
  totalCount?: number;
}

// ── Row / Detail Types ──

export interface RowData {
  rowId: number;
  fields: Record<string, any>;
}

export interface ClusterDetail {
  clusterId: number;
  k: number;
  info: ClusterInfo;
  /** Source rows in this cluster (first page) */
  rows?: RowData[];
}

// ── UI Event Types ──

export interface PointInfo {
  rowId: number;
  rowOffset: number;
  clusterId: number;
  position: { x: number; y: number; z: number };
  color: string;
  /** Source data fields — only present if rows were loaded */
  fields?: Record<string, any>;
}

// ── Callback Type Aliases ──

export type OnRequestRows = (rowIds: number[]) => Promise<RowData[]>;
export type OnRequestClusterDetail = (k: number, clusterId: number) => Promise<ClusterDetail>;
export type OnRequestMorePoints = (limit: number, offset: number) => Promise<ProjectionData>;
export type OnRequestEpochs = (epochRange: [number, number]) => Promise<EpochData>;

export type OnPointClick = (point: PointInfo) => void;
export type OnPointsSelected = (points: PointInfo[]) => void;
export type OnClusterFocused = (clusterId: number | null) => void;
export type OnFrameChange = (epoch: number, totalEpochs: number) => void;

// ── Component Props ──

export interface SphereViewerProps {
  /** Pre-baked projection data — pass this and skip session lifecycle entirely */
  data?: ProjectionData;

  /** Featrix session ID — triggers internal fetch + polling (backwards compat) */
  sessionId?: string;
  /** API base URL for session-based fetching */
  apiBaseUrl?: string;
  /** JWT Bearer token for authenticated API requests */
  authToken?: string;

  // ── Data callbacks (viewer calls these when it needs more) ──
  onRequestRows?: OnRequestRows;
  onRequestClusterDetail?: OnRequestClusterDetail;
  onRequestMorePoints?: OnRequestMorePoints;
  onRequestEpochs?: OnRequestEpochs;

  // ── UI event callbacks ──
  onPointClick?: OnPointClick;
  onPointsSelected?: OnPointsSelected;
  onClusterFocused?: OnClusterFocused;
  onFrameChange?: OnFrameChange;

  // ── Visual config ──
  /** Display mode: 'thumbnail' hides all UI controls */
  mode?: 'thumbnail' | 'full';
  /** Theme: 'dark' (default) or 'light' */
  theme?: 'dark' | 'light';
  /** Custom background color */
  backgroundColor?: string;
  /** Point radius */
  pointSize?: number;
  /** Point opacity (0-1) */
  pointAlpha?: number;
  /** Matplotlib colormap name (e.g. 'viridis', 'tab10') */
  colormap?: string;
  /** Auto-rotate the sphere */
  isRotating?: boolean;
  /** Rotation speed */
  rotationSpeed?: number;
  /** Animate cluster transitions */
  animateClusters?: boolean;

  // ── Lifecycle callbacks ──
  /** Called when the Three.js sphere is initialized and ready */
  onSphereReady?: (sphereRef: any) => void;
  /** Called when maximize button is clicked in thumbnail mode */
  onMaximize?: (sessionId?: string) => void;

  /** @deprecated Use pointAlpha instead */
  pointOpacity?: number;
}
