// Main package exports for NPM
export { default as SphereViewer } from './SphereViewerApp';
export { default as SphereEmbedded } from './SphereEmbedded';

// Re-export utilities
export * from './embed-data-access';

// Types
export interface SphereViewerProps {
  sessionId: string;
  apiBaseUrl?: string;
}

export interface SphereEmbeddedProps {
  initial_data: any;
  apiBaseUrl?: string;
}

// For embeddable script usage (already exported in embed-entry.tsx)
export { default as EmbeddableEntry } from './embed-entry'; 