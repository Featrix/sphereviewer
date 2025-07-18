export async function fetch_session_data(session_id: string) {
    const data_raw = await fetch(`https://sphere-api.featrix.com/compute/session/${session_id}`)
    console.log("data raw:", data_raw)
    const data = await data_raw.json()
  
    return data
  }
  
export async function fetch_session_projections(session_id: string) {
    const data_raw = await fetch(`https://sphere-api.featrix.com/compute/session/${session_id}/projections`)
    const data = await data_raw.json()

    return data.projections
}