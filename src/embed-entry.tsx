import React from 'react';
import ReactDOM from 'react-dom/client';
import SphereViewerApp from './SphereViewerApp';
import './embed-styles.css';

interface SphereViewerConfig {
  sessionId: string;
  containerId?: string;
  apiBaseUrl?: string;
}

class SphereViewer {
  private root: ReactDOM.Root | null = null;
  private container: HTMLElement | null = null;

  constructor() {
    // Auto-initialize if there's a script tag with data attributes
    this.autoInitFromScript();
  }

  private autoInitFromScript() {
    // Look for script tag with data attributes
    const scripts = document.querySelectorAll('script[src*="sphere-viewer.js"]');
    const script = scripts[scripts.length - 1] as HTMLElement; // Get the current script

    if (script) {
      const sessionId = script.getAttribute('data-session-id');
      const containerId = script.getAttribute('data-container-id');
      const apiBaseUrl = script.getAttribute('data-api-base-url');

      if (sessionId) {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            this.init({ sessionId, containerId: containerId || undefined, apiBaseUrl: apiBaseUrl || undefined });
          });
        } else {
          this.init({ sessionId, containerId: containerId || undefined, apiBaseUrl: apiBaseUrl || undefined });
        }
      }
    }
  }

  init(config: SphereViewerConfig) {
    const { sessionId, containerId = 'sphere-viewer-container', apiBaseUrl } = config;

    // Create container if it doesn't exist
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.cssText = 'width: 100%; height: 500px; min-height: 400px;';
      
      // Insert after the script tag or at the end of body
      const scripts = document.querySelectorAll('script[src*="sphere-viewer.js"]');
      const script = scripts[scripts.length - 1];
      if (script && script.parentNode) {
        script.parentNode.insertBefore(container, script.nextSibling);
      } else {
        document.body.appendChild(container);
      }
    }

    this.container = container;
    this.root = ReactDOM.createRoot(container);
    
    this.root.render(
      <SphereViewerApp 
        sessionId={sessionId} 
        apiBaseUrl={apiBaseUrl}
      />
    );
  }

  destroy() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  update(config: Partial<SphereViewerConfig>) {
    if (this.root && config.sessionId) {
      this.root.render(
        <SphereViewerApp 
          sessionId={config.sessionId} 
          apiBaseUrl={config.apiBaseUrl}
        />
      );
    }
  }
}

// Global API
declare global {
  interface Window {
    SphereViewer: typeof SphereViewer;
  }
}

window.SphereViewer = SphereViewer;

// Auto-initialize instance
const viewer = new SphereViewer();

export default SphereViewer; 