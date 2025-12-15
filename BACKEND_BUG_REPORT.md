# Backend API Error Report

## Issue Summary
The Featrix API is returning a 500 Internal Server Error when requesting epoch projections for a specific session.

## Error Details

**Endpoint:** 
```
GET /compute/session/public-alphafreight-xxlarge-derived1-375e6c5d-985d-4ef6-9728-fadc2c82e06f/epoch_projections?limit=10000
```

**Full URL:**
```
https://sphere-api.featrix.com/compute/session/public-alphafreight-xxlarge-derived1-375e6c5d-985d-4ef6-9728-fadc2c82e06f/epoch_projections?limit=10000
```

**Response:**
- **Status Code:** 500 Internal Server Error
- **Response Body:** 
```json
{
  "compute_cluster": "taco",
  "error": "Internal server error"
}
```

## Request Details

- **Method:** GET
- **Session ID:** `public-alphafreight-xxlarge-derived1-375e6c5d-985d-4ef6-9728-fadc2c82e06f`
- **Query Parameter:** `limit=10000`
- **User-Agent:** FeatrixSphereViewer/1.0
- **Content-Type:** application/json

## Context

This request is being made from the Sphere Viewer frontend application when loading training movie data. The frontend is attempting to fetch epoch-by-epoch projection data for visualization.

The request is being proxied through a local development server (`localhost:8080/proxy/featrix/...`) to avoid CORS issues, but the error originates from the Featrix API backend.

## Expected Behavior

The endpoint should return epoch projection data in the format:
```json
{
  "epoch_projections": [
    {
      "epoch": 1,
      "coords": [...],
      ...
    },
    ...
  ]
}
```

## Actual Behavior

Returns 500 Internal Server Error with error message indicating an internal server error.

## Additional Notes

- **Important:** The frontend is NOT specifying any compute cluster in the request. The frontend only sends the session ID and query parameters.
- The error response includes `"compute_cluster": "taco"`, but this session should be routed to the "churro" compute cluster.
- This appears to be a **backend routing issue** - the API is routing the request to the wrong compute cluster ("taco" instead of "churro").
- The session ID appears to be a public/derived session
- The `limit=10000` parameter is being used to request all available epoch data

## Request to Backend Team

Please investigate:
1. **Routing Issue:** Why is this session being routed to "taco" compute cluster when it should be routed to "churro"?
2. Why this session's epoch_projections endpoint is returning a 500 error
3. Whether this is specific to this session ID or a broader routing issue
4. Check logs on both "taco" and "churro" compute clusters for more detailed error information
5. Verify if the session exists and has epoch projection data available on the correct cluster ("churro")

**Root Cause Hypothesis:** The backend routing logic is incorrectly determining which compute cluster should handle this session, causing it to route to "taco" instead of "churro", which then fails because the session data doesn't exist on that cluster.

## Reproduction Steps

1. Make GET request to the endpoint listed above
2. Observe 500 error response

## Environment

- **API Base URL:** https://sphere-api.featrix.com
- **Frontend:** Sphere Viewer (embeddable widget)
- **Request Origin:** Local development (proxied through localhost:8080)

