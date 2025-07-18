// Main package exports for NPM
export { default as FeatrixSphereViewer } from './FeatrixSphereViewerApp';
export { default as FeatrixSphereEmbedded } from './FeatrixSphereEmbedded';

// Re-export utilities
export * from './embed-data-access';

// Types
export interface FeatrixSphereViewerProps {
  sessionId: string;
  apiBaseUrl?: string;
}

export interface SphereEmbeddedProps {
  initial_data: any;
  apiBaseUrl?: string;
}

// For embeddable script usage (already exported in embed-entry.tsx)
export { default as EmbeddableEntry } from './embed-entry'; 