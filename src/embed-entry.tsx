import React from 'react';
import ReactDOM from 'react-dom/client';
import FeatrixSphereViewerApp from './FeatrixSphereViewerApp';
import { set_animation_options, set_visual_options } from '../featrix_sphere_control';
import './embed-styles-minimal.css';

interface FeatrixSphereViewerConfig {
  // New: Accept data directly instead of sessionId
  data?: any;
  // Legacy: Still support sessionId for backwards compatibility  
  sessionId?: string;
  containerId?: string;
  apiBaseUrl?: string;
  // Animation controls
  isRotating?: boolean;
  rotationSpeed?: number;
  animateClusters?: boolean;
  // Visual controls
  pointSize?: number;
  pointOpacity?: number;
  // Callback when sphere is ready
  onSphereReady?: (sphereRef: any) => void;
}

class FeatrixSphereViewer {
  private root: ReactDOM.Root | null = null;
  private container: HTMLElement | null = null;
  private currentConfig: FeatrixSphereViewerConfig = {};
  private sphereRef: any = null;

  constructor() {
    // Auto-initialize if there's a script tag with data attributes
    this.autoInitFromScript();
    
    // Make this instance globally available for demo pages
    (window as any).sphereViewerInstance = this;
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
      
      // Animation control attributes
      const isRotating = script.getAttribute('data-is-rotating') !== 'false'; // default true
      const rotationSpeed = parseFloat(script.getAttribute('data-rotation-speed') || '0.1');
      const animateClusters = script.getAttribute('data-animate-clusters') === 'true';
      
      // Visual control attributes
      const pointSize = parseFloat(script.getAttribute('data-point-size') || '0.05');
      const pointOpacity = parseFloat(script.getAttribute('data-point-opacity') || '0.5');

      const config = {
        sessionId: sessionId || undefined,
        containerId: containerId || undefined,
        apiBaseUrl: apiBaseUrl || undefined,
        isRotating,
        rotationSpeed,
        animateClusters,
        pointSize,
        pointOpacity,
        onSphereReady: (window as any).onSphereReady || undefined
      };

      // Priority: 1) Window data, 2) Data URL, 3) Session ID (legacy)
      if (windowDataKey && (window as any)[windowDataKey]) {
        this.init({ ...config, data: (window as any)[windowDataKey] });
      } else if (dataUrl) {
        this.loadDataAndInit(dataUrl, containerId);
      } else if (sessionId) {
        this.init(config);
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

    // Store the current config for future updates
    this.currentConfig = { ...config };

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
        isRotating={config.isRotating}
        rotationSpeed={config.rotationSpeed}
        animateClusters={config.animateClusters}
        pointSize={config.pointSize}
        pointOpacity={config.pointOpacity}
        onSphereReady={(sphereRef: any) => {
          this.sphereRef = sphereRef;
          if (config.onSphereReady) {
            config.onSphereReady(sphereRef);
          }
        }}
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
          isRotating={config.isRotating}
          rotationSpeed={config.rotationSpeed}
          animateClusters={config.animateClusters}
        />
      );
    }
  }

  updateAnimationSettings(animationConfig: { isRotating?: boolean, rotationSpeed?: number, animateClusters?: boolean, pointSize?: number, pointOpacity?: number }) {
    // Update stored config
    this.currentConfig = { ...this.currentConfig, ...animationConfig };
    
    // If we have direct access to the sphere, update it immediately
    if (this.sphereRef) {
      try {
        // Update animation settings
        if (animationConfig.isRotating !== undefined || animationConfig.rotationSpeed !== undefined || animationConfig.animateClusters !== undefined) {
          set_animation_options(
            this.sphereRef,
            animationConfig.isRotating ?? this.currentConfig.isRotating ?? true,
            animationConfig.rotationSpeed ?? this.currentConfig.rotationSpeed ?? 0.1,
            animationConfig.animateClusters ?? this.currentConfig.animateClusters ?? false,
            this.sphereRef.jsonData
          );
        }
        
        // Update visual settings
        if (animationConfig.pointSize !== undefined || animationConfig.pointOpacity !== undefined) {
          set_visual_options(
            this.sphereRef,
            animationConfig.pointSize ?? this.currentConfig.pointSize ?? 0.05,
            animationConfig.pointOpacity ?? this.currentConfig.pointOpacity ?? 0.5
          );
        }
        
        this.showSuccessNotification('⚡ Direct sphere update - instant!');
        return;
        
              } catch (error) {
          // Direct update failed, fall back to re-render
        }
    }
    
    // Fallback: re-render the entire component with new settings
    if (this.root) {
      this.root.render(
        <FeatrixSphereViewerApp 
          data={this.currentConfig.data}
          sessionId={this.currentConfig.sessionId} 
          apiBaseUrl={this.currentConfig.apiBaseUrl}
          isRotating={this.currentConfig.isRotating}
          rotationSpeed={this.currentConfig.rotationSpeed}
          animateClusters={this.currentConfig.animateClusters}
          pointSize={this.currentConfig.pointSize}
          pointOpacity={this.currentConfig.pointOpacity}
          onSphereReady={(sphereRef: any) => this.sphereRef = sphereRef}
        />
      );
      this.showSuccessNotification('🔄 Settings updated with re-render');
    }
  }
  
  private showSuccessNotification(message: string) {
    const container = this.getOrCreateContainer();
    if (container) {
      const notice = document.createElement('div');
      notice.style.cssText = 'position: absolute; top: 10px; right: 10px; background: #10b981; color: white; padding: 8px 12px; border-radius: 6px; font-size: 12px; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
      notice.textContent = message;
      container.style.position = 'relative';
      container.appendChild(notice);
      
      setTimeout(() => {
        if (notice.parentNode) {
          notice.parentNode.removeChild(notice);
        }
      }, 2000);
    }
  }

  
}

// Global API
declare global {
  interface Window {
    FeatrixSphereViewer: typeof FeatrixSphereViewer;
  }
}

// Expose the class globally
window.FeatrixSphereViewer = FeatrixSphereViewer;

// Auto-initialize only if script has data attributes (not for manual usage)
const scripts = document.querySelectorAll('script[src*="sphere-viewer.js"]');
const currentScript = scripts[scripts.length - 1] as HTMLElement;
if (currentScript && (
  currentScript.hasAttribute('data-session-id') || 
  currentScript.hasAttribute('data-featrix-data') || 
  currentScript.hasAttribute('data-use-window-data')
)) {
  const viewer = new FeatrixSphereViewer();
}

export default FeatrixSphereViewer; 