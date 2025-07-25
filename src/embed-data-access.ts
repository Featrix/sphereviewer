// Simplified data access for embeddable version
export async function fetch_session_data(session_id: string, apiBaseUrl?: string) {
    const baseUrl = apiBaseUrl || 'https://sphere-api.featrix.com';
    const data_raw = await fetch(`${baseUrl}/compute/session/${session_id}`);

    const data = await data_raw.json();
    return data;
}

export async function fetch_session_projections(session_id: string, apiBaseUrl?: string) {
    const baseUrl = apiBaseUrl || 'https://sphere-api.featrix.com';
    const data_raw = await fetch(`${baseUrl}/compute/session/${session_id}/projections`);
    const data = await data_raw.json();
    return data.projections;
}

export async function fetch_training_metrics(session_id: string, apiBaseUrl?: string) {
    const baseUrl = apiBaseUrl || 'https://sphere-api.featrix.com';
    
    // Fetch epoch projections (3D coordinates) - CRITICAL for training movie
    const projectionsResponse = await fetch(`${baseUrl}/compute/session/${session_id}/epoch_projections`);
    const projectionsData = await projectionsResponse.json();
    
    // Also fetch training metrics (loss data) for the 3D loss plot
    let trainingMetrics = null;
    try {
        const metricsResponse = await fetch(`${baseUrl}/compute/session/${session_id}/training_metrics`);
        if (metricsResponse.ok) {
            trainingMetrics = await metricsResponse.json();
        }
    } catch (error) {
        console.warn('Training metrics unavailable:', error);
    }
    
    // Combine both datasets
    return {
        ...projectionsData,
        training_metrics: trainingMetrics
    };
} 