import React from 'react';
// Use global ReactDOM from CDN (webpack external)
declare global {
  interface Window {
    ReactDOM: any;
  }
}
const ReactDOM = (window as any).ReactDOM;
import FeatrixSphereEmbedded from './FeatrixSphereEmbedded';
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
  private root: any | null = null;
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

  private renderWithRetry(component: any, container: any, containerId?: string | null, retryCount: number = 0) {
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      console.error('❌ Failed to render React component after', maxRetries, 'attempts');
      this.showError('Failed to initialize React widget after multiple attempts', containerId);
      return;
    }
    
    try {
      // Check if ReactDOM is available and has required methods
      if (!window.ReactDOM) {
        throw new Error('ReactDOM not available on window');
      }
      
      // React 18 vs 17 compatibility
      if (ReactDOM.createRoot) {
        // React 18
        console.log('✅ Using React 18 createRoot (attempt', retryCount + 1, ')');
        this.root = ReactDOM.createRoot(container);
        this.root.render(component);
      } else if (ReactDOM.render) {
        // React 17 fallback
        console.log('✅ Using React 17 render fallback (attempt', retryCount + 1, ')');
        ReactDOM.render(component, container);
        this.root = { 
          render: (comp: any) => ReactDOM.render(comp, container), 
          unmount: () => ReactDOM.unmountComponentAtNode(container) 
        };
      } else {
        throw new Error('Neither ReactDOM.createRoot nor ReactDOM.render available');
      }
      
      // Success - verify rendering actually worked
      setTimeout(() => {
        if (container.children.length === 0) {
          console.warn('⚠️ React rendering appears to have failed (empty container), retrying...');
          this.renderWithRetry(component, container, containerId, retryCount + 1);
        }
      }, 1000);
      
    } catch (error) {
      console.warn(`⚠️ React rendering failed (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries - 1) {
        const delay = 1000 * (retryCount + 1); // Exponential backoff
        console.log(`🔄 Retrying React rendering in ${delay}ms...`);
        setTimeout(() => {
          this.renderWithRetry(component, container, containerId, retryCount + 1);
        }, delay);
      } else {
        this.showError('ReactDOM initialization failed after multiple attempts', containerId);
      }
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
    
    // CRITICAL: Always show ONLY training movie, never the finished sphere
    // Construct data object with session info for training movie
    const initial_data = data || { session: { session_id: sessionId } };
    
    const component = (
      <FeatrixSphereEmbedded 
        initial_data={initial_data}
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
    
    // React 18 vs 17 compatibility with retry logic
    this.renderWithRetry(component, container, containerId, 0);
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
      const initial_data = config.data || { session: { session_id: config.sessionId } };
      this.root.render(
        <FeatrixSphereEmbedded 
          initial_data={initial_data}
          apiBaseUrl={config.apiBaseUrl}
          isRotating={config.isRotating}
          rotationSpeed={config.rotationSpeed}
          animateClusters={config.animateClusters}
          pointSize={config.pointSize}
          pointOpacity={config.pointOpacity}
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
      const initial_data = this.currentConfig.data || { session: { session_id: this.currentConfig.sessionId } };
      this.root.render(
        <FeatrixSphereEmbedded 
          initial_data={initial_data}
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