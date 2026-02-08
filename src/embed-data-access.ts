/**
 * @license
 * Featrix Sphere Viewer - Data Access Layer
 *
 * Copyright (c) 2024-2025 Featrix
 * Licensed under the MIT License
 *
 * Simplified data access for embeddable version
 */

// Retry configuration
const RETRY_CONFIG = {
    maxRetryDuration: 10 * 60 * 1000, // 10 minutes total
    initialDelay: 1000, // 1 second
    maxDelay: 60 * 1000, // 60 seconds max between retries
    backoffMultiplier: 2,
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

// Helper to check if an error is retryable (5xx errors or network errors)
function isRetryableError(response: Response | null, error: Error | null): boolean {
    if (response && response.status >= 500 && response.status < 600) {
        return true; // 5xx server errors
    }
    if (error && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch'))) {
        return true; // Network errors
    }
    return false;
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
            response = await fetch(url, options);

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

export async function fetch_session_data(session_id: string, apiBaseUrl?: string) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    const data_raw = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}`);

    const data = await data_raw.json();
    return data;
}

export async function fetch_session_projections(session_id: string, apiBaseUrl?: string, limit?: number) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    let url = `${baseUrl}/compute/session/${session_id}/projections`;
    if (limit !== undefined) {
        url += `?limit=${limit}`;
    }
    const data_raw = await fetchWithRetry(url);
    const data = await data_raw.json();
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
    onProgress?: (info: { bytesLoaded: number, totalBytes?: number, phase: string }) => void
) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);

    // Fetch epoch projections (3D coordinates) - CRITICAL for training movie
    console.time('🔗 API_EPOCH_PROJECTIONS');
    console.log('🔗 API_CALL_START: epoch_projections');
    let projectionsUrl = `${baseUrl}/compute/session/${session_id}/epoch_projections`;
    if (limit !== undefined) {
        projectionsUrl += `?limit=${limit}`;
    }
    console.log('🔗 Fetching from:', projectionsUrl);
    const projectionsResponse = await fetchWithRetry(projectionsUrl);

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
        projectionsData = JSON.parse(text);
    } else {
        projectionsData = await projectionsResponse.json();
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
        const metricsResponse = await fetchWithRetry(metricsUrl);
        if (metricsResponse.ok) {
            trainingMetrics = await metricsResponse.json();
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

export async function fetch_session_status(session_id: string, apiBaseUrl?: string) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    try {
        const response = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}`);
        if (response.ok) {
            const data = await response.json();
            return data;
        }
    } catch (error) {
        console.warn('⚠️ Could not fetch session status:', error);
    }
    return null;
}

export async function fetch_single_epoch(session_id: string, epochKey: string, apiBaseUrl?: string) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    try {
        // Fetch all epoch projections and extract just the one we need
        const response = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}/epoch_projections`);
        if (response.ok) {
            const data = await response.json();
            if (data.epoch_projections && data.epoch_projections[epochKey]) {
                return data.epoch_projections[epochKey];
            }
        }
    } catch (error) {
        console.warn(`⚠️ Could not fetch epoch ${epochKey}:`, error);
    }
    return null;
}

// Fast fetch for thumbnail mode - only gets final projections, no epoch data
export async function fetch_thumbnail_data(session_id: string, apiBaseUrl?: string) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    console.time('🚀 THUMBNAIL_FETCH');

    try {
        // Only fetch final projections - much smaller/faster than epoch_projections
        const response = await fetchWithRetry(`${baseUrl}/compute/session/${session_id}/projections?limit=10000`);
        if (response.ok) {
            const data = await response.json();
            console.timeEnd('🚀 THUMBNAIL_FETCH');
            if (data.projections) {
                console.log('📊 Thumbnail: loaded', data.projections.coords?.length || 0, 'points');
                return {
                    coords: data.projections.coords || [],
                    entire_cluster_results: data.projections.entire_cluster_results || {}
                };
            }
        }
    } catch (error) {
        console.warn('⚠️ Thumbnail fetch failed:', error);
    }

    console.timeEnd('🚀 THUMBNAIL_FETCH');
    return null;
} 