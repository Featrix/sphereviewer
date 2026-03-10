# Sphere Viewer — Data Integrity & Rendering Safety

How the sphere viewer ensures the user sees correct, accurate data.

## 1. Coordinate Validation

Every point is validated before rendering. `extractCoordinates()` (`featrix_sphere_control.ts:234-268`) checks that coords aren't null, handles multiple formats (array `[x,y,z]`, object `{x,y,z}`, numeric keys), and rejects anything where x/y/z isn't a finite number:

```ts
if (typeof x !== 'number' || isNaN(x) || ...) return null;
```

## 2. WebGL Detection & Fallback Chain

Three layers of protection against rendering nothing:

- **Pre-fetch detection** (`FeatrixSphereEmbedded.tsx:64-75`) — `isWebGLAvailable()` probes `webgl2`/`webgl` before downloading 30MB+ of data. Shows a full-screen error overlay with troubleshooting steps if unavailable.
- **Initialization catch** (`FeatrixSphereEmbedded.tsx:610-616`) — `initialize_sphere()` wrapped in try/catch; failures trigger a Canvas2D fallback renderer.
- **Canvas2D fallback** (`FeatrixSphereEmbedded.tsx:295-557`) — Complete software renderer with its own projection, rotation, and cluster coloring. Uses uniform `Math.min(w,h)` scale to avoid distortion.

## 3. Container Size Safety

- `fit_sphere_to_container()` (`featrix_sphere_control.ts:509-549`) falls back to 500px if height is 0, and only updates the renderer when dimensions change by >0.5px (prevents black flashes from redundant `setSize` calls).
- `ResizeObserver` on both WebGL and Canvas2D paths, with proper `disconnect()` cleanup on unmount.

## 4. Data Fetch Resilience

- **Exponential backoff retry** (`embed-data-access.ts:65-173`) — retries on 5xx, network errors, and timeouts up to 10 minutes, with delays from 1s to 60s.
- **Abort controller timeout** — every fetch gets an `AbortController` so it can't hang indefinitely.
- **Safe JSON parsing** — `safeJsonParse()` catches non-JSON responses and surfaces a preview of what was received.
- **GLB binary validation** — magic bytes, version, chunk types, and buffer sizes all validated before any data is used.
- **Progress feedback** — byte-level download progress, "still loading" message after 10s, retry countdown displayed to user.

## 5. Epoch & Cluster Consistency

- **Epoch sorting** (`featrix_sphere_control.ts:1362-1365`) — epochs sorted numerically by `parseInt(key.replace('epoch_', ''))` so frames always play in correct order.
- **Record tracking** — `__featrix_row_offset` and `__featrix_row_id` track individual points across epochs with multiple fallback lookup strategies.
- **Cluster label chain** — tries server cluster results first, then `__featrix_cluster`, then `featrix_meta.cluster_pre`, then defaults to 0.
- **Client-side k-means fallback** — if no server cluster results exist, runs k-means++ clustering locally with validated point counts.

## 6. localStorage Safety

All reads and writes are wrapped in try/catch (`FeatrixSphereEmbedded.tsx:30-47`). Disabled/full/corrupted localStorage silently falls back to defaults — never crashes.

## 7. Resource Cleanup

Every `useEffect` returns cleanup that cancels `requestAnimationFrame`, disconnects `ResizeObserver`, removes event listeners, clears timeouts/intervals, and stops training movie playback. Sprite textures are cached singletons (never disposed, never leaked).

## 8. User-Facing Error Messages

Error formatting (`FeatrixSphereEmbedded.tsx:2621-2667`) categorizes errors (timeout, server, network) and translates them into actionable guidance like "Try refreshing in a few minutes" rather than showing raw stack traces. Build timestamp is shown on error screens for debugging.
