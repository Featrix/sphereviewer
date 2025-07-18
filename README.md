# WebGL Sphere Viewer

This directory contains a copy of the WebGL sphere viewer code from the Vercel frontend application.

## Copied Files

### Core Sphere Components
- **sphere.tsx** - Main sphere component (9.9KB)
- **sphere_display.tsx** - WebGL display logic and Three.js implementation (35KB)
- **sphere_control.ts** - Sphere interaction controls and camera management (28KB)
- **training_status.tsx** - Training status display component (16KB)
- **sphere_header.tsx** - Header component for the sphere viewer (1.1KB)
- **page.tsx** - Main page component that ties everything together (1.9KB)
- **copy_url.tsx** - URL copying functionality (539B)
- **data_access.tsx** - Data access component (512B)

### Shared Components
- **components/button.tsx** - Reusable button component
- **components/spinner.tsx** - Loading spinner component
- **components/dropdown.tsx** - Dropdown menu component
- **components/badge.tsx** - Badge/status indicator component

### Configuration Files
- **package.json** - Dependencies and build configuration
- **tsconfig.json** - TypeScript configuration
- **next.config.ts** - Next.js configuration
- **tailwind.config.ts** - Tailwind CSS configuration
- **postcss.config.mjs** - PostCSS configuration
- **globals.css** - Global CSS styles

## Key Dependencies

From package.json, the main dependencies for the WebGL sphere viewer:

- **three**: ^0.174.0 - Three.js for WebGL 3D graphics
- **@types/three**: ^0.174.0 - TypeScript definitions for Three.js
- **react**: ^18 - React framework
- **next**: 15.0.3 - Next.js framework
- **tailwindcss**: ^3.4.1 - CSS framework
- **framer-motion**: ^11.11.17 - Animation library
- **plotly.js**: ^3.0.0 - Plotting library (for additional visualizations)
- **react-plotly.js**: ^2.6.0 - React wrapper for Plotly

## Architecture

The sphere viewer consists of:

1. **Three.js WebGL Renderer** - Handles 3D graphics rendering
2. **Camera Controls** - Orbit controls for user interaction
3. **Data Visualization** - Points/spheres representing data in 3D space
4. **Training Status** - Real-time training progress display
5. **Interactive Controls** - UI for manipulating the view and data display

## Usage

This code was originally part of a Next.js application with React components. To use it standalone, you would need to:

1. Set up a React/Next.js project
2. Install the dependencies listed above
3. Import and use the components as needed
4. Adapt the data loading and API calls for your specific use case

## Notes

- The original code assumes it's running within a Next.js application with specific routing patterns
- Some components may have dependencies on authentication or other context providers from the original app
- The data access patterns are designed for the specific Featrix Sphere API endpoints 