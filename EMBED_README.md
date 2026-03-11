# Sphere Viewer - Embeddable Web Component

This guide explains how to convert your React-based Sphere Viewer into a self-contained embeddable web component that can be loaded via `<script>` tags on any webpage.

## 🚀 Quick Start

### 1. Build the Embeddable Component

```bash
# Install dependencies
npm install

# Build the embeddable component
npm run build:embed
```

This creates `dist/sphere-viewer.js` - your embeddable component.

### 2. Embed in Any Webpage

#### Method 1: Auto-initialization (Easiest)

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Page with Sphere Viewer</title>
</head>
<body>
    <!-- Load React dependencies -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    
    <!-- Load and auto-initialize Sphere Viewer -->
    <script src="dist/sphere-viewer.js" 
            data-session-id="your-session-id-here"
            data-container-id="my-sphere-container"></script>
    
    <!-- Container (optional - will be created automatically if not provided) -->
    <div id="my-sphere-container"></div>
</body>
</html>
```

#### Method 2: Manual JavaScript API

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Page with Sphere Viewer</title>
</head>
<body>
    <!-- Load React dependencies -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    
    <!-- Load Sphere Viewer -->
    <script src="dist/sphere-viewer.js"></script>
    
    <!-- Your container -->
    <div id="my-sphere-container"></div>
    
    <script>
        // Initialize manually
        const viewer = new window.FeatrixSphereViewer();
        viewer.init({
            sessionId: 'your-session-id-here',
            containerId: 'my-sphere-container',
            apiBaseUrl: 'https://sphere-api.featrix.com' // optional
        });
    </script>
</body>
</html>
```

## 📋 Configuration Options

### Data Attributes (Auto-initialization)

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-session-id` | ✅ | The session ID to load |
| `data-container-id` | ❌ | Target container ID (default: auto-created) |
| `data-api-base-url` | ❌ | Custom API base URL (default: https://sphere-api.featrix.com) |
| `data-auth-token` | ❌ | JWT bearer token for authenticated API requests |
| `data-mode` | ❌ | Display mode: `thumbnail` (minimal UI, Canvas2D) or `full` (default) |
| `data-width` | ❌ | Container width (e.g. `800px`, `100%`) |
| `data-height` | ❌ | Container height (e.g. `600px`, `100vh`) |
| `data-theme` | ❌ | Color theme: `dark` (default) or `light` |
| `data-background-color` | ❌ | Custom background color for the sphere area |
| `data-point-alpha` | ❌ | Default alpha/opacity for points, 0–1 (default: `0.5`) |
| `data-colormap` | ❌ | Matplotlib colormap name (e.g. `viridis`, `tab10`, `plasma`) |
| `data-endpoint` | ❌ | Custom data endpoint URL (overrides default epoch_projections) |
| `data-on-maximize` | ❌ | Global function name called when thumbnail maximize button is clicked |

### JavaScript API

```javascript
const viewer = new window.FeatrixSphereViewer();

// Initialize
viewer.init({
    sessionId: 'your-session-id',     // Required (or use data: {...})
    containerId: 'container-id',      // Optional (default: 'sphere-viewer-container')
    apiBaseUrl: 'https://api.com',    // Optional (default: 'https://sphere-api.featrix.com')
    authToken: 'your-jwt-token',      // Optional: JWT for authenticated API requests
    mode: 'full',                     // Optional: 'full' (default) or 'thumbnail'
    theme: 'dark',                    // Optional: 'dark' (default) or 'light'
    backgroundColor: '#1a1025',       // Optional: custom background color
    pointAlpha: 0.5,                  // Optional: default point opacity (0-1)
    colormap: 'viridis',             // Optional: matplotlib colormap name
    onMaximize: (sessionId) => {},   // Optional: thumbnail maximize callback
    onSphereReady: (sphere) => {},   // Optional: called when sphere is ready
});

// Update to new session
viewer.update({ sessionId: 'new-session-id' });

// Destroy the viewer
viewer.destroy();
```

## 🎯 Integration Examples

### WordPress

```html
<!-- In your WordPress post/page -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="/wp-content/uploads/sphere-viewer.js" 
        data-session-id="abc123"></script>
```

### Squarespace / Wix

```html
<!-- In a code block -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://your-cdn.com/sphere-viewer.js" 
        data-session-id="abc123"></script>
```

### Documentation Sites (GitBook, Notion, etc.)

If the platform allows custom HTML:

```html
<div style="width: 100%; height: 500px; border: 1px solid #ddd; border-radius: 8px;">
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://your-cdn.com/sphere-viewer.js" 
            data-session-id="abc123"></script>
</div>
```

## 🔧 Development

### File Structure

```
src/
├── embed-entry.tsx              # Main entry point, config parsing, FeatrixSphereViewer class
├── FeatrixSphereEmbedded.tsx    # Main React component (TrainingMovie, Canvas2D fallback, UI)
├── embed-data-access.ts         # API data fetching utilities
├── embed-styles-minimal.css     # Embedded styles
├── PlaybackController.tsx       # Glassmorphic playback bar component
├── ThemeContext.tsx              # Theme system (dark/light)
├── colormaps.ts                 # Matplotlib colormap support
├── glb-loader.ts                # GLB binary format loader
└── components/                  # Reusable UI components

dist/
└── sphere-viewer.js             # Built embeddable component (~835KB)
```

### Build Configuration

- **Webpack**: Bundles everything into a single UMD module
- **Externals**: React and ReactDOM are expected to be loaded separately
- **TypeScript**: Configured for browser compatibility
- **CSS**: Inlined into the JavaScript bundle

### Customization

1. **Styling**: Modify `src/embed-styles.css`
2. **API Endpoints**: Update `src/embed-data-access.ts`
3. **Components**: Adapt any existing components in `src/`
4. **Build Output**: Configure `webpack.config.js`

## 📦 Deployment

### 1. Build and Test Locally

```bash
npm run build:embed
open demo.html  # Test the component
```

### 2. Deploy to CDN

Upload `dist/sphere-viewer.js` to your preferred CDN:

- AWS CloudFront
- Cloudflare
- jsDelivr
- Your own server

### 3. Version Management

Consider versioning your embeddable component:

```bash
# Build with version
cp dist/sphere-viewer.js dist/sphere-viewer-v1.0.0.js

# Use versioned URLs
<script src="https://cdn.yoursite.com/sphere-viewer-v1.0.0.js"></script>
```

## Rendering Modes

### WebGL (Default)
Full 3D rendering with Three.js. Requires WebGL support in the browser.

### Canvas2D Fallback
When WebGL is unavailable (GPU crash, headless browser, disabled hardware acceleration), the viewer automatically falls back to a Canvas2D software renderer. A red banner indicates fallback mode. The fallback supports:
- Point rendering with cluster colors
- Rotation (auto and drag)
- Frame-by-frame playback
- Play/pause controls

### Thumbnail Mode
When `mode="thumbnail"`, the viewer always uses Canvas2D rendering (no WebGL context consumed). This prevents exhausting the browser's ~16 WebGL context limit when displaying many viewers on one page. Thumbnail mode also hides all UI controls.

A **maximize button** (expand icon, bottom-right) appears on hover in thumbnail mode. You can control its behavior:

```javascript
// Option A: Custom callback — you handle the maximize action
viewer.init({
  mode: 'thumbnail',
  onMaximize: (sessionId) => {
    // Open a modal, navigate to a full page, etc.
    openMyModal(sessionId);
  }
});

// Option B: Default behavior (no onMaximize) — enters browser fullscreen,
// switches to full mode with all controls. Pressing ESC restores thumbnail.
viewer.init({ mode: 'thumbnail' });
```

Via script tag:
```html
<!-- Custom callback (global function name) -->
<script src="sphere-viewer.js"
        data-mode="thumbnail"
        data-on-maximize="myApp.expandSphere"></script>

<!-- Default fullscreen behavior -->
<script src="sphere-viewer.js"
        data-mode="thumbnail"></script>
```

## 🔍 Troubleshooting

### Common Issues

1. **React not found**: Ensure React/ReactDOM are loaded before sphere-viewer.js
2. **CORS errors**: Check your API endpoints allow cross-origin requests
3. **CSS conflicts**: The component uses scoped CSS classes to avoid conflicts
4. **Mobile rendering**: The component is responsive but test on various devices
5. **WebGL unavailable**: The viewer falls back to Canvas2D automatically. Check `chrome://gpu` for GPU status. Common causes: too many WebGL contexts, GPU driver crash, disabled hardware acceleration.

### Debug Mode

Enable console logging:

```javascript
// In browser console
window.FeatrixSphereViewerDebug = true;
```

### Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 🤝 Contributing

To improve the embeddable component:

1. Modify source files in `src/`
2. Test with `npm run build:embed && open demo.html`
3. Update this README if needed
4. Submit your changes

## 📄 License

Same license as the main project. 