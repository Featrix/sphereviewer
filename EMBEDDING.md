# Embedding Sphere Viewer

## Minimal Example

Load React + the sphere viewer from CDN, pass a session ID:

```html
<!-- React (required) -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<!-- Sphere Viewer -->
<script
    src="https://bits.featrix.com/sv/sphere-viewer.js"
    data-session-id="YOUR-SESSION-ID"
></script>
```

That's it. It auto-creates a container div and initializes.

---

## Job Queue Dashboard (Many Spheres, Click to Zoom)

> **Tip:** Thumbnail mode now includes a built-in maximize button (bottom-right, appears on hover).
> You can use `onMaximize` to handle it with a custom callback, or let the default behavior
> enter browser fullscreen. The example below shows a fully custom approach for maximum control.

This is the pattern for embedding sphere thumbnails in a dashboard where each
job/session gets a small preview and the user can click to expand fullscreen.

### Jinja Template (`templates/job_queue.html`)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Job Queue</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #1a1025; color: #d0d0d0; font-family: monospace; }

        /* Sphere thumbnail - small inline preview */
        .sphere-thumb {
            width: 480px;
            height: 320px;
            border: 1px solid #333;
            border-radius: 8px;
            overflow: hidden;
            position: relative;
            cursor: pointer;
            display: inline-block;
        }

        /* Expand button overlay */
        .sphere-thumb .expand-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 100;
            background: rgba(0,0,0,0.6);
            border: 1px solid #555;
            color: #ddd;
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .sphere-thumb:hover .expand-btn { opacity: 1; }

        /* Fullscreen overlay */
        .sphere-fullscreen {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 10000;
            background: #1a1025;
        }
        .sphere-fullscreen.active { display: block; }
        .sphere-fullscreen .close-btn {
            position: absolute;
            top: 16px;
            right: 16px;
            z-index: 10001;
            background: rgba(200, 50, 50, 0.8);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .sphere-fullscreen .sphere-full-container {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>

    <!-- Job list - rendered by Flask/Jinja -->
    {% for job in jobs %}
    <div class="job-row">
        <div>{{ job.session_id }} - {{ job.status }}</div>

        <!-- Sphere thumbnail -->
        <div class="sphere-thumb" id="sphere-{{ loop.index }}">
            <button class="expand-btn"
                onclick="expandSphere('{{ job.session_id }}', 'sphere-{{ loop.index }}')">
                Maximize
            </button>
        </div>
    </div>
    {% endfor %}

    <!-- Fullscreen overlay (shared, reused for any sphere) -->
    <div class="sphere-fullscreen" id="sphere-fullscreen">
        <button class="close-btn" onclick="closeSphere()">Close</button>
        <div class="sphere-full-container" id="sphere-full-container"></div>
    </div>

    <!-- React + Sphere Viewer (load ONCE, not per sphere) -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://bits.featrix.com/sv/sphere-viewer.js"></script>

    <script>
        // Track all thumbnail viewers and the fullscreen viewer
        const thumbViewers = {};
        let fullViewer = null;

        // Initialize sphere thumbnails after page load
        document.addEventListener('DOMContentLoaded', () => {
            {% for job in jobs %}
            thumbViewers['sphere-{{ loop.index }}'] = new FeatrixSphereViewer();
            thumbViewers['sphere-{{ loop.index }}'].init({
                sessionId: '{{ job.session_id }}',
                containerId: 'sphere-{{ loop.index }}',
                isRotating: true,
                pointSize: 0.03,
                pointOpacity: 0.6,
            });
            {% endfor %}
        });

        // Expand a sphere to fullscreen
        function expandSphere(sessionId, thumbId) {
            // Clean up any previous fullscreen viewer
            if (fullViewer) {
                fullViewer.destroy();
            }

            // Show the overlay
            document.getElementById('sphere-fullscreen').classList.add('active');

            // Create a new full-size viewer in the overlay
            fullViewer = new FeatrixSphereViewer();
            fullViewer.init({
                sessionId: sessionId,
                containerId: 'sphere-full-container',
                isRotating: true,
                pointSize: 0.02,
                pointOpacity: 0.5,
            });
        }

        // Close fullscreen
        function closeSphere() {
            document.getElementById('sphere-fullscreen').classList.remove('active');
            if (fullViewer) {
                fullViewer.destroy();
                fullViewer = null;
            }
        }

        // ESC key closes fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeSphere();
        });
    </script>
</body>
</html>
```

### Flask Route

```python
@app.route('/jobs')
def job_queue():
    jobs = get_jobs()  # Your job/session list
    return render_template('job_queue.html', jobs=jobs)
```

### Lazy Loading (Recommended for 10+ Spheres)

Loading many spheres at once is expensive (each fetches ~32MB of epoch data).
Use IntersectionObserver to only load spheres when they scroll into view:

```javascript
// Replace the DOMContentLoaded block above with this:
document.addEventListener('DOMContentLoaded', () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const sessionId = el.dataset.sessionId;
                const id = el.id;

                if (!thumbViewers[id]) {
                    thumbViewers[id] = new FeatrixSphereViewer();
                    thumbViewers[id].init({
                        sessionId: sessionId,
                        containerId: id,
                        isRotating: true,
                        pointSize: 0.03,
                        pointOpacity: 0.6,
                    });
                }
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.sphere-thumb').forEach(el => {
        observer.observe(el);
    });
});
```

And add `data-session-id` to each thumbnail div:

```html
<div class="sphere-thumb"
     id="sphere-{{ loop.index }}"
     data-session-id="{{ job.session_id }}">
```

---

## API Proxy

On localhost the viewer auto-detects and expects a proxy at `/proxy/featrix/*`:

```python
import requests as req
from flask import request, Response

FEATRIX_API = 'https://sphere-api.featrix.com'

@app.route('/proxy/featrix/<path:path>', methods=['GET', 'POST'])
def featrix_proxy(path):
    resp = req.request(
        method=request.method,
        url=f'{FEATRIX_API}/{path}',
        params=request.args,
        headers={k: v for k, v in request.headers if k.lower() != 'host'},
        data=request.get_data(),
        timeout=60,
    )
    return Response(resp.content, status=resp.status_code,
                    content_type=resp.headers.get('content-type'))
```

To skip the proxy, set `data-api-base-url` or pass `apiBaseUrl` in JS:

```javascript
viewer.init({
    sessionId: '...',
    apiBaseUrl: 'https://sphere-api.featrix.com',
});
```

---

## Script Tag Attributes (Auto-Init Mode)

For the simple single-sphere case, everything can go on the script tag:

```html
<script
    src="https://bits.featrix.com/sv/sphere-viewer.js"
    data-session-id="YOUR-SESSION-ID"
    data-container-id="my-div"
    data-api-base-url="https://sphere-api.featrix.com"
    data-is-rotating="true"
    data-point-size="0.02"
    data-point-opacity="0.5"
></script>
```

| Attribute | Required | Default | Description |
|---|---|---|---|
| `data-session-id` | **yes** | -- | Featrix session ID to load |
| `data-container-id` | no | `sphere-viewer-container` | ID of the div to render into |
| `data-api-base-url` | no | auto-detect | Full URL to Featrix API |
| `data-width` | no | `100%` | Container width (e.g., `100%`, `800px`) |
| `data-height` | no | `500px` / fills parent | Container height (e.g., `100vh`, `100%`, `600px`) |
| `data-is-rotating` | no | `true` | Auto-rotate the sphere |
| `data-rotation-speed` | no | `0.1` | Rotation speed |
| `data-point-size` | no | `0.05` | Point size |
| `data-point-opacity` | no | `0.5` | Point opacity |
| `data-point-alpha` | no | `0.5` | Default point alpha/opacity (0–1) |
| `data-mode` | no | `full` | Display mode: `thumbnail` or `full` |
| `data-theme` | no | `dark` | Color theme: `dark` or `light` |
| `data-background-color` | no | -- | Custom background color |
| `data-colormap` | no | -- | Matplotlib colormap name (e.g., `viridis`, `tab10`) |
| `data-endpoint` | no | -- | Custom data endpoint URL |
| `data-auth-token` | no | -- | JWT bearer token for API auth |
| `data-on-maximize` | no | -- | Global function name for thumbnail maximize callback |

---

## JavaScript API Reference

```javascript
const viewer = new FeatrixSphereViewer();

// Initialize
viewer.init({
    sessionId: 'abc-123',
    containerId: 'my-div',
    apiBaseUrl: '/proxy/featrix',
    width: '100%',                // Container width (default: '100%')
    height: '100vh',              // Container height (default: '500px')
    isRotating: true,
    pointSize: 0.02,
    pointOpacity: 0.5,
    pointAlpha: 0.5,              // Default point opacity (0-1)
    mode: 'full',                 // 'full' or 'thumbnail'
    theme: 'dark',                // 'dark' or 'light'
    backgroundColor: '#1a1025',   // Custom background color
    colormap: 'viridis',          // Matplotlib colormap for cluster colors
    authToken: 'eyJhbG...',       // JWT bearer token
    onSphereReady: (sphere) => { console.log('ready', sphere); },
    onMaximize: (sessionId) => { console.log('maximize', sessionId); },
});

// Update settings live (no reload)
viewer.updateAnimationSettings({
    isRotating: false,
    pointSize: 0.03,
    pointOpacity: 0.8,
});

// Switch to a different session
viewer.update({ sessionId: 'new-session-id' });

// Tear down
viewer.destroy();
```

---

## Deploying a New Build

```bash
npm run build:embed       # build sphere-viewer.js
./deploy-to-bits.sh       # deploy to bits.featrix.com/sv/
```
