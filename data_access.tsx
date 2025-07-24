export async function fetch_session_data(session_id: string) {
    const data_raw = await fetch(`https://sphere-api.featrix.com/compute/session/${session_id}`)
    const data = await data_raw.json()
  
    return data
  }
  
export async function fetch_session_projections(session_id: string) {
    const data_raw = await fetch(`https://sphere-api.featrix.com/compute/session/${session_id}/projections`)
    const data = await data_raw.json()

    return data.projections
}

export async function fetch_training_metrics(session_id: string) {
    const data_raw = await fetch(`https://sphere-api.featrix.com/compute/session/${session_id}/training_metrics`)
    const data = await data_raw.json()
    
    return data
}