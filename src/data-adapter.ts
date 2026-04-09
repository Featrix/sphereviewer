/**
 * Converts the clean public ProjectionData type into the internal server
 * data format that the viewer's rendering pipeline expects.
 */
import type { ProjectionData, ClusterResults } from './types';

/** Detect if data is already in internal server format (has __featrix_row_id) */
function isInternalFormat(data: any): boolean {
    if (!data) return false;
    // Check coords array for internal keys
    const coords = data.coords || data.epoch_projections?.[Object.keys(data.epoch_projections || {})[0]]?.coords;
    if (Array.isArray(coords) && coords.length > 0) {
        const first = coords[0];
        return '__featrix_row_id' in first || '__featrix_row_offset' in first || '0' in first;
    }
    // Has epoch_projections or session keys = internal format
    if (data.epoch_projections || data.session) return true;
    return false;
}

/** Convert ClusterResults to internal entire_cluster_results format */
function convertClusters(clusters: ClusterResults): any {
    const result: any = {};
    for (const k of Object.keys(clusters)) {
        result[k] = {
            cluster_labels: clusters[k].labels,
            score: clusters[k].score,
        };
    }
    return result;
}

/** Convert a PointCoord[] to internal coord format */
function convertCoords(coords: ProjectionData['coords']): any[] {
    if (!coords) return [];
    return coords.map(c => ({
        x: c.x,
        y: c.y,
        z: c.z,
        __featrix_row_id: c.rowId,
        __featrix_row_offset: c.rowOffset,
        cluster_pre: c.cluster ?? 0,
        scalar_columns: {},
        set_columns: {},
        string_columns: {},
    }));
}

/**
 * Convert ProjectionData to the internal format expected by the viewer.
 * If the data is already in internal format, returns it as-is.
 */
export function convertProjectionData(data: ProjectionData | any): any {
    if (!data) return data;

    // Already internal format — pass through
    if (isInternalFormat(data)) return data;

    // Single-frame mode
    if (data.coords && !data.epochs) {
        const result: any = {
            coords: convertCoords(data.coords),
        };
        if (data.clusters) {
            result.entire_cluster_results = convertClusters(data.clusters);
        }
        return result;
    }

    // Multi-frame / training movie mode
    if (data.epochs) {
        const epoch_projections: any = {};
        let clusterResults: any = null;

        for (const [key, frame] of Object.entries(data.epochs as Record<string, any>)) {
            epoch_projections[key] = {
                coords: convertCoords(frame.coords),
            };
            if (frame.clusters) {
                epoch_projections[key].entire_cluster_results = convertClusters(frame.clusters);
            }
            // Use first epoch's clusters as session-level if not set
            if (!clusterResults && frame.clusters) {
                clusterResults = convertClusters(frame.clusters);
            }
        }

        // Also check top-level clusters
        if (data.clusters) {
            clusterResults = convertClusters(data.clusters);
        }

        return {
            epoch_projections,
            entire_cluster_results: clusterResults || {},
        };
    }

    // Unrecognized shape — pass through and hope for the best
    return data;
}
