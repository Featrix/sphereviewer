/**
 * @license
 * Featrix Sphere Viewer - Standalone Build (React bundled)
 *
 * Copyright (c) 2023-2025 Featrix
 * Licensed under the BSD 4-Clause License (see LICENSE file)
 *
 * Self-contained entry point that bundles React + ReactDOM.
 * Use this on pages that do NOT already have React (monitors, static HTML, etc).
 * For React apps, use sphere-viewer.js (external React) instead.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import FeatrixSphereEmbedded from './FeatrixSphereEmbedded';
import { set_animation_options, set_visual_options } from '../featrix_sphere_control';
import './embed-styles-minimal.css';

export const SPHERE_VIEWER_VERSION = '1.4.0';

interface FeatrixSphereViewerConfig {
  data?: any;
  sessionId?: string;
  containerId?: string;
  apiBaseUrl?: string;
  width?: string;
  height?: string;
  isRotating?: boolean;
  rotationSpeed?: number;
  animateClusters?: boolean;
  pointSize?: number;
  pointOpacity?: number;
  mode?: 'thumbnail' | 'full';
  dataEndpoint?: string;
  authToken?: string;
  onSphereReady?: (sphereRef: any) => void;
  onMaximize?: (sessionId?: string) => void;
  theme?: 'dark' | 'light';
  backgroundColor?: string;
  pointAlpha?: number;
  colormap?: string;
}

class FeatrixSphereViewer {
  private root: ReturnType<typeof ReactDOM.createRoot> | null = null;
  private container: HTMLElement | null = null;
  private currentConfig: FeatrixSphereViewerConfig = {};
  private sphereRef: any = null;

  constructor(containerOrNothing?: HTMLElement | null, options?: Partial<FeatrixSphereViewerConfig>) {
    if (containerOrNothing instanceof HTMLElement) {
      // Alternative API: new FeatrixSphereViewer(container, { ... })
      this.container = containerOrNothing;
      if (options) {
        this.currentConfig = { ...options };
        if (options.backgroundColor) containerOrNothing.style.background = options.backgroundColor;
      }
    } else {
      this.autoInitFromScript();
    }
    (window as any).sphereViewerInstance = this;
  }

  // Alternative API: viewer.load(data)
  load(data: any) {
    if (!this.container) {
      console.error('FeatrixSphereViewer: No container. Use new FeatrixSphereViewer(container) first.');
      return;
    }
    // Normalize numeric width/height to CSS strings
    const cfg = { ...this.currentConfig };
    if (typeof cfg.width === 'number') cfg.width = `${cfg.width}px`;
    if (typeof cfg.height === 'number') cfg.height = `${cfg.height}px`;
    return this.init({
      ...cfg,
      data,
      containerId: this.container.id || undefined,
      // Map beagle's "background" to our "backgroundColor"
      backgroundColor: cfg.backgroundColor || (cfg as any).background,
      // Map beagle's "interactive: false" to thumbnail mode
      mode: (cfg as any).interactive === false ? 'thumbnail' : cfg.mode,
    });
  }

  private autoInitFromScript() {
    const scripts = document.querySelectorAll('script[src*="sphere-viewer"]');
    const script = scripts[scripts.length - 1] as HTMLElement;

    if (script) {
      const sessionId = script.getAttribute('data-session-id');
      const containerId = script.getAttribute('data-container-id');
      const apiBaseUrl = script.getAttribute('data-api-base-url');
      const dataUrl = script.getAttribute('data-featrix-data');
      const windowDataKey = script.getAttribute('data-use-window-data');
      const dataEndpoint = script.getAttribute('data-endpoint') || undefined;
      const authToken = script.getAttribute('data-auth-token') || undefined;

      const isRotating = script.getAttribute('data-is-rotating') !== 'false';
      const rotationSpeed = parseFloat(script.getAttribute('data-rotation-speed') || '0.1');
      const animateClusters = script.getAttribute('data-animate-clusters') === 'true';
      const pointSize = parseFloat(script.getAttribute('data-point-size') || '0.05');
      const pointOpacity = parseFloat(script.getAttribute('data-point-opacity') || '0.5');
      const width = script.getAttribute('data-width') || undefined;
      const height = script.getAttribute('data-height') || undefined;

      const themeAttr = script.getAttribute('data-theme');
      const theme = (themeAttr === 'dark' || themeAttr === 'light') ? themeAttr : undefined;
      const backgroundColor = script.getAttribute('data-background-color') || undefined;
      const pointAlpha = script.hasAttribute('data-point-alpha') ? parseFloat(script.getAttribute('data-point-alpha')!) : undefined;
      const colormap = script.getAttribute('data-colormap') || undefined;

      const modeAttr = script.getAttribute('data-mode');
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get('mode');
      const modeValue = modeAttr || modeParam;
      const mode = (modeValue === 'thumbnail' || modeValue === 'full') ? modeValue as 'thumbnail' | 'full' : undefined;

      const onMaximizeAttr = script.getAttribute('data-on-maximize');
      const onMaximize = onMaximizeAttr ? (window as any)[onMaximizeAttr] as ((sessionId?: string) => void) : undefined;

      const config = {
        sessionId: sessionId || undefined,
        containerId: containerId || undefined,
        apiBaseUrl: apiBaseUrl || undefined,
        width, height, isRotating, rotationSpeed, animateClusters,
        pointSize, pointOpacity, mode, dataEndpoint, authToken,
        theme, backgroundColor, pointAlpha, colormap,
        onSphereReady: (window as any).onSphereReady || undefined,
        onMaximize,
      };

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
      await this.init({ data, containerId: containerId || undefined });
    } catch (error) {
      console.error('Failed to load Featrix data:', error);
      this.showError('Failed to load data file', containerId);
    }
  }

  private showError(message: string, containerId?: string | null) {
    const container = this.getOrCreateContainer(containerId);
    if (container) {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #fee2e2; color: #991b1b; padding: 20px; text-align: center; border-radius: 8px;">
          <div>
            <h3 style="margin: 0 0 10px 0;">Error Loading Sphere Viewer</h3>
            <p style="margin: 0;">${message}</p>
          </div>
        </div>
      `;
    }
  }

  private getOrCreateContainer(containerId?: string | null, width?: string, height?: string) {
    const id = containerId || 'sphere-viewer-container';
    let container = document.getElementById(id);

    if (!container) {
      container = document.createElement('div');
      container.id = id;
      const w = width || '100%';
      const h = height || '500px';
      container.style.cssText = `width: ${w}; max-width: 100vw; height: ${h}; min-height: 300px; overflow: hidden; position: relative; box-sizing: border-box;`;

      const scripts = document.querySelectorAll('script[src*="sphere-viewer"]');
      const script = scripts[scripts.length - 1];
      if (script && script.parentNode) {
        script.parentNode.insertBefore(container, script.nextSibling);
      } else {
        document.body.appendChild(container);
      }
    } else if (width || height) {
      if (width) container.style.width = width === '100vw' ? '100%' : width;
      if (height) container.style.height = height;
    }

    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      container.style.width = `${window.innerWidth}px`;
      container.style.maxWidth = `${window.innerWidth}px`;
      const resizeHandler = () => {
        container.style.width = `${window.innerWidth}px`;
        container.style.maxWidth = `${window.innerWidth}px`;
      };
      window.addEventListener('resize', resizeHandler);
      window.addEventListener('orientationchange', resizeHandler);
    } else {
      container.style.maxWidth = '100%';
    }
    container.style.overflow = 'hidden';
    container.style.position = 'relative';
    container.style.boxSizing = 'border-box';

    return container;
  }

  async init(config: FeatrixSphereViewerConfig) {
    const { data, sessionId, containerId = 'sphere-viewer-container', apiBaseUrl, width, height } = config;
    this.currentConfig = { ...config };

    if (!data && !sessionId) {
      console.error('FeatrixSphereViewer: Must provide either data or sessionId');
      this.showError('No data or session ID provided', containerId);
      return;
    }

    // Use container from constructor if available, otherwise find/create one
    const container = this.container || this.getOrCreateContainer(containerId, width, height);
    this.container = container;

    const initial_data = data || { session: { session_id: sessionId } };

    const component = (
      <FeatrixSphereEmbedded
        initial_data={initial_data}
        apiBaseUrl={apiBaseUrl}
        authToken={config.authToken}
        isRotating={config.isRotating}
        rotationSpeed={config.rotationSpeed}
        animateClusters={config.animateClusters}
        pointSize={config.pointSize}
        pointOpacity={config.pointOpacity}
        mode={config.mode}
        dataEndpoint={config.dataEndpoint}
        theme={config.theme}
        backgroundColor={config.backgroundColor}
        pointAlpha={config.pointAlpha}
        colormap={config.colormap}
        onMaximize={config.onMaximize}
        onSphereReady={(sphereRef: any) => {
          this.sphereRef = sphereRef;
          if (config.onSphereReady) {
            config.onSphereReady(sphereRef);
          }
        }}
      />
    );

    // No retry dance needed — React is bundled, always available
    this.root = ReactDOM.createRoot(container);
    this.root.render(component);
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
          authToken={config.authToken}
          isRotating={config.isRotating}
          rotationSpeed={config.rotationSpeed}
          animateClusters={config.animateClusters}
          pointSize={config.pointSize}
          pointOpacity={config.pointOpacity}
          dataEndpoint={config.dataEndpoint}
          theme={config.theme}
          backgroundColor={config.backgroundColor}
          pointAlpha={config.pointAlpha}
          colormap={config.colormap}
        />
      );
    }
  }

  updateAnimationSettings(animationConfig: { isRotating?: boolean, rotationSpeed?: number, animateClusters?: boolean, pointSize?: number, pointOpacity?: number }) {
    this.currentConfig = { ...this.currentConfig, ...animationConfig };

    if (this.sphereRef) {
      try {
        if (animationConfig.isRotating !== undefined || animationConfig.rotationSpeed !== undefined || animationConfig.animateClusters !== undefined) {
          set_animation_options(
            this.sphereRef,
            animationConfig.isRotating ?? this.currentConfig.isRotating ?? true,
            animationConfig.rotationSpeed ?? this.currentConfig.rotationSpeed ?? 0.1,
            animationConfig.animateClusters ?? this.currentConfig.animateClusters ?? false,
            this.sphereRef.jsonData
          );
        }
        if (animationConfig.pointSize !== undefined || animationConfig.pointOpacity !== undefined) {
          set_visual_options(
            this.sphereRef,
            animationConfig.pointSize ?? this.currentConfig.pointSize ?? 0.05,
            animationConfig.pointOpacity ?? this.currentConfig.pointOpacity ?? 0.5
          );
        }
        return;
      } catch (error) {
        // Fall through to re-render
      }
    }

    if (this.root) {
      const initial_data = this.currentConfig.data || { session: { session_id: this.currentConfig.sessionId } };
      this.root.render(
        <FeatrixSphereEmbedded
          initial_data={initial_data}
          apiBaseUrl={this.currentConfig.apiBaseUrl}
          authToken={this.currentConfig.authToken}
          isRotating={this.currentConfig.isRotating}
          rotationSpeed={this.currentConfig.rotationSpeed}
          animateClusters={this.currentConfig.animateClusters}
          pointSize={this.currentConfig.pointSize}
          pointOpacity={this.currentConfig.pointOpacity}
          theme={this.currentConfig.theme}
          backgroundColor={this.currentConfig.backgroundColor}
          pointAlpha={this.currentConfig.pointAlpha}
          colormap={this.currentConfig.colormap}
          onSphereReady={(sphereRef: any) => this.sphereRef = sphereRef}
        />
      );
    }
  }
}

declare global {
  interface Window {
    FeatrixSphereViewer: typeof FeatrixSphereViewer;
  }
}

window.FeatrixSphereViewer = FeatrixSphereViewer;

const scripts = document.querySelectorAll('script[src*="sphere-viewer"]');
const currentScript = scripts[scripts.length - 1] as HTMLElement;

const isFeatrixDomain = /featrix\.(com|ai)/i.test(window.location.hostname);
const isQuiet = currentScript?.getAttribute('data-quiet') === 'true';
if (isFeatrixDomain || !isQuiet) {
  console.log(
    `%c FeatrixSphereViewer v${SPHERE_VIEWER_VERSION} (standalone) %c https://github.com/Featrix/sphereviewer `,
    'background:#6366f1;color:#fff;font-weight:bold;padding:2px 4px;border-radius:3px 0 0 3px',
    'background:#1e1b4b;color:#a5b4fc;padding:2px 4px;border-radius:0 3px 3px 0'
  );
}

if (currentScript && (
  currentScript.hasAttribute('data-session-id') ||
  currentScript.hasAttribute('data-featrix-data') ||
  currentScript.hasAttribute('data-use-window-data')
)) {
  const viewer = new FeatrixSphereViewer();
}

export default FeatrixSphereViewer;
export { default as PlaybackController } from './PlaybackController';
export type { PlaybackCallbacks, PlaybackControllerProps, PlaybackControllerHandle } from './PlaybackController';
