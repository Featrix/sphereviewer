# @featrix/sphere-viewer

[![npm version](https://badge.fury.io/js/@featrix%2Fsphere-viewer.svg)](https://badge.fury.io/js/@featrix%2Fsphere-viewer)

A powerful, embeddable 3D sphere data visualization component built with React and Three.js. Display your data in an interactive 3D space with clustering, selection, and real-time training status.

![Sphere Viewer Demo](https://via.placeholder.com/800x400/1e40af/ffffff?text=3D+Sphere+Visualization)

## 🚀 Quick Start

### NPM Installation (Recommended)

```bash
npm install @featrix/sphere-viewer
```

### Usage in React/Next.js Apps

```tsx
import React from 'react';
import { SphereViewer } from '@featrix/sphere-viewer';

function MyApp() {
  return (
    <div style={{ height: '500px' }}>
      <SphereViewer 
        sessionId="your-session-id-here"
        apiBaseUrl="https://sphere-api.featrix.com" // optional
      />
    </div>
  );
}
```

### Embeddable Script (Any Website)

For WordPress, Squarespace, documentation sites, or any webpage:

```html
<!-- Load React dependencies -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<!-- Auto-initialize sphere viewer -->
<script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js" 
        data-session-id="your-session-id-here"></script>
```

## 📦 Installation Options

### 1. NPM Package (React/Next.js Projects)
```bash
npm install @featrix/sphere-viewer
```

### 2. CDN (Any Website)
```html
<script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js"></script>
```

### 3. Download Direct
Download `sphere-viewer.js` from the [releases page](https://github.com/Featrix/sphereviewer/releases).

## 🎯 Features

- **🌐 3D Visualization** - Interactive sphere rendering with Three.js
- **⚡ Real-time Updates** - Live training status and progress indicators  
- **🎨 Clustering** - Visual cluster analysis with 12+ distinct colors
- **🔍 Interactive Selection** - Click points for detailed data views
- **📱 Responsive** - Works on desktop and mobile devices
- **🔗 Embeddable** - Drop into any website with a simple script tag
- **🎛️ Customizable** - Configurable API endpoints and styling
- **📊 Data Tables** - Detailed data exploration with sortable tables

## 🛠️ API Reference

### React Component Props

```tsx
interface SphereViewerProps {
  sessionId: string;        // Required: Your session ID
  apiBaseUrl?: string;      // Optional: Custom API endpoint
}
```

### Embeddable Script Options

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-session-id` | ✅ | The session ID to load |
| `data-container-id` | ❌ | Target container ID (auto-created if not provided) |
| `data-api-base-url` | ❌ | Custom API base URL |

### JavaScript API

```javascript
// Manual initialization
const viewer = new window.SphereViewer();
viewer.init({
  sessionId: 'your-session-id',
  containerId: 'my-container',
  apiBaseUrl: 'https://api.example.com'
});

// Update session
viewer.update({ sessionId: 'new-session-id' });

// Cleanup
viewer.destroy();
```

## 💡 Examples

### React/Next.js Integration

```tsx
import { SphereViewer } from '@featrix/sphere-viewer';

export default function DataVisualization() {
  const [sessionId, setSessionId] = useState('initial-session');
  
  return (
    <div className="w-full h-96 border rounded-lg">
      <SphereViewer 
        sessionId={sessionId}
        apiBaseUrl="https://your-api.com"
      />
    </div>
  );
}
```

### WordPress Integration

```html
<!-- In your WordPress post/page -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js" 
        data-session-id="abc123"></script>
```

### Documentation Sites

```html
<div style="height: 500px; border: 1px solid #ddd; border-radius: 8px;">
  <script src="https://unpkg.com/@featrix/sphere-viewer@latest/dist/sphere-viewer.js" 
          data-session-id="demo-session"></script>
</div>
```

## 🔧 Development

### Building from Source

```bash
git clone https://github.com/Featrix/sphereviewer.git
cd sphereviewer
npm install

# Build React package
npm run build:package

# Build embeddable script  
npm run build:embed

# Build everything
npm run build:all
```

### Project Structure

```
src/
├── index.ts                 # NPM package entry point
├── SphereViewerApp.tsx      # Main React component
├── SphereEmbedded.tsx       # Embeddable version
├── embed-entry.tsx          # Script tag entry point
└── embed-data-access.ts     # API utilities

dist/
├── index.js                 # CommonJS build
├── index.esm.js             # ES modules build
├── index.d.ts               # TypeScript definitions
└── sphere-viewer.js         # Embeddable script
```

## 📈 Performance

- **Bundle Size**: ~180KB gzipped for React component
- **Embeddable Script**: 585KB (includes React and all dependencies)
- **Browser Support**: Chrome 60+, Firefox 55+, Safari 12+, Edge 79+
- **Mobile**: Optimized for touch controls and mobile GPUs

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Full documentation](./EMBED_README.md)
- **Issues**: [GitHub Issues](https://github.com/Featrix/sphereviewer/issues)
- **Email**: hello@featrix.ai

---

Made with ❤️ by [Featrix](https://featrix.ai) 