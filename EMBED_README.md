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
        const viewer = new window.SphereViewer();
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

### JavaScript API

```javascript
const viewer = new window.SphereViewer();

// Initialize
viewer.init({
    sessionId: 'your-session-id',     // Required
    containerId: 'container-id',      // Optional (default: 'sphere-viewer-container')
    apiBaseUrl: 'https://api.com'     // Optional (default: 'https://sphere-api.featrix.com')
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
├── embed-entry.tsx          # Main entry point for embeddable version
├── SphereViewerApp.tsx      # Root app component
├── SphereEmbedded.tsx       # Adapted Sphere component
├── embed-data-access.ts     # Data fetching utilities
└── embed-styles.css         # Embedded styles

dist/
└── sphere-viewer.js         # Built embeddable component
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

## 🔍 Troubleshooting

### Common Issues

1. **React not found**: Ensure React/ReactDOM are loaded before sphere-viewer.js
2. **CORS errors**: Check your API endpoints allow cross-origin requests
3. **CSS conflicts**: The component uses scoped CSS classes to avoid conflicts
4. **Mobile rendering**: The component is responsive but test on various devices

### Debug Mode

Enable console logging:

```javascript
// In browser console
window.SphereViewerDebug = true;
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