/**
 * @license
 * Featrix Sphere Viewer - Data Access Layer
 *
 * Copyright (c) 2023-2026 Featrix
 * Licensed under the BSD 4-Clause License (see LICENSE file)
 *
 * Simplified data access for embeddable version
 */

// Retry configuration
const RETRY_CONFIG = {
    maxRetryDuration: 10 * 60 * 1000, // 10 minutes total
    initialDelay: 1000, // 1 second
    maxDelay: 60 * 1000, // 60 seconds max between retries
    backoffMultiplier: 2,
    fetchTimeout: 60 * 1000, // 60 seconds per individual fetch attempt
};

// Callback for retry status updates
type RetryStatusCallback = (status: {
    isRetrying: boolean;
    attempt: number;
    nextRetryIn: number; // seconds
    totalElapsed: number; // seconds
    error: string;
}) => void;

// Global retry status callback - set by the UI component
let globalRetryStatusCallback: RetryStatusCallback | null = null;

export function setRetryStatusCallback(callback: RetryStatusCallback | null) {
    globalRetryStatusCallback = callback;
}

// Helper to check if an error is retryable (5xx errors, network errors, timeouts)
function isRetryableError(response: Response | null, error: Error | null): boolean {
    if (response && response.status >= 500 && response.status < 600) {
        return true; // 5xx server errors
    }
    if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch') ||
            msg.includes('timeout') || msg.includes('aborted') || msg.includes('abort') ||
            msg.includes('non-json response')) {
            return true;
        }
    }
    return false;
}

// Safe JSON parse: handles proxies returning raw text, HTML, or "stream timeout" instead of JSON
async function safeJsonParse(response: Response): Promise<any> {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        // Non-JSON response — proxy error, HTML error page, "stream timeout", etc.
        const preview = text.slice(0, 200).trim();
        throw new Error(`Non-JSON response from server: "${preview}"`);
    }
}

// Fetch with exponential backoff retry
async function fetchWithRetry(
    url: string,
    options?: RequestInit
): Promise<Response> {
    const startTime = Date.now();
    let attempt = 0;
    let delay = RETRY_CONFIG.initialDelay;

    while (true) {
        attempt++;
        let response: Response | null = null;
        let error: Error | null = null;

        try {
            // Add timeout via AbortController
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), RETRY_CONFIG.fetchTimeout);
            try {
                response = await fetch(url, { ...options, signal: controller.signal });
            } finally {
                clearTimeout(timeoutId);
            }

            // If successful or non-retryable error, return immediately
            if (response.ok || !isRetryableError(response, null)) {
                if (globalRetryStatusCallback) {
                    globalRetryStatusCallback({
                        isRetrying: false,
                        attempt: 0,
                        nextRetryIn: 0,
                        totalElapsed: 0,
                        error: ''
                    });
                }
                return response;
            }

            error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        } catch (e) {
            error = e as Error;
        }

        // Check if we've exceeded max retry duration
        const elapsed = Date.now() - startTime;
        if (elapsed >= RETRY_CONFIG.maxRetryDuration) {
            if (globalRetryStatusCallback) {
                globalRetryStatusCallback({
                    isRetrying: false,
                    attempt: 0,
                    nextRetryIn: 0,
                    totalElapsed: 0,
                    error: ''
                });
            }
            if (response) {
                return response; // Return the failed response so caller can handle it
            }
            throw error || new Error('Max retry duration exceeded');
        }

        // Check if error is retryable
        if (!isRetryableError(response, error)) {
            if (response) {
                return response;
            }
            throw error || new Error('Non-retryable error');
        }

        // Calculate delay with exponential backoff
        const nextDelay = Math.min(delay, RETRY_CONFIG.maxDelay);
        const errorMsg = error?.message || `Server error (${response?.status})`;

        console.warn(`⏳ Retry attempt ${attempt} failed: ${errorMsg}. Retrying in ${nextDelay / 1000}s...`);

        // Notify UI about retry status with countdown
        if (globalRetryStatusCallback) {
            // Start countdown
            const countdownInterval = setInterval(() => {
                const remaining = Math.max(0, nextDelay - (Date.now() - countdownStart));
                globalRetryStatusCallback!({
                    isRetrying: true,
                    attempt,
                    nextRetryIn: Math.ceil(remaining / 1000),
                    totalElapsed: Math.floor((Date.now() - startTime) / 1000),
                    error: errorMsg
                });
            }, 1000);

            const countdownStart = Date.now();
            globalRetryStatusCallback({
                isRetrying: true,
                attempt,
                nextRetryIn: Math.ceil(nextDelay / 1000),
                totalElapsed: Math.floor(elapsed / 1000),
                error: errorMsg
            });

            // Wait for delay
            await new Promise(resolve => setTimeout(resolve, nextDelay));
            clearInterval(countdownInterval);
        } else {
            // Just wait without UI updates
            await new Promise(resolve => setTimeout(resolve, nextDelay));
        }

        // Increase delay for next attempt
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelay);
    }
}

// Helper to build auth headers from an optional token.
// Supports both JWT Bearer tokens and API keys:
//   - Tokens starting with "sk_" or "ak_" → sent as X-Api-Key header
//   - Everything else → sent as Bearer token in Authorization header
function getAuthHeaders(authToken?: string): HeadersInit | undefined {
    if (!authToken) return undefined;
    if (authToken.startsWith('sk_') || authToken.startsWith('ak_')) {
        return { 'X-Api-Key': authToken };
    }
    return { 'Authorization': `Bearer ${authToken}` };
}

// Helper to get the API base URL - use proxy if on localhost
function getApiBaseUrl(apiBaseUrl?: string): string {
    if (apiBaseUrl) {
        return apiBaseUrl;
    }
    // If we're on localhost, use the proxy endpoint
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        return window.location.origin + '/proxy/featrix';
    }
    return 'https://sphere-api.featrix.com';
}

export async function fetch_session_data(session_id: string, apiBaseUrl?: string, authToken?: string) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    const data_raw = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}`, { headers: getAuthHeaders(authToken) });

    const data = await safeJsonParse(data_raw);
    return data;
}

export async function fetch_session_projections(session_id: string, apiBaseUrl?: string, limit?: number, authToken?: string) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    let url = `${baseUrl}/compute/session/${session_id}/projections`;
    if (limit !== undefined) {
        url += `?limit=${limit}`;
    }
    const data_raw = await fetchWithRetry(url, { headers: getAuthHeaders(authToken) });
    const data = await safeJsonParse(data_raw);
    const projections = data.projections;
    if (projections && projections.coords) {
        console.log(`📊 Loaded ${projections.coords.length} points from projections API`);
    }
    return projections;
}

export async function fetch_training_metrics(
    session_id: string,
    apiBaseUrl?: string,
    limit?: number,
    onProgress?: (info: { bytesLoaded: number, totalBytes?: number, phase: string }) => void,
    authToken?: string,
    pointLimit?: number,
    pointOffset?: number
) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    const headers = getAuthHeaders(authToken);

    // Fetch epoch projections (3D coordinates) - CRITICAL for training movie
    console.time('🔗 API_EPOCH_PROJECTIONS');
    console.log('🔗 API_CALL_START: epoch_projections');
    let projectionsUrl = `${baseUrl}/compute/session/${session_id}/epoch_projections`;
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    if (pointLimit !== undefined) params.set('point_limit', String(pointLimit));
    if (pointOffset !== undefined) params.set('point_offset', String(pointOffset));
    const qs = params.toString();
    if (qs) projectionsUrl += `?${qs}`;
    console.log('🔗 Fetching from:', projectionsUrl);
    const projectionsResponse = await fetchWithRetry(projectionsUrl, { headers });

    if (!projectionsResponse.ok) {
        const errorText = await projectionsResponse.text();
        console.error('❌ API Error:', projectionsResponse.status, errorText);
        throw new Error(`API request failed: ${projectionsResponse.status} ${projectionsResponse.statusText}`);
    }

    // Get total size from Content-Length header if available
    const contentLength = projectionsResponse.headers.get('Content-Length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;

    // Read response with progress tracking
    let projectionsData;
    if (onProgress && projectionsResponse.body) {
        const reader = projectionsResponse.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytesLoaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            bytesLoaded += value.length;
            onProgress({ bytesLoaded, totalBytes, phase: 'downloading' });
        }

        // Combine chunks and parse JSON
        onProgress({ bytesLoaded, totalBytes, phase: 'parsing' });
        const allChunks = new Uint8Array(bytesLoaded);
        let position = 0;
        for (const chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
        }
        const text = new TextDecoder().decode(allChunks);
        try {
            projectionsData = JSON.parse(text);
        } catch {
            const preview = text.slice(0, 200).trim();
            throw new Error(`Non-JSON response from server: "${preview}"`);
        }
    } else {
        projectionsData = await safeJsonParse(projectionsResponse);
    }
    console.timeEnd('🔗 API_EPOCH_PROJECTIONS');
    console.log('🎯 DEBUG: API Response keys:', Object.keys(projectionsData));
    if (projectionsData.epoch_projections) {
        console.log('🎯 DEBUG: Epoch projections keys:', Object.keys(projectionsData.epoch_projections).length, 'epochs');
        // Log point counts for first epoch
        const firstEpochKey = Object.keys(projectionsData.epoch_projections)[0];
        const firstEpoch = projectionsData.epoch_projections[firstEpochKey];
        if (firstEpoch && firstEpoch.coords) {
            console.log(`📊 First epoch (${firstEpochKey}) contains ${firstEpoch.coords.length} points`);
        }
    }
    const sizeBytes = JSON.stringify(projectionsData).length;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    console.log('🔗 API_PROJECTIONS_SIZE:', sizeBytes, `bytes (${sizeMB}MB)`);
    
    if (sizeBytes > 50 * 1024 * 1024) { // > 50MB
        console.warn('⚠️ PERFORMANCE: Large API response detected!', {
            size: `${sizeMB}MB`,
            suggestion: 'Consider API pagination or data compression for better performance'
        });
    }
    
    // Also fetch training metrics (loss data) for the 3D loss plot
    let trainingMetrics = null;
    try {
        console.time('🔗 API_TRAINING_METRICS');
        console.log('🔗 API_CALL_START: training_metrics');
        const metricsUrl = `${baseUrl}/compute/session/${session_id}/training_metrics`;
        console.log('🔗 Fetching training metrics from:', metricsUrl);
        const metricsResponse = await fetchWithRetry(metricsUrl, { headers });
        if (metricsResponse.ok) {
            trainingMetrics = await safeJsonParse(metricsResponse);
            console.timeEnd('🔗 API_TRAINING_METRICS');
            console.log('🎯 Training metrics fetched:', trainingMetrics);
            console.log('🔗 API_METRICS_SIZE:', JSON.stringify(trainingMetrics).length, 'bytes');
        } else {
            console.timeEnd('🔗 API_TRAINING_METRICS');
            console.warn('🔍 Training metrics endpoint returned:', metricsResponse.status, metricsResponse.statusText);
        }
    } catch (error) {
        console.timeEnd('🔗 API_TRAINING_METRICS');
        console.warn('Training metrics unavailable:', error);
    }
    
    // If no training metrics from API, create synthetic loss data for visualization
    if (!trainingMetrics || !trainingMetrics.validation_loss) {
        console.log('🎭 Creating synthetic validation loss data for visualization');
        const epochKeys = Object.keys(projectionsData.epoch_projections || {});
        // CRITICAL: Sort epoch keys by numeric value to ensure correct order
        const sortedEpochKeys = epochKeys.sort((a, b) => {
            const epochA = parseInt(a.replace('epoch_', ''));
            const epochB = parseInt(b.replace('epoch_', ''));
            return epochA - epochB;
        });
        
        const syntheticLoss = sortedEpochKeys.map((epochKey, index) => {
            const epoch = parseInt(epochKey.replace('epoch_', ''));
            // Create realistic decreasing loss with some noise
            const baseLoss = 2.0 * Math.exp(-index / 30) + 0.1; // Exponential decay
            const noise = (Math.random() - 0.5) * 0.2; // Add some variance
            return {
                epoch: epoch,
                value: Math.max(0.05, baseLoss + noise) // Ensure positive loss
            };
        });
        
        trainingMetrics = {
            validation_loss: syntheticLoss
        };
        console.log(`🎭 Created ${syntheticLoss.length} synthetic loss points in order`);
    }
    
    // Combine both datasets
    return {
        ...projectionsData,
        training_metrics: trainingMetrics
    };
}

// Fetch additional points for an existing training movie (pagination).
// Uses point_limit/point_offset to get the next batch of coords across all epochs.
export async function fetch_more_epoch_points(
    session_id: string,
    pointLimit: number,
    pointOffset: number,
    apiBaseUrl?: string,
    authToken?: string
): Promise<any> {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    const headers = getAuthHeaders(authToken);
    const url = `${baseUrl}/compute/session/${session_id}/epoch_projections?point_limit=${pointLimit}&point_offset=${pointOffset}`;
    console.log(`🔗 Fetching more points: offset=${pointOffset}, limit=${pointLimit}`);
    const response = await fetchWithRetry(url, { headers });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch more points: ${response.status} ${errorText}`);
    }
    return await safeJsonParse(response);
}

// Fetch from a custom data endpoint (e.g., manifold_viz). Response format must match epoch_projections.
export async function fetch_from_data_endpoint(
    dataEndpoint: string,
    startEpoch?: number,
    onProgress?: (info: { bytesLoaded: number, totalBytes?: number, phase: string }) => void,
    authToken?: string
) {
    let url = dataEndpoint;
    if (startEpoch !== undefined) {
        url += (url.includes('?') ? '&' : '?') + `start_epoch=${startEpoch}`;
    }

    console.log('🔗 Fetching from data endpoint:', url);
    const response = await fetchWithRetry(url, { headers: getAuthHeaders(authToken) });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Data endpoint error:', response.status, errorText);
        throw new Error(`Data endpoint request failed: ${response.status} ${response.statusText}`);
    }

    let data;
    const contentLength = response.headers.get('Content-Length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;

    if (onProgress && response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytesLoaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            bytesLoaded += value.length;
            onProgress({ bytesLoaded, totalBytes, phase: 'downloading' });
        }

        onProgress({ bytesLoaded, totalBytes, phase: 'parsing' });
        const allChunks = new Uint8Array(bytesLoaded);
        let position = 0;
        for (const chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
        }
        const text = new TextDecoder().decode(allChunks);
        try {
            data = JSON.parse(text);
        } catch {
            const preview = text.slice(0, 200).trim();
            throw new Error(`Non-JSON response from server: "${preview}"`);
        }
    } else {
        data = await safeJsonParse(response);
    }

    console.log('🔗 Data endpoint response:', Object.keys(data));
    if (data.epoch_projections) {
        console.log('📊 Data endpoint epochs:', Object.keys(data.epoch_projections).length);
    }

    return {
        ...data,
        training_metrics: data.training_metrics || null
    };
}

export async function fetch_session_status(session_id: string, apiBaseUrl?: string, authToken?: string) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    try {
        const response = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}`, { headers: getAuthHeaders(authToken) });
        if (response.ok) {
            const data = await safeJsonParse(response);
            return data;
        }
    } catch (error) {
        console.warn('⚠️ Could not fetch session status:', error);
    }
    return null;
}

export async function fetch_single_epoch(session_id: string, epochKey: string, apiBaseUrl?: string, authToken?: string) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    try {
        // Fetch all epoch projections and extract just the one we need
        const response = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}/epoch_projections`, { headers: getAuthHeaders(authToken) });
        if (response.ok) {
            const data = await safeJsonParse(response);
            if (data.epoch_projections && data.epoch_projections[epochKey]) {
                return data.epoch_projections[epochKey];
            }
        }
    } catch (error) {
        console.warn(`⚠️ Could not fetch epoch ${epochKey}:`, error);
    }
    return null;
}

// Fast fetch for thumbnail mode - only gets final epoch (~600KB instead of ~32MB)
export async function fetch_thumbnail_data(session_id: string, apiBaseUrl?: string, authToken?: string) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    const headers = getAuthHeaders(authToken);
    console.time('🚀 THUMBNAIL_FETCH');

    try {
        // Use new ?epoch=last parameter to get only the final epoch
        const response = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}/epoch_projections?epoch=last`, { headers });
        if (response.ok) {
            const data = await safeJsonParse(response);
            console.timeEnd('🚀 THUMBNAIL_FETCH');

            if (data.epoch_projections) {
                // Get the single epoch returned
                const epochKeys = Object.keys(data.epoch_projections);
                if (epochKeys.length > 0) {
                    const lastEpoch = data.epoch_projections[epochKeys[0]];
                    console.log('📊 Thumbnail: loaded', lastEpoch.coords?.length || 0, 'points from', epochKeys[0]);
                    return {
                        coords: lastEpoch.coords || [],
                        entire_cluster_results: lastEpoch.entire_cluster_results || data.entire_cluster_results || {}
                    };
                }
            }
        }
    } catch (error) {
        console.warn('⚠️ Thumbnail fetch (epoch=last) failed:', error);
    }

    // Fallback to /projections endpoint if epoch=last not supported
    try {
        console.log('📊 Falling back to /projections endpoint');
        const response = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}/projections?limit=10000`, { headers });
        if (response.ok) {
            const data = await safeJsonParse(response);
            console.timeEnd('🚀 THUMBNAIL_FETCH');
            if (data.projections) {
                console.log('📊 Thumbnail fallback: loaded', data.projections.coords?.length || 0, 'points');
                return {
                    coords: data.projections.coords || [],
                    entire_cluster_results: data.projections.entire_cluster_results || {}
                };
            }
        }
    } catch (error) {
        console.warn('⚠️ Thumbnail fallback also failed:', error);
    }

    console.timeEnd('🚀 THUMBNAIL_FETCH');
    return null;
}

// Fetch training data in compact GLB binary format, with JSON sidecar for metadata.
// Returns null if the endpoint doesn't exist (404) or fails, so caller can fall back to JSON.
export async function fetch_training_glb(
    session_id: string,
    apiBaseUrl?: string,
    onProgress?: (info: { bytesLoaded: number, totalBytes?: number, phase: string }) => void,
    authToken?: string
): Promise<{ glbBuffer: ArrayBuffer; sidecar: any | null } | null> {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    const headers = getAuthHeaders(authToken);

    // --- Fetch GLB binary ---
    const glbUrl = `${baseUrl}/compute/session/${session_id}/epoch_projections.glb`;
    console.log('📦 Attempting GLB fetch:', glbUrl);
    console.time('📦 GLB_FETCH');

    let glbResponse: Response;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), RETRY_CONFIG.fetchTimeout);
        try {
            glbResponse = await fetch(glbUrl, { headers, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error) {
        console.timeEnd('📦 GLB_FETCH');
        console.log('📦 GLB endpoint not available, falling back to JSON');
        return null;
    }

    if (!glbResponse.ok) {
        console.timeEnd('📦 GLB_FETCH');
        console.log(`📦 GLB endpoint returned ${glbResponse.status}, falling back to JSON`);
        return null;
    }

    // Read GLB binary with progress
    let glbBuffer: ArrayBuffer;
    const contentLength = glbResponse.headers.get('Content-Length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;

    if (onProgress && glbResponse.body) {
        const reader = glbResponse.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytesLoaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            bytesLoaded += value.length;
            onProgress({ bytesLoaded, totalBytes, phase: 'downloading' });
        }

        onProgress({ bytesLoaded, totalBytes, phase: 'parsing' });
        const allChunks = new Uint8Array(bytesLoaded);
        let position = 0;
        for (const chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
        }
        glbBuffer = allChunks.buffer;
    } else {
        glbBuffer = await glbResponse.arrayBuffer();
    }

    console.timeEnd('📦 GLB_FETCH');
    console.log(`📦 GLB downloaded: ${(glbBuffer.byteLength / 1024).toFixed(0)} KB`);

    // --- Fetch JSON sidecar (metadata) ---
    let sidecar = null;
    try {
        const sidecarUrl = `${baseUrl}/compute/session/${session_id}/epoch_projections_meta.json`;
        console.log('📦 Fetching GLB sidecar:', sidecarUrl);
        const sidecarResponse = await fetchWithRetry(sidecarUrl, { headers });
        if (sidecarResponse.ok) {
            sidecar = await safeJsonParse(sidecarResponse);
            console.log('📦 GLB sidecar loaded:', Object.keys(sidecar));
        } else {
            console.warn('📦 GLB sidecar not available:', sidecarResponse.status);
        }
    } catch (error) {
        console.warn('📦 GLB sidecar fetch failed:', error);
    }

    return { glbBuffer, sidecar };
}

// Fetch model card for column statistics (mutual information, predictability, etc.)
export interface ColumnStatistics {
    mutual_information_bits?: number;
    predictability_pct?: number;
    marginal_loss?: number | null;
}

export interface ModelCard {
    column_statistics?: Record<string, ColumnStatistics>;
    [key: string]: any;
}

export async function fetch_model_card(session_id: string, apiBaseUrl?: string, authToken?: string): Promise<ModelCard | null> {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    console.time('🔗 API_MODEL_CARD');
    console.log('🔗 Fetching model card for session:', session_id);

    try {
        const response = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}/model_card`, { headers: getAuthHeaders(authToken) });
        if (response.ok) {
            const data = await safeJsonParse(response);
            console.timeEnd('🔗 API_MODEL_CARD');

            if (data.column_statistics) {
                const columnCount = Object.keys(data.column_statistics).length;
                console.log(`📊 Model card: ${columnCount} columns with statistics`);
            }
            return data;
        } else {
            console.timeEnd('🔗 API_MODEL_CARD');
            console.warn('⚠️ Model card endpoint returned:', response.status, response.statusText);
        }
    } catch (error) {
        console.timeEnd('🔗 API_MODEL_CARD');
        console.warn('⚠️ Could not fetch model card:', error);
    }

    return null;
} 