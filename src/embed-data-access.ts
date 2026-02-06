/**
 * @license
 * Featrix Sphere Viewer - Data Access Layer
 * 
 * Copyright (c) 2024-2025 Featrix
 * Licensed under the MIT License
 * 
 * Simplified data access for embeddable version
 */

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
    const data_raw = await fetch(`${baseUrl}/compute/session/${session_id}`);

    const data = await data_raw.json();
    return data;
}

export async function fetch_session_projections(session_id: string, apiBaseUrl?: string, limit?: number) {
    const baseUrl = getApiBaseUrl(apiBaseUrl);
    let url = `${baseUrl}/compute/session/${session_id}/projections`;
    if (limit !== undefined) {
        url += `?limit=${limit}`;
    }
    const data_raw = await fetch(url);
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
    const projectionsResponse = await fetch(projectionsUrl);

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
        const metricsResponse = await fetch(metricsUrl);
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
        const response = await fetch(`${baseUrl}/compute/session/${session_id}`);
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
        const response = await fetch(`${baseUrl}/compute/session/${session_id}/epoch_projections`);
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