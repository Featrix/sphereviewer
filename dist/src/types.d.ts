/**
 * @license
 * Featrix Sphere Viewer — Public SDK Types
 *
 * Copyright (c) 2023-2026 Featrix
 * Licensed under the BSD 4-Clause License (see LICENSE file)
 *
 * These types mirror the actual Featrix backend API response shapes.
 * The viewer is a visualization layer, not a data transformation layer.
 */
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
export interface EpochFrame {
    coords: PointCoord[];
    clusters?: ClusterResults;
}
export interface EpochData {
    epochs: Record<string, EpochFrame>;
}
/** Keyed by cluster count as string (e.g. "3", "5", "7") */
export interface ClusterResults {
    [k: string]: {
        /** Per-point cluster assignment. Index = rowOffset, value = cluster ID (0-based) */
        labels: number[];
        /** Davies-Bouldin score (lower = better separation) */
        score: number;
    };
}
/**
 * Per-cluster signature tuple from backend cluster_messages.
 * Describes what makes a cluster distinctive.
 */
export interface ClusterSignature {
    /** Normalized importance (0-100) */
    weight: number;
    /** Column name */
    col: string;
    /** Percentage or z-score */
    perc: number;
    /** Feature value or range */
    value: string;
    /** Human-readable description */
    msg: string;
}
/**
 * Rich per-cluster metadata from backend cluster_descriptions.
 */
export interface ClusterInfo {
    cluster_id: number;
    size: number;
    /** Fraction of total dataset in this cluster */
    fraction: number;
    distinguishing_features: DistinguishingFeature[];
    categorical_overlap?: {
        column: string;
        value: string;
        overlap_pct: number;
    };
}
export interface DistinguishingFeature {
    column: string;
    type: 'scalar' | 'categorical' | 'sub_feature';
    score: number;
    /** "higher" | "lower" | "over-represented" | "under-represented" */
    direction: string;
    detail: ScalarDetail | CategoricalDetail | SubFeatureDetail;
}
export interface ScalarDetail {
    cluster_mean: number;
    overall_mean: number;
    cluster_std: number;
    overall_std: number;
    z_score: number;
}
export interface CategoricalDetail {
    value: string;
    cluster_pct: number;
    overall_pct: number;
    lift: number;
}
export interface SubFeatureDetail {
    parent_column: string;
    sub_value: string;
    cluster_pct: number;
    overall_pct: number;
    lift: number;
}
/** Per-column mutual information ranking from backend column_mi_rankings */
export interface ColumnMIRanking {
    column: string;
    mutual_information_bits: number;
    predictability_pct?: number;
}
export interface FieldRanking {
    field: string;
    type: 'scalar' | 'set' | 'string';
    clusterSeparationScore: number;
    mutualInformation?: number;
    predictabilityPct?: number;
}
export interface ProjectionData {
    /** Per-epoch coordinates for training movie animation */
    epochs?: Record<string, EpochFrame>;
    /** Single-frame data (no animation, just render these points) */
    coords?: PointCoord[];
    /** Cluster assignments for multiple k values */
    clusters?: ClusterResults;
    /** Total points available (for "Load more" pagination UI) */
    totalCount?: number;
    /** Per-cluster signature tuples (keyed by k, then cluster ID) */
    cluster_messages?: Record<string, Record<number, ClusterSignature[]>>;
    /** Rich per-cluster metadata (keyed by k, then cluster ID) */
    cluster_descriptions?: Record<string, Record<number, ClusterInfo>>;
    /** Per-column mutual information scores */
    column_mi_rankings?: ColumnMIRanking[];
    /** Available k values that were computed */
    available_k?: number[];
    /** Currently selected k */
    current_k?: number;
    /** Recommended k (best Davies-Bouldin score) */
    best_k?: number;
}
export interface RowData {
    rowId: number;
    fields: Record<string, any>;
}
export interface ClusterDetail {
    clusterId: number;
    k: number;
    info: ClusterInfo;
    signatures?: ClusterSignature[];
    /** Source rows in this cluster (first page) */
    rows?: RowData[];
}
export interface PointInfo {
    rowId: number;
    rowOffset: number;
    clusterId: number;
    position: {
        x: number;
        y: number;
        z: number;
    };
    color: string;
    /** Source data fields — only present if rows were loaded */
    fields?: Record<string, any>;
}
export type OnRequestRows = (rowIds: number[]) => Promise<RowData[]>;
export type OnRequestClusterDetail = (k: number, clusterId: number) => Promise<ClusterDetail>;
export type OnRequestMorePoints = (limit: number, offset: number) => Promise<ProjectionData>;
export type OnRequestEpochs = (epochRange: [number, number]) => Promise<EpochData>;
export type OnPointClick = (point: PointInfo) => void;
export type OnPointsSelected = (points: PointInfo[]) => void;
export type OnClusterFocused = (clusterId: number | null) => void;
export type OnFrameChange = (epoch: number, totalEpochs: number) => void;
export interface SphereViewerProps {
    /** Pre-baked projection data — pass this and skip session lifecycle entirely */
    data?: ProjectionData;
    /** Featrix session ID — triggers internal fetch + polling (backwards compat) */
    sessionId?: string;
    /** API base URL for session-based fetching (alias: baseUrl) */
    apiBaseUrl?: string;
    /** JWT Bearer token — sent as Authorization: Bearer header */
    authToken?: string;
    /** API key — sent as X-Api-Key header. Use this or authToken, not both. */
    apiKey?: string;
    onRequestRows?: OnRequestRows;
    onRequestClusterDetail?: OnRequestClusterDetail;
    onRequestMorePoints?: OnRequestMorePoints;
    onRequestEpochs?: OnRequestEpochs;
    onPointClick?: OnPointClick;
    onPointsSelected?: OnPointsSelected;
    onClusterFocused?: OnClusterFocused;
    onFrameChange?: OnFrameChange;
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
    /** Called when the Three.js sphere is initialized and ready */
    onSphereReady?: (sphereRef: any) => void;
    /** Called when maximize button is clicked in thumbnail mode */
    onMaximize?: (sessionId?: string) => void;
    /** @deprecated Use pointAlpha instead */
    pointOpacity?: number;
}
