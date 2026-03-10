/**
 * @license
 * Featrix Sphere Viewer - GLB Binary Loader
 *
 * Copyright (c) 2024-2025 Featrix
 * Licensed under the MIT License
 *
 * Parses GLB binary containers for compact training movie data.
 * Format: standard GLB header (12 bytes) + JSON chunk (metadata) + binary chunk (typed arrays).
 * See GLB_FORMAT_SPEC.md for the full format specification.
 */

// ============================================================================
// Types
// ============================================================================

export interface GLBMetadata {
    featrix_version: number;
    num_epochs: number;
    num_points: number;
    epoch_keys: string[];
    has_cluster_labels: boolean;
    cluster_k_values: number[];
    has_prob_positive: boolean;
    bufferViews: {
        positions: { byteOffset: number; byteLength: number };
        clusterLabels?: { byteOffset: number; byteLength: number };
        probPositive?: { byteOffset: number; byteLength: number };
    };
}

export interface ParsedGLB {
    metadata: GLBMetadata;
    positions: Float32Array;
    clusterLabels: Uint8Array | null;
    probPositive: Float32Array | null;
}

export interface GLBSidecar {
    featrix_sidecar_version: number;
    session_id: string;
    point_metadata: {
        num_points: number;
        row_ids: number[];
        source_data: any[];
    };
    training_metrics?: {
        validation_loss?: Array<{ epoch: number; value: number }>;
    };
    session_cluster_results?: Record<string, any>;
}

// ============================================================================
// GLB Parser
// ============================================================================

const GLB_MAGIC = 0x46546C67; // 'glTF' in little-endian
const GLB_VERSION = 2;
const CHUNK_TYPE_JSON = 0x4E4F534A; // 'JSON' in little-endian
const CHUNK_TYPE_BIN = 0x004E4942;  // 'BIN\0' in little-endian

/**
 * Parse a GLB binary container into metadata + typed arrays.
 * Validates the GLB header and extracts the JSON and binary chunks.
 */
export function parseTrainingGLB(arrayBuffer: ArrayBuffer): ParsedGLB {
    const view = new DataView(arrayBuffer);

    // --- Header (12 bytes) ---
    if (arrayBuffer.byteLength < 12) {
        throw new Error('GLB file too small: missing header');
    }

    const magic = view.getUint32(0, true);
    if (magic !== GLB_MAGIC) {
        throw new Error(`Invalid GLB magic: 0x${magic.toString(16)} (expected 0x${GLB_MAGIC.toString(16)})`);
    }

    const version = view.getUint32(4, true);
    if (version !== GLB_VERSION) {
        throw new Error(`Unsupported GLB version: ${version} (expected ${GLB_VERSION})`);
    }

    const totalLength = view.getUint32(8, true);
    if (totalLength > arrayBuffer.byteLength) {
        throw new Error(`GLB declares ${totalLength} bytes but buffer is only ${arrayBuffer.byteLength}`);
    }

    // --- Chunk 0: JSON ---
    if (arrayBuffer.byteLength < 20) {
        throw new Error('GLB file too small: missing JSON chunk header');
    }

    const jsonChunkLength = view.getUint32(12, true);
    const jsonChunkType = view.getUint32(16, true);
    if (jsonChunkType !== CHUNK_TYPE_JSON) {
        throw new Error(`Expected JSON chunk (0x${CHUNK_TYPE_JSON.toString(16)}), got 0x${jsonChunkType.toString(16)}`);
    }

    const jsonBytes = new Uint8Array(arrayBuffer, 20, jsonChunkLength);
    const jsonText = new TextDecoder().decode(jsonBytes);
    let metadata: GLBMetadata;
    try {
        metadata = JSON.parse(jsonText);
    } catch (e) {
        throw new Error(`Failed to parse GLB JSON chunk: ${(e as Error).message}`);
    }

    if (!metadata.featrix_version || !metadata.num_epochs || !metadata.num_points || !metadata.epoch_keys || !metadata.bufferViews) {
        throw new Error('GLB JSON chunk missing required fields (featrix_version, num_epochs, num_points, epoch_keys, bufferViews)');
    }

    // --- Chunk 1: BIN ---
    const binChunkOffset = 20 + jsonChunkLength;
    if (arrayBuffer.byteLength < binChunkOffset + 8) {
        throw new Error('GLB file too small: missing BIN chunk header');
    }

    const binChunkLength = view.getUint32(binChunkOffset, true);
    const binChunkType = view.getUint32(binChunkOffset + 4, true);
    if (binChunkType !== CHUNK_TYPE_BIN) {
        throw new Error(`Expected BIN chunk (0x${CHUNK_TYPE_BIN.toString(16)}), got 0x${binChunkType.toString(16)}`);
    }

    const binDataOffset = binChunkOffset + 8;

    // Extract positions
    const posView = metadata.bufferViews.positions;
    const positions = new Float32Array(
        arrayBuffer,
        binDataOffset + posView.byteOffset,
        posView.byteLength / Float32Array.BYTES_PER_ELEMENT
    );

    // Extract cluster labels (optional)
    let clusterLabels: Uint8Array | null = null;
    if (metadata.has_cluster_labels && metadata.bufferViews.clusterLabels) {
        const clView = metadata.bufferViews.clusterLabels;
        clusterLabels = new Uint8Array(
            arrayBuffer,
            binDataOffset + clView.byteOffset,
            clView.byteLength
        );
    }

    // Extract prob_positive (optional)
    let probPositive: Float32Array | null = null;
    if (metadata.has_prob_positive && metadata.bufferViews.probPositive) {
        const ppView = metadata.bufferViews.probPositive;
        probPositive = new Float32Array(
            arrayBuffer,
            binDataOffset + ppView.byteOffset,
            ppView.byteLength / Float32Array.BYTES_PER_ELEMENT
        );
    }

    // Validate sizes
    const expectedPositions = metadata.num_epochs * metadata.num_points * 3;
    if (positions.length !== expectedPositions) {
        throw new Error(`Positions buffer has ${positions.length} floats, expected ${expectedPositions} (${metadata.num_epochs} epochs × ${metadata.num_points} points × 3)`);
    }

    if (clusterLabels && metadata.cluster_k_values) {
        const expectedLabels = metadata.cluster_k_values.length * metadata.num_epochs * metadata.num_points;
        if (clusterLabels.length !== expectedLabels) {
            throw new Error(`Cluster labels buffer has ${clusterLabels.length} bytes, expected ${expectedLabels}`);
        }
    }

    console.log(`📦 GLB parsed: ${metadata.num_epochs} epochs, ${metadata.num_points} points, ` +
        `positions=${(posView.byteLength / 1024).toFixed(0)}KB` +
        (clusterLabels ? `, clusters=${(metadata.bufferViews.clusterLabels!.byteLength / 1024).toFixed(0)}KB` : '') +
        (probPositive ? `, prob_positive=${(metadata.bufferViews.probPositive!.byteLength / 1024).toFixed(0)}KB` : ''));

    return { metadata, positions, clusterLabels, probPositive };
}

// ============================================================================
// Conversion to existing trainingMovieData format
// ============================================================================

/**
 * Convert parsed GLB data + sidecar metadata into the existing
 * `{ epoch_key: { coords: [...], entire_cluster_results: {...} } }` format
 * consumed by load_training_movie(), Canvas2DFallback, etc.
 *
 * Also returns the sidecar's session_cluster_results and training_metrics
 * so the caller can merge them into the main data flow.
 */
export function glbToTrainingMovieData(
    glb: ParsedGLB,
    sidecar: GLBSidecar | null
): {
    epoch_projections: Record<string, any>;
    training_metrics: any;
    session_cluster_results: Record<string, any> | null;
} {
    const { metadata, positions, clusterLabels, probPositive } = glb;
    const { num_epochs, num_points, epoch_keys, cluster_k_values } = metadata;

    // Build row_ids lookup from sidecar (or default to index)
    const rowIds = sidecar?.point_metadata?.row_ids;
    const sourceData = sidecar?.point_metadata?.source_data;

    const epoch_projections: Record<string, any> = {};

    for (let epochIdx = 0; epochIdx < num_epochs; epochIdx++) {
        const epochKey = epoch_keys[epochIdx];
        const posBase = epochIdx * num_points * 3;

        // Build coords array for this epoch
        const coords: any[] = new Array(num_points);
        for (let i = 0; i < num_points; i++) {
            const x = positions[posBase + i * 3];
            const y = positions[posBase + i * 3 + 1];
            const z = positions[posBase + i * 3 + 2];

            const coord: any = {
                0: x,
                1: y,
                2: z,
                __featrix_row_offset: i,
                __featrix_row_id: rowIds ? rowIds[i] : i,
            };

            // Attach source_data from sidecar if available
            if (sourceData && sourceData[i]) {
                const sd = sourceData[i];
                // Split into scalar/set/string columns matching existing format
                const scalar_columns: Record<string, number> = {};
                const set_columns: Record<string, string> = {};
                const string_columns: Record<string, string> = {};

                for (const [k, v] of Object.entries(sd)) {
                    if (typeof v === 'number') {
                        scalar_columns[k] = v;
                    } else if (typeof v === 'string') {
                        if (v.length > 100) {
                            string_columns[k] = v;
                        } else {
                            set_columns[k] = v;
                        }
                    }
                }

                coord.scalar_columns = scalar_columns;
                coord.set_columns = set_columns;
                coord.string_columns = string_columns;
                coord.source_data = sd;
            }

            // Attach prob_positive if present
            if (probPositive) {
                coord.prob_positive = probPositive[epochIdx * num_points + i];
            }

            coords[i] = coord;
        }

        // Build per-epoch cluster results from packed labels
        let entire_cluster_results: Record<string, any> = {};
        if (clusterLabels && cluster_k_values) {
            for (let kIdx = 0; kIdx < cluster_k_values.length; kIdx++) {
                const k = cluster_k_values[kIdx];
                const labelsBase = (kIdx * num_epochs + epochIdx) * num_points;
                const labels: number[] = new Array(num_points);
                for (let i = 0; i < num_points; i++) {
                    labels[i] = clusterLabels[labelsBase + i];
                }
                entire_cluster_results[String(k)] = { cluster_labels: labels };
            }
        }

        // Also assign cluster_pre from the best k's labels
        if (clusterLabels && cluster_k_values && cluster_k_values.length > 0) {
            // Use the largest k value as cluster_pre (matches existing behavior)
            const bestKIdx = cluster_k_values.length - 1;
            const bestK = cluster_k_values[bestKIdx];
            const labelsBase = (bestKIdx * num_epochs + epochIdx) * num_points;
            for (let i = 0; i < num_points; i++) {
                coords[i].cluster_pre = clusterLabels[labelsBase + i];
            }
        }

        epoch_projections[epochKey] = {
            coords,
            entire_cluster_results,
        };
    }

    // Training metrics from sidecar
    let training_metrics = sidecar?.training_metrics || null;

    // Session-level cluster results from sidecar
    const session_cluster_results = sidecar?.session_cluster_results || null;

    const totalCoords = num_epochs * num_points;
    console.log(`📦 GLB → trainingMovieData: ${num_epochs} epochs, ${num_points} points/epoch, ${totalCoords} total coords`);

    return { epoch_projections, training_metrics, session_cluster_results };
}
