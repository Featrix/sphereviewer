# WebGL Sphere Viewer - Implementation Overview

## Summary

This directory contains a complete copy of the sophisticated WebGL sphere viewer from the Vercel frontend application. The viewer uses Three.js to render interactive 3D data visualizations in a web browser.

## Core Architecture

### 1. Three.js WebGL Implementation (`sphere_control.ts`)
- **File Size**: 28KB, 865 lines of TypeScript
- **Purpose**: Core Three.js logic for WebGL rendering
- **Key Features**:
  - Scene, camera, and renderer management
  - Raycasting for object selection
  - Mouse/touch interaction handling  
  - Animation controls
  - Object selection and highlighting
  - Similarity search visualization
  - Cluster count management
  - Color management for data points

### 2. React Display Component (`sphere_display.tsx`)  
- **File Size**: 35KB, 1045 lines of TypeScript/React
- **Purpose**: React wrapper and UI for the WebGL sphere
- **Key Features**:
  - React hooks for Three.js integration
  - Color table management (12 distinct colors)
  - Record selection and management
  - Search functionality
  - Animation controls (play/pause)
  - Data table display
  - Integration with sphere controls

### 3. Main Sphere Component (`sphere.tsx`)
- **File Size**: 9.9KB, 269 lines of TypeScript/React
- **Purpose**: High-level sphere component orchestration
- **Features**:
  - Data prop management
  - Component composition
  - State management

### 4. Training Status (`training_status.tsx`)
- **File Size**: 16KB, 341 lines of TypeScript/React
- **Purpose**: Real-time training progress display
- **Features**:
  - Training metrics visualization
  - Progress indicators
  - Status updates

## Data Structure

The sphere viewer expects data in the following format:

```typescript
interface SphereRecord {
    coords: {
        x: number,
        y: number, 
        z: number,
    },
    id: string,
    featrix_meta: {
        cluster_pre: number | null,
        webgl_id: string | null,
        __featrix_row_id: number | null,
        __featrix_row_offset: number | null,
    },
    // ... additional record fields
}
```

## Key Capabilities

### 3D Visualization
- Renders data points as spheres/objects in 3D space
- Supports up to 12 distinct color clusters
- Real-time animation and rotation
- Zoom and pan controls

### Interaction
- Click to select individual data points
- Similarity search with visual highlighting
- Cluster visualization and management
- Record detail display in data table

### Performance
- WebGL-accelerated rendering
- Efficient raycasting for selection
- Optimized for large datasets
- Smooth animations at 60fps

## Dependencies

### Core Graphics
- `three`: ^0.174.0 - Three.js WebGL library
- `@types/three`: ^0.174.0 - TypeScript definitions

### React Framework
- `react`: ^18 - React library
- `react-dom`: ^18 - React DOM rendering

### UI Components
- `@heroicons/react`: ^2.1.5 - Icon library
- `tailwindcss`: ^3.4.1 - CSS framework
- `framer-motion`: ^11.11.17 - Animation library

### Utilities
- `uuid`: ^11.0.3 - Unique ID generation
- `clsx`: ^2.1.1 - Conditional CSS classes

## Integration Points

### Data Loading
The components expect data to be passed as props from a parent component or page that handles:
- API calls to fetch sphere data
- Data transformation and formatting
- Real-time updates during training

### Authentication
Original implementation assumes authentication context (PropelAuth) - this would need to be adapted for standalone use.

### API Endpoints
The components make calls to specific Featrix Sphere API endpoints for:
- Fetching sphere data
- Training status updates
- Similarity searches
- Record details

## Potential Use Cases

1. **Machine Learning Visualization** - Visualize embedding spaces and training progress
2. **Data Exploration** - Interactive 3D data analysis
3. **Cluster Analysis** - Visual clustering and similarity search
4. **Scientific Visualization** - 3D scatter plots with advanced interaction

## Adaptation Notes

To use this code in a different context:

1. **Remove Next.js Dependencies** - Extract core Three.js logic
2. **Replace API Calls** - Adapt data loading for your backend
3. **Simplify Authentication** - Remove or replace auth requirements
4. **Customize Styling** - Adapt Tailwind classes or replace with custom CSS
5. **Data Format** - Transform your data to match expected SphereRecord format

## Performance Characteristics

- Optimized for datasets with thousands of points
- Uses WebGL for hardware acceleration
- Efficient memory management with object pooling
- Smooth interactions even with large datasets
- Responsive design that works on mobile and desktop 