import React from 'react';
import ReactDOM from 'react-dom/client';
import FeatrixSphereViewerApp from './FeatrixSphereViewerApp';
import './embed-styles.css';

interface FeatrixSphereViewerConfig {
  // New: Accept data directly instead of sessionId
  data?: any;
  // Legacy: Still support sessionId for backwards compatibility  
  sessionId?: string;
  containerId?: string;
  apiBaseUrl?: string;
}

class FeatrixSphereViewer {
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
      const dataUrl = script.getAttribute('data-featrix-data');
      const windowDataKey = script.getAttribute('data-use-window-data');

      // Priority: 1) Window data, 2) Data URL, 3) Session ID (legacy)
      if (windowDataKey && (window as any)[windowDataKey]) {
        this.initWithData((window as any)[windowDataKey], containerId);
      } else if (dataUrl) {
        this.loadDataAndInit(dataUrl, containerId);
      } else if (sessionId) {
        this.init({ sessionId, containerId: containerId || undefined, apiBaseUrl: apiBaseUrl || undefined });
      }
    }
  }

  private async loadDataAndInit(dataUrl: string, containerId?: string | null) {
    try {
      const response = await fetch(dataUrl);
      const data = await response.json();
      this.initWithData(data, containerId);
    } catch (error) {
      console.error('Failed to load Featrix data:', error);
      this.showError('Failed to load data file', containerId);
    }
  }

  private initWithData(data: any, containerId?: string | null) {
    this.init({ data, containerId: containerId || undefined });
  }

  private showError(message: string, containerId?: string | null) {
    const container = this.getOrCreateContainer(containerId);
    if (container) {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #fee2e2; color: #991b1b; padding: 20px; text-align: center; border-radius: 8px;">
          <div>
            <h3 style="margin: 0 0 10px 0;">❌ Error Loading Sphere Viewer</h3>
            <p style="margin: 0;">${message}</p>
          </div>
        </div>
      `;
    }
  }

  private getOrCreateContainer(containerId?: string | null) {
    const id = containerId || 'sphere-viewer-container';
    let container = document.getElementById(id);
    
    if (!container) {
      container = document.createElement('div');
      container.id = id;
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
    
    return container;
  }

  init(config: FeatrixSphereViewerConfig) {
    const { data, sessionId, containerId = 'sphere-viewer-container', apiBaseUrl } = config;

    // Validate that we have either data or sessionId
    if (!data && !sessionId) {
      console.error('FeatrixSphereViewer: Must provide either data or sessionId');
      this.showError('No data or session ID provided', containerId);
      return;
    }

    const container = this.getOrCreateContainer(containerId);
    this.container = container;
    this.root = ReactDOM.createRoot(container);
    
    this.root.render(
      <FeatrixSphereViewerApp 
        data={data}
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

  update(config: Partial<FeatrixSphereViewerConfig>) {
    if (this.root && (config.data || config.sessionId)) {
      this.root.render(
        <FeatrixSphereViewerApp 
          data={config.data}
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
    FeatrixSphereViewer: typeof FeatrixSphereViewer;
  }
}

window.FeatrixSphereViewer = FeatrixSphereViewer;

// Auto-initialize instance
const viewer = new FeatrixSphereViewer();

export default FeatrixSphereViewer; 