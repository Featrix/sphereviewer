// Simplified data access for embeddable version
export async function fetch_session_data(session_id: string, apiBaseUrl?: string) {
    const baseUrl = apiBaseUrl || 'https://sphere-api.featrix.com';
    const data_raw = await fetch(`${baseUrl}/compute/session/${session_id}`);
    console.log("data raw:", data_raw);
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
    // TRAINING MOVIE NEEDS 3D COORDINATES, NOT LOSS DATA!
    const data_raw = await fetch(`${baseUrl}/compute/session/${session_id}/epoch_projections`);
    const data = await data_raw.json();
    return data;
} 