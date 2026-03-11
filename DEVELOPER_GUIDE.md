# Featrix Sphere Viewer - Developer Guide

## Overview

This guide is for developers who want to contribute to, build, or understand the architecture of the Featrix Sphere Viewer.

## Project Structure

```
sphereviewer/
├── src/                          # Source code
│   ├── embed-entry.tsx          # Main entry point for embeddable version
│   ├── FeatrixSphereViewerApp.tsx  # Root app component
│   ├── FeatrixSphereEmbedded.tsx    # Embedded sphere component
│   ├── embed-data-access.ts     # Data fetching utilities
│   ├── embed-styles.css         # Embedded styles
│   └── embed-styles-minimal.css # Minimal embedded styles
├── components/                   # Reusable UI components
│   ├── badge.tsx
│   ├── button.tsx
│   ├── heading.tsx
│   ├── link.tsx
│   ├── spinner.tsx
│   ├── table.tsx
│   └── text.tsx
├── featrix_sphere_control.ts     # Core Three.js WebGL logic
├── featrix_sphere_display.tsx   # React wrapper for WebGL sphere
├── featrix_sphere_header.tsx    # Sphere header component
├── featrix_sphere.tsx           # Main sphere component
├── training_status.tsx          # Training status display
├── dist/                         # Build output
│   ├── sphere-viewer.js         # Built embeddable component
│   └── sphere-viewer.js.LICENSE.txt
├── webpack.config.js             # Webpack configuration for embeddable build
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies and scripts
└── no-cache-server.py           # Development server with cache busting
```

## Core Architecture

### 1. Three.js WebGL Implementation (`featrix_sphere_control.ts`)

The core Three.js logic for WebGL rendering:

- **Scene, camera, and renderer management**
- **Raycasting** for object selection
- **Mouse/touch interaction** handling
- **Animation controls** (rotation, cluster animations)
- **Object selection and highlighting**
- **Similarity search visualization**
- **Cluster count management**
- **Color management** for data points
- **Training movie playback** controls

### 2. React Display Component (`featrix_sphere_display.tsx`)

React wrapper and UI for the WebGL sphere:

- React hooks for Three.js integration
- Color table management (12 distinct colors)
- Record selection and management
- Search functionality
- Animation controls (play/pause)
- Data table display
- Integration with sphere controls

### 3. Embeddable Entry Point (`src/embed-entry.tsx`)

Main entry point for the embeddable version:

- `FeatrixSphereViewer` class exposed globally
- Auto-initialization from script tag attributes
- Manual JavaScript API
- React 18/17 compatibility with retry logic
- Data loading from multiple sources (window, JSON file, API)

### 4. Embedded Component (`src/FeatrixSphereEmbedded.tsx`)

Adapted sphere component for embedding:

- Handles data loading (direct data or API)
- Training movie support
- Loss plot overlay
- Training status display
- Integration with embeddable entry point

## Building the Project

### Prerequisites

- Node.js 18+ and npm
- Python 3 (for development server)

### Installation

```bash
npm install
```

### Build Commands

```bash
# Build the embeddable component
npm run build:embed

# This creates:
# - dist/sphere-viewer.js (main build)
# - sphere-viewer.js (copied to root for local testing)
```

### Development Server

```bash
# Start the no-cache server on port 8080
python3 no-cache-server.py 8080

# Or use the full data example server
python3 full-data-example-server.py
```

The server automatically:
- Kills any existing process on port 8080
- Serves files with no-cache headers
- Supports CORS for API proxying

### Development Workflow

1. Make changes to source files in `src/` or component files
2. Run `npm run build:embed` to rebuild
3. Test with `http://localhost:8080/demo.html` or other test files
4. Check browser console for errors

## Data Flow

### Initialization Flow

1. **Script Tag Loaded** → `embed-entry.tsx` auto-initializes
2. **Data Source Detection**:
   - `data-use-window-data` → Uses `window[dataKey]`
   - `data-featrix-data` → Fetches JSON file
   - `data-session-id` → Fetches from API (legacy)
3. **Component Rendering** → `FeatrixSphereEmbedded` component
4. **Data Processing** → Transforms data to `SphereRecord` format
5. **Sphere Initialization** → `featrix_sphere_control.ts` creates Three.js scene
6. **Rendering** → WebGL renders points in 3D space

### Data Format Transformation

```typescript
// Input: Featrix export format
{
  coords: [{ "0": x, "1": y, "2": z, ... }],
  entire_cluster_results: { ... }
}

// Transformed to: SphereRecord format
{
  coords: { x, y, z },
  id: string,
  featrix_meta: { ... },
  // ... original data fields
}
```

## Key Components

### FeatrixSphereViewer Class

```typescript
class FeatrixSphereViewer {
  init(config: FeatrixSphereViewerConfig): Promise<void>
  update(config: Partial<FeatrixSphereViewerConfig>): void
  updateAnimationSettings(settings: AnimationConfig): void
  destroy(): void
}
```

### FeatrixSphereEmbedded Component

```typescript
interface FeatrixSphereEmbeddedProps {
  initial_data: any;
  apiBaseUrl?: string;
  isRotating?: boolean;
  rotationSpeed?: number;
  animateClusters?: boolean;
  pointSize?: number;
  pointOpacity?: number;
  onSphereReady?: (sphereRef: any) => void;
}
```

### Sphere Control Functions

```typescript
// Core sphere functions
initialize_sphere(container: HTMLElement, records: SphereRecord[]): SphereControl
render_sphere(control: SphereControl): void
set_animation_options(control: SphereControl, isRotating: boolean, ...): void
set_visual_options(control: SphereControl, pointSize: number, ...): void

// Training movie functions
load_training_movie(control: SphereControl, movieData: any): void
play_training_movie(control: SphereControl): void
stop_training_movie(control: SphereControl): void
pause_training_movie(control: SphereControl): void
resume_training_movie(control: SphereControl): void
step_training_movie_frame(control: SphereControl, frame: number): void
goto_training_movie_frame(control: SphereControl, epoch: number): void

// Clustering functions
remap_cluster_assignments(records: SphereRecord[], clusterCount: number): void
compute_cluster_convex_hulls(control: SphereControl, records: SphereRecord[]): void
update_cluster_spotlight(control: SphereControl, clusterId: number | null): void

// Search functions
show_search_results(control: SphereControl, results: number[]): void
clear_colors(control: SphereControl): void
```

## Webpack Configuration

The embeddable build uses Webpack 5 to bundle:

- **Entry**: `src/embed-entry.tsx`
- **Output**: UMD format for browser compatibility
- **Externals**: React and ReactDOM (loaded separately)
- **Loaders**: TypeScript, CSS
- **Optimization**: Minification, tree shaking

### Build Output

- **Format**: UMD (Universal Module Definition)
- **Global Name**: `FeatrixSphereViewer`
- **Size**: ~567KB (minified), ~180KB (gzipped)
- **Dependencies**: React 18+, ReactDOM 18+ (external)

## TypeScript Configuration

- **Target**: ES2020
- **Module**: ES2020
- **JSX**: React
- **Strict Mode**: Enabled
- **Type Definitions**: Included in build

## Testing

### Test Files

- `demo.html` - Basic demo page
- `simple-test.html` - Minimal example
- `data-driven-test.html` - All integration methods
- `embed-test.html` - Comprehensive testing
- `interactive-test.html` - Full data example with API integration
- `training-movie-demo.html` - Training movie visualization

### Running Tests

1. Build: `npm run build:embed`
2. Start server: `python3 no-cache-server.py 8080`
3. Open test file: `http://localhost:8080/[test-file].html`

## Deployment

### Deployment Script

```bash
# Deploy to bits host
npm run deploy

# Full build and deploy
npm run deploy:full
```

The deployment script (`deploy-to-bits.sh`) copies:
- `sphere-viewer.js` → `bits:/var/www/html/sv/`
- Demo HTML files
- Documentation files

### CDN Deployment

1. Build: `npm run build:embed`
2. Upload `dist/sphere-viewer.js` to your CDN
3. Update URLs in documentation

### NPM Package

```bash
# Build before publishing
npm run build:embed

# Publish
npm publish
```

## API Integration

### Data Access Layer (`src/embed-data-access.ts`)

Functions for fetching data from Featrix API:

```typescript
fetch_session_data(sessionId: string, apiBaseUrl?: string): Promise<any>
fetch_session_projections(sessionId: string, apiBaseUrl?: string): Promise<any>
fetch_training_metrics(sessionId: string, apiBaseUrl?: string): Promise<any>
fetch_session_status(sessionId: string, apiBaseUrl?: string): Promise<any>
fetch_single_epoch(sessionId: string, epoch: number, apiBaseUrl?: string): Promise<any>
```

### API Endpoints

- `GET /compute/session/{session_id}` - Session metadata
- `GET /compute/session/{session_id}/projections` - Final sphere data
- `GET /compute/session/{session_id}/epoch_projections` - Training movie data
- `GET /compute/session/{session_id}/training_metrics` - Training metrics
- `POST /compute/session/{session_id}/encode_records` - Encode new points

## Performance Optimization

### Rendering Optimization

- **WebGL Instancing**: Efficient point rendering
- **Object Pooling**: Reuse Three.js objects
- **Level of Detail**: Adjust detail based on zoom level
- **Frustum Culling**: Only render visible points

### Data Optimization

- **Lazy Loading**: Load data on demand
- **Data Compression**: Use gzip for JSON files
- **Caching**: Cache frequently accessed data
- **Chunking**: Load large datasets in chunks

## Browser Compatibility

### React 18/17 Compatibility

The embeddable version supports both React 18 and React 17:

```typescript
// React 18: createRoot
if (hasCreateRoot) {
  root = ReactDOM.createRoot(container);
  root.render(component);
}
// React 17: render fallback
else if (hasRender) {
  ReactDOM.render(component, container);
}
```

### Retry Logic

Automatic retry with progressive delays if ReactDOM isn't ready:

- Initial delay: 200ms
- Retry delays: 500ms, 1s, 1.5s, 2s
- Max retries: 5 attempts

## Styling

### CSS Architecture

- **Scoped Styles**: `embed-styles.css` and `embed-styles-minimal.css`
- **Tailwind CSS**: Used in React components
- **Inline Styles**: Fallbacks for critical styles
- **CSS Classes**: Prefixed to avoid conflicts

### Customization

To customize styles:
1. Modify `src/embed-styles.css` or `src/embed-styles-minimal.css`
2. Rebuild: `npm run build:embed`
3. CSS is inlined into the JavaScript bundle

## Debugging

### Debug Mode

```javascript
// Enable debug logging
window.FeatrixSphereViewerDebug = true;
```

### Console Logging

The component logs:
- Initialization steps
- Data loading progress
- React rendering status
- Error messages with context

### Common Issues

1. **ReactDOM not ready**: Automatic retry handles this
2. **Data format errors**: Check console for validation errors
3. **CORS issues**: Use data-driven methods instead of API mode
4. **Memory leaks**: Call `destroy()` when removing viewer

## Contributing

### Code Style

- TypeScript with strict mode
- React functional components with hooks
- ES2020+ features
- Consistent naming: `Featrix*` prefix for components

### Adding Features

1. Create feature branch
2. Make changes in appropriate files
3. Update documentation
4. Test with demo pages
5. Build and verify: `npm run build:embed`
6. Submit pull request

### File Naming Conventions

- Components: `featrix_*.tsx` or `Featrix*.tsx`
- Utilities: `*_utils.ts`
- Types: Co-located with components
- Styles: `*-styles.css`

## Dependencies

### Production Dependencies

- `three`: ^0.174.0 - WebGL library
- `react`: ^18 - React library (peer dependency)
- `react-dom`: ^18 - React DOM (peer dependency)
- `@heroicons/react`: ^2.1.5 - Icons
- `framer-motion`: ^11.11.17 - Animations
- `uuid`: ^11.0.3 - Unique IDs
- `clsx`: ^2.1.1 - Conditional classes

### Development Dependencies

- `typescript`: ^5 - TypeScript compiler
- `webpack`: ^5.100.2 - Bundler
- `ts-loader`: ^9.5.2 - TypeScript loader
- `css-loader`: ^6.11.0 - CSS loader
- `style-loader`: ^3.3.4 - Style injection
- `tailwindcss`: ^3.4.1 - CSS framework

## License

BSD 4-Clause License - Copyright (c) 2023-2025 Featrix

## Resources

- **GitHub**: https://github.com/Featrix/sphereviewer
- **Issues**: https://github.com/Featrix/sphereviewer/issues
- **Email**: support@featrix.com

---

**For end users**: See `USER_GUIDE.md` for usage instructions.




