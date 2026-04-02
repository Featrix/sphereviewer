/**
 * @license
 * Featrix Sphere Viewer - Embeddable 3D Data Visualization Component
 * 
 * Copyright (c) 2023-2025 Featrix
 * Licensed under the BSD 4-Clause License (see LICENSE file)
 * 
 * This file contains the main React component for embedded sphere visualization.
 */

import React, { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import FeatrixEmbeddingsExplorer, { find_best_cluster_number } from '../featrix_sphere_display';
import TrainingStatus from '../training_status';
import { fetch_session_data, fetch_session_projections, fetch_training_metrics, fetch_session_status, fetch_single_epoch, fetch_thumbnail_data, fetch_model_card, fetch_from_data_endpoint, fetch_training_glb, fetch_more_epoch_points, setRetryStatusCallback, ModelCard } from './embed-data-access';
import { parseTrainingGLB, glbToTrainingMovieData } from './glb-loader';
import { SphereRecord, SphereRecordIndex, remap_cluster_assignments, render_sphere, initialize_sphere, set_animation_options, set_visual_options, set_wireframe_opacity, load_training_movie, play_training_movie, stop_training_movie, pause_training_movie, resume_training_movie, step_training_movie_frame, goto_training_movie_frame, compute_cluster_convex_hulls, update_cluster_spotlight, show_search_results, clear_colors, toggle_bounds_box, add_selected_record, change_object_color, clear_selected_objects, set_cluster_color, clear_cluster_colors, change_cluster_count, get_active_cluster_count_key, compute_embedding_convex_hull, toggle_embedding_hull, toggle_great_circles, register_event_listener, set_cluster_color_mode, compute_epoch_movement_stats, compute_movement_histogram_data, set_movie_auto_loop, trim_trail_history, set_playback_speed, append_points_to_training_movie, toggle_voronoi, update_voronoi } from '../featrix_sphere_control';
import { v4 as uuid4 } from 'uuid';
import CollapsibleSection from './components/CollapsibleSection';
import { BoxPlotSparkline, themes, createTheme } from 'modern-boxplot-react';
import { LossPlotOverlay, MovementPlotOverlay, MovementHistogramByCluster } from './components/Charts';
import PlaybackController, { PlaybackControllerHandle } from './PlaybackController';
import { ThemeProvider, useTheme } from './ThemeContext';
import type { ThemeMode } from './theme';
import { sampleColormap, isValidColormap } from './colormaps';

// ============================================================================
// Safe localStorage utilities - NEVER crash on read/write failures
// ============================================================================
const STORAGE_KEY_PREFIX = 'featrix_sphere_';

function safeGetStorage<T>(key: string, defaultValue: T): T {
    try {
        const item = localStorage.getItem(STORAGE_KEY_PREFIX + key);
        if (item === null) return defaultValue;
        return JSON.parse(item) as T;
    } catch {
        // localStorage disabled, corrupted, or parse error - silently use default
        return defaultValue;
    }
}

function safeSetStorage<T>(key: string, value: T): void {
    try {
        localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(value));
    } catch {
        // localStorage disabled or full - silently ignore
    }
}

// Custom hook for persisted state
function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => safeGetStorage(key, defaultValue));

    const setPersistedState: React.Dispatch<React.SetStateAction<T>> = useCallback((value) => {
        setState((prev) => {
            const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
            safeSetStorage(key, newValue);
            return newValue;
        });
    }, [key]);

    return [state, setPersistedState];
}

// WebGL availability detection — cached at module load so we never re-test
let _webglAvailable: boolean | null = null;
function isWebGLAvailable(): boolean {
    if (_webglAvailable !== null) return _webglAvailable;
    try {
        const c = document.createElement('canvas');
        _webglAvailable = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
        _webglAvailable = false;
    }
    return _webglAvailable;
}

// Build timestamp for cache busting verification - set at module load time
const BUILD_TIMESTAMP = new Date().toISOString();

// Sphere Viewer version (matches package.json, auto-increments with git commits)
const SPHERE_VIEWER_VERSION = '1.220';

// Distribution Chart Component for Scalar Columns
const DistributionChart: React.FC<{
    distribution: Array<{ bin: number, count: number }>;
    min: number;
    max: number;
    searchValue: number | null;
}> = ({ distribution, min, max, searchValue }) => {
    const { theme } = useTheme();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const height = 80;
    const width = 300;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        const maxCount = Math.max(...distribution.map(d => d.count));
        const padding = 5;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2 - 15; // Extra space for labels

        // Draw bars
        distribution.forEach((item, i) => {
            const barWidth = chartWidth / distribution.length;
            const barHeight = (item.count / maxCount) * chartHeight;
            const x = padding + i * barWidth;
            const y = padding + chartHeight - barHeight;

            ctx.fillStyle = theme.accent;
            ctx.fillRect(x, y, barWidth - 1, barHeight);
        });

        // Draw search value marker
        if (searchValue !== null && !isNaN(searchValue) && searchValue >= min && searchValue <= max) {
            const normalizedPos = (searchValue - min) / (max - min);
            const x = padding + normalizedPos * chartWidth;

            ctx.strokeStyle = theme.error;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, padding);
            ctx.lineTo(x, padding + chartHeight);
            ctx.stroke();

            // Draw marker dot
            ctx.fillStyle = theme.error;
            ctx.beginPath();
            ctx.arc(x, padding + chartHeight, 4, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Draw axis labels
        ctx.fillStyle = theme.textTertiary;
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(min.toFixed(2), padding, height - 2);
        ctx.textAlign = 'right';
        ctx.fillText(max.toFixed(2), width - padding, height - 2);

        if (searchValue !== null && !isNaN(searchValue) && searchValue >= min && searchValue <= max) {
            const normalizedPos = (searchValue - min) / (max - min);
            const x = padding + normalizedPos * chartWidth;
            ctx.textAlign = 'center';
            ctx.fillStyle = theme.error;
            ctx.fillText(searchValue.toFixed(2), x, padding - 2);
        }
    }, [distribution, min, max, searchValue, theme]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ width: '100%', height: `${height}px`, border: `1px solid ${theme.textMuted}`, borderRadius: '3px' }}
        />
    );
};

// LocalStorage functions removed - direct data flow only

const getColumnTypes = (projections: any) => {
    try {
        var d: any = {};
        const items = projections.coords;
        for (var entry of items) {
            if (entry.scalar_columns) {
                const ks = Object.keys(entry.scalar_columns);
                for (var k of ks) {
                    if (d[k] === undefined) {
                        d[k] = 'scalar';
                    }
                }
            }

            if (entry.set_columns) {
                const ks = Object.keys(entry.set_columns);
                for (var k of ks) {
                    if (d[k] === undefined) {
                        d[k] = 'set';
                    }
                }
            }

            if (entry.string_columns) {
                const ks = Object.keys(entry.string_columns);
                for (var k of ks) {
                    if (d[k] === undefined) {
                        d[k] = 'string';
                    }
                }
            }
        }

        return d
    } catch (error) {
        // Error getting column types
        return null;
    }
}

function create_record_list(server_data: any): SphereRecord[] {
    let recordIndex: Array<SphereRecord> = new Array();

    if (!server_data) {
        return recordIndex;
    }

    for (let entry of server_data?.coords) {
        const uuid = String(uuid4());
        // Support both numeric keys ("0","1","2") from /projections
        // and named keys ("x","y","z") from /epoch_projections
        const cx = entry["0"] ?? entry["x"] ?? entry.x ?? 0;
        const cy = entry["1"] ?? entry["y"] ?? entry.y ?? 0;
        const cz = entry["2"] ?? entry["z"] ?? entry.z ?? 0;
        const sphere_record = {
            coords: {
                x: cx,
                y: cy,
                z: cz,
            },
            id: uuid,
            featrix_meta: {
                cluster_pre: entry.cluster_pre,
                webgl_id: null,
                __featrix_row_id: entry.__featrix_row_id,
                __featrix_row_offset: entry.__featrix_row_offset,
            },
            original: {
                ...(entry.set_columns || {}),
                ...(entry.scalar_columns || {}),
                ...(entry.string_columns || {})
            },
        };

        recordIndex.push(sphere_record);
    }

    return recordIndex;
}

function remap_server_cluster_assignments(clusterInfoByClusterCount: any) {
    if (!clusterInfoByClusterCount) {
        return;
    }

    const max_clusters = Object.keys(clusterInfoByClusterCount).length;
    for (let base_n_clusters = 2; base_n_clusters < max_clusters + 1; base_n_clusters++) {
        const base_clusters = clusterInfoByClusterCount[base_n_clusters].cluster_labels;
        const new_clusters = clusterInfoByClusterCount[base_n_clusters + 1].cluster_labels;
        const remap = remap_cluster_assignments(base_clusters, new_clusters);
        clusterInfoByClusterCount[base_n_clusters + 1].cluster_labels = new_clusters.map((label: number) => remap[label]);
    }
}

function fix_server_cluster_pre_assignments(serverData: any) {
    const clusterInfoByClusterCount = serverData?.entire_cluster_results;
    const best_cluster_number = find_best_cluster_number(clusterInfoByClusterCount);
    const best_cluster_idxs = clusterInfoByClusterCount[best_cluster_number].cluster_labels;

    serverData.coords.forEach((entry: any) => {
        const row_offset = entry.__featrix_row_offset;
        const new_cluster = best_cluster_idxs[row_offset];
        entry.cluster_pre = new_cluster;
    });
}



// Training Movie Component
interface TrainingMovieProps {
    sessionId: string;
    apiBaseUrl?: string;
    // JWT auth token - sent as Bearer token on all API requests
    authToken?: string;
    // Display mode: 'thumbnail' hides all UI controls
    mode?: 'thumbnail' | 'full';
    // Custom data endpoint URL - overrides the default epoch_projections URL
    dataEndpoint?: string;
    // Default alpha/opacity for points (0-1)
    pointAlpha?: number;
    // Matplotlib colormap name for cluster colors
    colormap?: string;
    // Callback when maximize button is clicked in thumbnail mode.
    // If not provided, defaults to browser fullscreen + switching to full mode.
    onMaximize?: (sessionId?: string) => void;
}

// ============================================================================
// Canvas2D Software Fallback Renderer - used when WebGL is unavailable
// ============================================================================
const kFallbackColors = [
    '#4C78A8', '#72B7B2', '#F58518', '#E45756', '#54A24B', '#B279A2',
    '#FF9DA6', '#9D755D', '#BAB0AC', '#79706E', '#D37295', '#8F6D31',
];

const Canvas2DFallback: React.FC<{
    trainingData: any;
    sessionProjections?: any;
    onFrameUpdate?: (frameInfo: { current: number; total: number; visible: number; epoch?: string }) => void;
    onReady?: (fakeSpherRef: any) => void;
    containerRef?: React.RefObject<HTMLDivElement>;
    showBanner?: boolean;
}> = ({ trainingData, sessionProjections, onFrameUpdate, onReady, containerRef, showBanner = true }) => {
    const { theme } = useTheme();
    const internalRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const actualRef = containerRef || internalRef;
    const animRef = useRef<number>(0);
    const stateRef = useRef({
        rotY: 0.3,
        rotX: 0.4,
        autoRotate: true,
        dragging: false,
        lastMouse: { x: 0, y: 0 },
        currentFrame: 0,
        playing: true,
        paused: false,
        frameTimer: 0,
    });

    useEffect(() => {
        if (!trainingData || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const epochKeys = Object.keys(trainingData).sort((a, b) => {
            return parseInt(a.replace('epoch_', '')) - parseInt(b.replace('epoch_', ''));
        });
        if (epochKeys.length === 0) return;

        const totalFrames = epochKeys.length;
        const state = stateRef.current;

        // Get cluster labels from session projections
        const getClusterLabel = (coord: any, epochKey: string): number => {
            const epochData = trainingData[epochKey];
            if (epochData?.entire_cluster_results) {
                const keys = Object.keys(epochData.entire_cluster_results);
                for (const k of keys) {
                    const cr = epochData.entire_cluster_results[k];
                    if (cr?.cluster_labels) {
                        const idx = epochData.coords.indexOf(coord);
                        if (idx >= 0 && idx < cr.cluster_labels.length) {
                            return cr.cluster_labels[idx];
                        }
                    }
                }
            }
            // Fallback: use cluster from coord itself
            if (coord.__featrix_cluster !== undefined) return coord.__featrix_cluster;
            if (coord.featrix_meta?.cluster_pre !== undefined) return coord.featrix_meta.cluster_pre;
            return 0;
        };

        const resize = () => {
            const parent = actualRef.current;
            if (!parent || !canvas) return;
            const pw = parent.clientWidth || 800;
            const ph = parent.clientHeight || 600;
            // Constrain to square so the sphere isn't stretched in tall/narrow containers
            const size = Math.min(pw, ph);
            const dpr = window.devicePixelRatio || 1;
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            canvas.style.width = size + 'px';
            canvas.style.height = size + 'px';
            canvas.style.left = Math.round((pw - size) / 2) + 'px';
            canvas.style.top = Math.round((ph - size) / 2) + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        const ro = new ResizeObserver(resize);
        if (actualRef.current) ro.observe(actualRef.current);

        // Project a 3D point to 2D given rotation angles
        const project = (x: number, y: number, z: number, w: number, h: number) => {
            // Rotate around Y axis
            const cosY = Math.cos(state.rotY), sinY = Math.sin(state.rotY);
            let rx = x * cosY + z * sinY;
            let rz = -x * sinY + z * cosY;
            // Rotate around X axis
            const cosX = Math.cos(state.rotX), sinX = Math.sin(state.rotX);
            let ry = y * cosX - rz * sinX;
            rz = y * sinX + rz * cosX;
            // Perspective projection — use uniform scale so sphere isn't distorted
            const fov = 3.0;
            const scale = fov / (fov + rz + 2);
            const uniform = Math.min(w, h) * 0.35;
            return {
                sx: w / 2 + rx * scale * uniform,
                sy: h / 2 - ry * scale * uniform,
                depth: rz,
                scale,
            };
        };

        const renderFrame = () => {
            const w = canvas.width / (window.devicePixelRatio || 1);
            const h = canvas.height / (window.devicePixelRatio || 1);
            ctx.clearRect(0, 0, w, h);

            // Background
            ctx.fillStyle = theme.canvas2dBg;
            ctx.fillRect(0, 0, w, h);

            const epochKey = epochKeys[state.currentFrame];
            const epochData = trainingData[epochKey];
            if (!epochData?.coords) return;

            // Project all points
            const projected = epochData.coords.map((coord: any, i: number) => {
                // Extract coordinates - handle all formats (array, {x,y,z}, {0,1,2})
                let px = 0, py = 0, pz = 0;
                if (Array.isArray(coord)) {
                    px = coord[0] ?? 0; py = coord[1] ?? 0; pz = coord[2] ?? 0;
                } else if (coord && typeof coord === 'object') {
                    if ('x' in coord && 'y' in coord && 'z' in coord) {
                        px = coord.x; py = coord.y; pz = coord.z;
                    } else if (0 in coord && 1 in coord && 2 in coord) {
                        px = coord[0]; py = coord[1]; pz = coord[2];
                    }
                }
                const p = project(px, py, pz, w, h);
                const cluster = getClusterLabel(coord, epochKey);
                return { ...p, cluster, index: i };
            });

            // Sort by depth (far to near) for painter's algorithm
            projected.sort((a: any, b: any) => a.depth - b.depth);

            // Draw points
            for (const pt of projected) {
                const radius = Math.max(1.5, 4 * pt.scale);
                const color = kFallbackColors[pt.cluster % kFallbackColors.length];
                const alpha = 0.3 + 0.5 * pt.scale;
                ctx.globalAlpha = Math.min(1, alpha);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(pt.sx, pt.sy, radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            // Epoch label
            ctx.fillStyle = theme.canvas2dText;
            ctx.font = '11px monospace';
            ctx.fillText(epochKey, 10, h - 10);

            if (onFrameUpdate) {
                onFrameUpdate({
                    current: state.currentFrame,
                    total: totalFrames,
                    visible: epochData.coords.length,
                    epoch: epochKey,
                });
            }
        };

        // Animation loop
        let lastFrameTime = 0;
        const frameInterval = 1500; // ms per epoch frame
        const loop = (time: number) => {
            if (state.autoRotate && !state.dragging) {
                state.rotY += 0.003;
            }
            if (state.playing && !state.paused) {
                if (time - lastFrameTime > frameInterval) {
                    state.currentFrame = (state.currentFrame + 1) % totalFrames;
                    lastFrameTime = time;
                }
            }
            renderFrame();
            animRef.current = requestAnimationFrame(loop);
        };
        animRef.current = requestAnimationFrame(loop);

        // Mouse/touch interaction for orbit
        const onMouseDown = (e: MouseEvent) => {
            state.dragging = true;
            state.lastMouse = { x: e.clientX, y: e.clientY };
        };
        const onMouseMove = (e: MouseEvent) => {
            if (!state.dragging) return;
            const dx = e.clientX - state.lastMouse.x;
            const dy = e.clientY - state.lastMouse.y;
            state.rotY += dx * 0.005;
            state.rotX += dy * 0.005;
            state.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.rotX));
            state.lastMouse = { x: e.clientX, y: e.clientY };
        };
        const onMouseUp = () => { state.dragging = false; };

        canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // Expose a minimal fake sphere interface so parent can call pause/resume
        // IMPORTANT: Do NOT include trainingMovieData - this makes all real sphere
        // control functions (pause/resume/step/goto) bail early with their guard checks
        const fakeSphere: any = {
            _canvas2dFallback: true,
            isPlayingMovie: true,
            _pausedByUser: false,
            currentEpoch: 0,
            // Stubs so real sphere functions don't crash if called on fake sphere
            pointObjectsByRecordID: new Map(),
            pointRecordsByID: new Map(),
            pointPositionHistory: new Map(),
            autoLoopMovie: false,
            movieAnimationRef: 0,
            _autoLoopCheckRef: undefined,
            isPhysicsRunning: false,
            physicsAnimationRef: undefined,
            frameUpdateCallback: onFrameUpdate || null,
            memoryTrailsGroup: null,
            convexHullsGroup: null,
            scene: null,
            camera: null,
            renderer: null,
            pause: () => { state.paused = true; state.playing = false; fakeSphere._pausedByUser = true; fakeSphere.isPlayingMovie = false; },
            resume: () => { state.paused = false; state.playing = true; fakeSphere._pausedByUser = false; fakeSphere.isPlayingMovie = true; },
            gotoFrame: (f: number) => { state.currentFrame = Math.max(0, Math.min(f, totalFrames - 1)); },
        };
        if (onReady) onReady(fakeSphere);

        return () => {
            cancelAnimationFrame(animRef.current);
            canvas.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            ro.disconnect();
        };
    }, [trainingData, sessionProjections, theme]);

    const banner = showBanner ? (
        <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(180, 60, 60, 0.9)', color: '#fff',
            padding: '6px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
            zIndex: 10, whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
            WebGL unavailable — using simplified 2D rendering
        </div>
    ) : null;
    if (containerRef) {
        return <>
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
            {banner}
        </>;
    }
    return (
        <div ref={internalRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
            {banner}
        </div>
    );
};

// Training Movie Sphere Component - handles everything internally
const TrainingMovieSphere: React.FC<{
    trainingData: any,
    sessionProjections?: any,
    lossData?: any,
    onReady?: (sphere: any) => void,
    onFrameUpdate?: (frameInfo: { current: number, total: number, visible: number, epoch?: string, validationLoss?: number, sphereCoverage?: number }) => void,
    onPointInspected?: (pointInfo: any) => void,
    rotationEnabled?: boolean,
    containerRef?: React.RefObject<HTMLDivElement>,
    onLoadingProgress?: (loaded: number, total: number) => void,
    pointSize?: number,
    pointAlpha?: number,
    trailLength?: number,
    forceCanvas2D?: boolean
}> = ({ trainingData, sessionProjections, lossData, onReady, onFrameUpdate, onPointInspected, rotationEnabled = true, containerRef, onLoadingProgress, pointSize = 0.05, pointAlpha = 0.5, trailLength = 12, forceCanvas2D = false }) => {
    const internalContainerRef = useRef<HTMLDivElement>(null);
    const actualContainerRef = containerRef || internalContainerRef;
    const sphereRef = useRef<any>(null);
    const [webglFailed, setWebglFailed] = useState(forceCanvas2D);

    useEffect(() => {
        if (!actualContainerRef.current || !trainingData || webglFailed) {
            return;
        }

        if (!sphereRef.current && trainingData && sessionProjections) {
            
            // Initialize sphere for training movie (as it was working)

            // Get training movie record IDs from first epoch
            const firstEpoch = Object.keys(trainingData)[0];
            const firstEpochData = trainingData[firstEpoch];
            const trainingRecordIds = new Set(firstEpochData.coords.map((c: any) => c.__featrix_row_id || c.__featrix_row_offset));

            // Extract cluster results from first epoch (each epoch has its own cluster results)
            const clusterResults = firstEpochData.entire_cluster_results || sessionProjections.entire_cluster_results || {};
            console.log('Cluster results available:', Object.keys(clusterResults).length > 0 ? `Yes (${Object.keys(clusterResults).length} cluster counts)` : 'No');

            // Use the first epoch's coords as the base data structure
            // The training movie will update these coords over time
            const filteredSessionData = {
                ...sessionProjections,
                coords: firstEpochData.coords || [],
                entire_cluster_results: clusterResults
            };
            
            // Initialize sphere with filtered records that match training movie
            const recordList = create_record_list(filteredSessionData);
            // Use batched loading for large datasets (batchSize = 200 points per frame)
            const batchSize = recordList.length > 500 ? 200 : 0; // 0 = no batching for small datasets
            try {
                sphereRef.current = initialize_sphere(actualContainerRef.current, recordList, batchSize, onLoadingProgress || undefined);
            } catch (webglErr: any) {
                console.error('WebGL initialization failed, switching to Canvas2D fallback:', webglErr);
                setWebglFailed(true);
                return;
            }
            // Set initial visual options
            if (sphereRef.current) {
                set_visual_options(sphereRef.current, pointSize, pointAlpha);
            }

            // Set session projections data for training movie with cluster results from first epoch
            sphereRef.current.jsonData = {
                ...filteredSessionData,
                entire_cluster_results: clusterResults
            };
            
            // Set frame update callback
            if (onFrameUpdate) {
                sphereRef.current.frameUpdateCallback = onFrameUpdate;
            }
            
            // Set point inspection callback using register_event_listener
            if (onPointInspected) {
                register_event_listener(sphereRef.current, 'pointInspected', (event: any) => {
                    onPointInspected(event.detail);
                });
            }
            
            // Set up training movie visual options - use props, not hardcoded values
            set_animation_options(sphereRef.current, rotationEnabled, 0.02, false, sphereRef.current.jsonData);
            set_visual_options(sphereRef.current, pointSize, pointAlpha);
            
            // Load training movie data (like it was working)
            load_training_movie(sphereRef.current, trainingData, lossData, sessionProjections);
            
            // Force initial resize to fill container completely
            if (actualContainerRef.current && sphereRef.current) {
                const width = actualContainerRef.current.clientWidth || actualContainerRef.current.offsetWidth || 800;
                const height = actualContainerRef.current.clientHeight || actualContainerRef.current.offsetHeight || 600;
                sphereRef.current.renderer.setSize(width, height);
                sphereRef.current.camera.aspect = width / height;
                sphereRef.current.camera.updateProjectionMatrix();
                render_sphere(sphereRef.current);
            }
            
            // Add resize observer to ensure renderer ALWAYS fills container
            const resizeObserver = new ResizeObserver((entries) => {
                if (sphereRef.current && actualContainerRef.current) {
                    const entry = entries[0];
                    const width = entry.contentRect.width || actualContainerRef.current.clientWidth;
                    const height = entry.contentRect.height || actualContainerRef.current.clientHeight;
                    if (width > 0 && height > 0) {
                        sphereRef.current.renderer.setSize(width, height);
                        sphereRef.current.camera.aspect = width / height;
                        sphereRef.current.camera.updateProjectionMatrix();
                        render_sphere(sphereRef.current);
                    }
                }
            });
            
            if (actualContainerRef.current) {
                resizeObserver.observe(actualContainerRef.current);
                // Store observer for cleanup
                (sphereRef.current as any).__resizeObserver = resizeObserver;
            }
            
            // Disable physics effect between loops - sphere stays put
            set_movie_auto_loop(sphereRef.current, false);
            // Set trail length from persisted settings
            sphereRef.current.memoryTrailLength = trailLength;
            // Start playing the training movie
            play_training_movie(sphereRef.current, 10);
            // Notify parent that sphere is ready
            if (onReady) {
                onReady(sphereRef.current);
            }
        }
    }, [trainingData, sessionProjections, onReady, onLoadingProgress, pointSize, pointAlpha, rotationEnabled, webglFailed]);

    // Update rotation controls when rotationEnabled changes
    useEffect(() => {
        if (sphereRef.current) {
            set_animation_options(sphereRef.current, rotationEnabled, 0.02, false, sphereRef.current.jsonData);
        }
    }, [rotationEnabled]);

    // Update trail length when it changes - also trim existing history immediately
    useEffect(() => {
        if (sphereRef.current) {
            sphereRef.current.memoryTrailLength = trailLength;
            // Trim existing trail history to match new setting immediately
            trim_trail_history(sphereRef.current);
        }
    }, [trailLength]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (sphereRef.current) {
                stop_training_movie(sphereRef.current);
                // Cleanup resize observer
                if ((sphereRef.current as any).__resizeObserver) {
                    (sphereRef.current as any).__resizeObserver.disconnect();
                }
            }
        };
    }, []);

    // WebGL failed or forced Canvas2D - render Canvas2D fallback
    if (webglFailed) {
        return (
            <Canvas2DFallback
                trainingData={trainingData}
                sessionProjections={sessionProjections}
                onFrameUpdate={onFrameUpdate}
                onReady={onReady}
                containerRef={containerRef}
                showBanner={!forceCanvas2D}
            />
        );
    }

    // If containerRef is provided from parent, don't render our own div
    // The parent will handle the container div
    if (containerRef) {
        return null;
    }

    return (
        <div
            ref={internalContainerRef}
            style={{
                width: '100%',
                height: '100%',
                background: 'transparent'
            }}
        />
    );
};

const TrainingMovie: React.FC<TrainingMovieProps> = ({ sessionId, apiBaseUrl, authToken, mode, dataEndpoint, pointAlpha: defaultPointAlpha, colormap, onMaximize }) => {
    const { theme, backgroundColor: bgOverride } = useTheme();
    // NOTE: Loading training movie from API (the working version)
    const [trainingData, setTrainingData] = useState<any>(null);
    const [lossData, setLossData] = useState<any>(null);
    const [sessionProjections, setSessionProjections] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [waitingForData, setWaitingForData] = useState(false);
    const [waitingCountdown, setWaitingCountdown] = useState(30);
    const [waitingSessionInfo, setWaitingSessionInfo] = useState<any>(null);
    const [loadRetryTrigger, setLoadRetryTrigger] = useState(0);

    // Performance timing
    const componentStartTime = useRef(performance.now());
    const hasLoggedInit = useRef(false);
    if (!hasLoggedInit.current) {
        hasLoggedInit.current = true;
    }
    const initialLoadCompleteTime = useRef<number>(0); // Track when initial load finished
    const [sphereRef, setSphereRef] = useState<any>(null);
    const [loadedPointCount, setLoadedPointCount] = useState<number>(0);
    const [totalPointCount, setTotalPointCount] = useState<number | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const outerContainerRef = useRef<HTMLDivElement>(null);
    const [frameInfo, setFrameInfo] = useState<{ current: number, total: number, visible: number, epoch?: string, validationLoss?: number, sphereCoverage?: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(true); // Start playing automatically
    const [playbackSpeed, setPlaybackSpeed] = usePersistedState('playbackSpeed', 1.0); // 1x = normal speed
    const [frameInput, setFrameInput] = useState<string>('');
    const [showDynamicHulls, setShowDynamicHulls] = usePersistedState('showDynamicHulls', false);
    const [trailLength, setTrailLength] = usePersistedState('trailLength', 12);
    const [spotlightCluster, setSpotlightCluster] = useState<number>(-1); // -1 = off, 0+ = cluster number (not persisted - session specific)
    const sportMode = false; // Sport mode disabled
    const [showClusterAnalysis, setShowClusterAnalysis] = useState(false); // Cluster analysis modal
    const [clusterAnalysisView, setClusterAnalysisView] = useState<'signatures' | 'fields' | 'details'>('signatures');
    const [analysisClusterCount, setAnalysisClusterCount] = useState<string | null>(null); // null = use active, "4", "8", "12" etc
    const [clusterColorMode, setClusterColorMode] = usePersistedState<'final' | 'per-epoch'>('clusterColorMode', 'final');
    const [isManifoldViz, setIsManifoldViz] = useState(false);
    const [showCountdown, setShowCountdown] = useState(false);
    const [countdownText, setCountdownText] = useState('');
    const sphereRefForCountdown = useRef<any>(null); // Add ref to store sphere for countdown
    const [showGestureHints, setShowGestureHints] = useState(false);
    const gestureHintsShown = useRef(false);
    
    // Cluster debugging state
    const [showClusterDebug, setShowClusterDebug] = useState(false);
    const [selectedPointInfo, setSelectedPointInfo] = useState<any>(null);
    const [showColorLegend, setShowColorLegend] = useState(false);

    // Data inspector state
    const [selectedPoints, setSelectedPoints] = useState<any[]>([]);
    const [showDataInspector, setShowDataInspector] = useState(false);
    const [hideNulls, setHideNulls] = useState(false);
    const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);
    const [inspectorFieldSearch, setInspectorFieldSearch] = useState('');
    const [inspectorPosition, setInspectorPosition] = useState({ x: 100, y: 100 });
    const [isDraggingInspector, setIsDraggingInspector] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Handle dragging the data inspector
    useEffect(() => {
        if (!isDraggingInspector) return;

        const handleMouseMove = (e: MouseEvent) => {
            setInspectorPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        };

        const handleMouseUp = () => {
            setIsDraggingInspector(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingInspector, dragOffset]);
    const [showSidePanelInFullscreen, setShowSidePanelInFullscreen] = useState(false);

    // Mobile detection (<900px) and wide screen detection (≥1400px)
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 900);
    const [isWideScreen, setIsWideScreen] = useState(typeof window !== 'undefined' && window.innerWidth >= 1400);
    const [showMobilePanel, setShowMobilePanel] = useState(false);

    // Page load time for debugging (captured once on mount)
    const pageLoadTime = useMemo(() => {
        const now = new Date();
        return now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    }, []);

    // Thumbnail mode - hide all controls
    // If mode='thumbnail' prop is passed, always use thumbnail mode
    // If mode='full' prop is passed, never use thumbnail mode
    // Otherwise, detect based on container size
    const [isThumbnail, setIsThumbnail] = useState(mode === 'thumbnail');
    const [isSmallViewport, setIsSmallViewport] = useState(false);

    // Detect thumbnail mode from OUTER container size (only if mode not explicitly set)
    // AND always detect isSmallViewport from container div size
    useEffect(() => {
        if (!outerContainerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            const width = entry.contentRect.width;
            const height = entry.contentRect.height;
            // Always update viewport size from container div
            setIsSmallViewport(width < 1000 || height < 700);
            // Only auto-detect thumbnail mode if mode not explicitly set
            if (mode !== 'thumbnail' && mode !== 'full') {
                setIsThumbnail(width < 800 || height < 600);
            }
        });
        resizeObserver.observe(outerContainerRef.current);
        if (mode === 'thumbnail') setIsThumbnail(true);
        if (mode === 'full') setIsThumbnail(false);
        return () => resizeObserver.disconnect();
    }, [mode]);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 900);
            setIsWideScreen(window.innerWidth >= 1400);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Show gesture hints on first mobile load
    useEffect(() => {
        if (isMobile && !loading && trainingData && !gestureHintsShown.current) {
            gestureHintsShown.current = true;
            setShowGestureHints(true);
            const timer = setTimeout(() => setShowGestureHints(false), 4000);
            return () => clearTimeout(timer);
        }
    }, [isMobile, loading, trainingData]);

    // Rotation control state - persisted
    const [rotationEnabled, setRotationEnabled] = usePersistedState('rotationEnabled', true);

    // Point visual controls - optimized for performance, persisted
    // Mobile gets 2x default point size for better visibility on small screens
    const [pointSize, setPointSize] = usePersistedState('pointSize', isMobile ? 0.02 : 0.01);
    const [pointAlpha, setPointAlpha] = usePersistedState('pointAlpha', defaultPointAlpha ?? 0.50);
    const [wireframeOpacity, setWireframeOpacity] = usePersistedState('wireframeOpacity', 0.05);
    const [alphaByMovement, setAlphaByMovement] = usePersistedState('alphaByMovement', false);
    const [loadingProgress, setLoadingProgress] = useState<{ loaded: number, total: number } | null>(null);
    
    // Movement histogram state
    const [movementData, setMovementData] = useState<Array<{ epoch: string, mean: number, median: number, p90: number, max: number }>>([]);
    const [showMovementPlot, setShowMovementPlot] = usePersistedState('showMovementPlot', true);
    const [showMovementHistogram, setShowMovementHistogram] = useState(false);

    // Compute current epoch's movement stats
    const currentEpochMovement = useMemo(() => {
        if (!frameInfo?.epoch || movementData.length === 0) return null;
        return movementData.find(d => d.epoch === frameInfo.epoch) || null;
    }, [frameInfo?.epoch, movementData]);

    // Compute histogram data for current epoch (movement distribution by cluster)
    const currentHistogramData = useMemo(() => {
        if (!sphereRef || !frameInfo?.epoch || !trainingData) return null;
        return compute_movement_histogram_data(sphereRef, trainingData, frameInfo.epoch);
    }, [sphereRef, frameInfo?.epoch, trainingData]);

    // Playback overlay ref (visibility managed inside PlaybackController)
    const playbackRef = useRef<PlaybackControllerHandle>(null);
    const mobileLastTapRef = useRef<number>(0);

    const handleCanvasTap = useCallback(() => {
        const now = Date.now();
        if (now - mobileLastTapRef.current < 300) return;
        mobileLastTapRef.current = now;
        playbackRef.current?.toggle();
    }, []);

    const handleCanvasMouseMove = useCallback(() => {
        playbackRef.current?.show();
    }, []);

    const handleCanvasMouseLeave = useCallback(() => {
        // PlaybackController handles its own hide-on-leave internally
    }, []);

    // Load more points handler
    const handleLoadMore = useCallback(async () => {
        if (isLoadingMore || !sessionId || totalPointCount === null || loadedPointCount >= totalPointCount) return;
        setIsLoadingMore(true);
        try {
            const moreData = await fetch_more_epoch_points(sessionId, 1000, loadedPointCount, apiBaseUrl, authToken);
            if (moreData?.epoch_projections && sphereRef) {
                append_points_to_training_movie(sphereRef, moreData.epoch_projections);

                // Update React state to stay in sync
                setTrainingData((prev: any) => {
                    if (!prev) return prev;
                    const updated = { ...prev };
                    for (const epochKey of Object.keys(moreData.epoch_projections)) {
                        if (updated[epochKey]) {
                            updated[epochKey] = {
                                ...updated[epochKey],
                                coords: [...updated[epochKey].coords, ...moreData.epoch_projections[epochKey].coords]
                            };
                        }
                    }
                    return updated;
                });

                const newBatchSize = moreData.epoch_projections[Object.keys(moreData.epoch_projections)[0]]?.coords?.length || 0;
                setLoadedPointCount(prev => prev + newBatchSize);
            }
        } catch (err) {
            console.error('Failed to load more points:', err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, sessionId, loadedPointCount, totalPointCount, apiBaseUrl, authToken, sphereRef]);

    // Search state
    const [columnTypes, setColumnTypes] = useState<any>(null);
    const [columnMiRankings, setColumnMiRankings] = useState<Array<{column: string, type: string, mi_score: number}> | null>(null);
    const [selectedSearchColumn, setSelectedSearchColumn] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showSearch, setShowSearch] = useState(false);
    const [showBoundsBox, setShowBoundsBox] = usePersistedState('showBoundsBox', false);
    const [showGreatCircles, setShowGreatCircles] = usePersistedState('showGreatCircles', false);
    const [showModelCard, setShowModelCard] = useState(false);
    const [modelCardData, setModelCardData] = useState<any>(null);
    const [modelCardLoading, setModelCardLoading] = useState(false);
    const [modelCardError, setModelCardError] = useState<string | null>(null);
    const modelCardContainerRef = useRef<HTMLDivElement>(null);
    
    // Color rules state - each rule has a query, column, color, and record IDs
    const [colorRules, setColorRules] = useState<Array<{
        id: string;
        query: string;
        column: string;
        color: string;
        recordIds: string[];
    }>>([]);
    
    // Color palette for assigning colors to rules
    const colorPalette = [
        '#ff0000', // Red
        '#00ff00', // Green
        '#0000ff', // Blue
        '#ffff00', // Yellow
        '#ff00ff', // Magenta
        '#00ffff', // Cyan
        '#ff8800', // Orange
        '#8800ff', // Purple
        '#00ff88', // Teal
        '#ff0088', // Pink
        '#8888ff', // Light Blue
        '#ff8888', // Light Red
    ];
    // Note: Unit sphere is always visible now (created automatically in initialize_sphere)
    
    // Training status state
    const [trainingStatus, setTrainingStatus] = useState<'loading' | 'training' | 'completed' | null>(null);
    const [loadingStep, setLoadingStep] = useState<string>('Connecting to server...');
    const [loadingDetail, setLoadingDetail] = useState<string>('');
    const [nextCheckCountdown, setNextCheckCountdown] = useState<number>(30);

    // Retry status for API failures
    const [retryStatus, setRetryStatus] = useState<{
        isRetrying: boolean;
        attempt: number;
        nextRetryIn: number;
        totalElapsed: number;
        error: string;
    } | null>(null);

    // Set up the retry status callback
    useEffect(() => {
        setRetryStatusCallback((status) => {
            setRetryStatus(status.isRetrying ? status : null);
        });
        return () => setRetryStatusCallback(null);
    }, []);

    // Load model card when modal opens
    useEffect(() => {
        // Fetch model card when either Model Card panel OR Cluster Analysis modal opens
        if (!showModelCard && !showClusterAnalysis) return;

        const loadModelCard = async () => {
            // Skip if already loaded
            if (modelCardData) return;

            setModelCardLoading(true);
            setModelCardError(null);

            try {
                // Load the external model card library if not already loaded (only needed for Model Card panel)
                if (showModelCard && !(window as any).FeatrixModelCard) {
                    await new Promise<void>((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://bits.featrix.com/js/featrix-modelcard/model-card.js';
                        script.onload = () => resolve();
                        script.onerror = () => reject(new Error('Failed to load model card library'));
                        document.head.appendChild(script);
                    });
                }

                // Fetch model card data from API
                const baseUrl = apiBaseUrl || 'https://sphere-api.featrix.com';
                const response = await fetch(`${baseUrl}/compute/session/${sessionId}/model_card`, authToken ? { headers: { 'Authorization': `Bearer ${authToken}` } } : undefined);
                if (!response.ok) {
                    throw new Error(`Failed to fetch model card: ${response.status}`);
                }
                const data = await response.json();
                setModelCardData(data);
                console.log('📊 Model card loaded with', Object.keys(data.column_statistics || {}).length, 'column statistics');
            } catch (err) {
                console.error('Error loading model card:', err);
                setModelCardError(err instanceof Error ? err.message : 'Failed to load model card');
            } finally {
                setModelCardLoading(false);
            }
        };

        loadModelCard();
    }, [showModelCard, showClusterAnalysis, sessionId, apiBaseUrl, modelCardData]);

    // Render model card when data is available
    useEffect(() => {
        if (!showModelCard || !modelCardData || !modelCardContainerRef.current) return;

        const FeatrixModelCard = (window as any).FeatrixModelCard;
        if (FeatrixModelCard) {
            const html = FeatrixModelCard.renderHTML(modelCardData);
            modelCardContainerRef.current.innerHTML = html;
            FeatrixModelCard.attachEventListeners(modelCardContainerRef.current);
        }
    }, [showModelCard, modelCardData]);

    // Countdown function for initial pause - using useCallback to ensure stable reference
    const startCountdown = useCallback(() => {
        setShowCountdown(true);
        setCountdownText('Ready!');

        setTimeout(() => {
            setCountdownText('3');
            setTimeout(() => {
                setCountdownText('2');
                setTimeout(() => {
                    setCountdownText('1');
                    setTimeout(() => {
                        setCountdownText('Go!');
                        setTimeout(() => {
                            setShowCountdown(false);
                            // Start the training movie using the ref
                            if (sphereRefForCountdown.current) {
                                if (sphereRefForCountdown.current._canvas2dFallback) {
                                    // Canvas2D fallback handles its own playback
                                    sphereRefForCountdown.current.resume();
                                } else {
                                    resume_training_movie(sphereRefForCountdown.current);
                                }
                                setIsPlaying(true);
                            } else {
                                // No sphere reference available after countdown
                            }
                        }, 400);
                    }, 500);
                }, 500);
            }, 500);
        }, 250);
    }, []); // Remove sphereRef dependency since we're using the ref now

    useEffect(() => {
        const loadTrainingData = async () => {
            let slowFetchTimer: ReturnType<typeof setTimeout> | undefined;
            try {
                setLoading(true);

                // THUMBNAIL MODE: Fast path - only load final projections
                if (mode === 'thumbnail') {
                    setLoadingStep('Loading...');
                    const thumbnailData = await fetch_thumbnail_data(sessionId, apiBaseUrl, authToken);
                    if (thumbnailData && thumbnailData.coords && thumbnailData.coords.length > 0) {
                        // Create a single "epoch" from the final projections
                        const finalEpoch = {
                            coords: thumbnailData.coords,
                            entire_cluster_results: thumbnailData.entire_cluster_results
                        };
                        setTrainingData({ 'final': finalEpoch });
                        setSessionProjections({
                            coords: thumbnailData.coords,
                            entire_cluster_results: thumbnailData.entire_cluster_results
                        });
                        setLoading(false);
                        return;
                    }
                    // Fall through to full load if thumbnail fetch failed
                    console.warn('Thumbnail fetch failed, falling back to full load');
                }

                setLoadingStep('Fetching training epochs...');
                setLoadingDetail('');

                // Show "Still loading..." message if fetch takes > 10s
                slowFetchTimer = setTimeout(() => {
                    setLoadingDetail('Still loading — large dataset, please wait...');
                }, 10000);

                // Helper to format bytes
                const formatBytes = (bytes: number) => {
                    if (bytes < 1024) return `${bytes} B`;
                    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                };

                // TRAINING MOVIE: Load from API with retry logic for 504/500 errors
                let apiTrainingData;

                const progressCallback = (info: { bytesLoaded: number, totalBytes?: number, phase: string }) => {
                    if (info.phase === 'downloading') {
                        const progress = info.totalBytes
                            ? `${formatBytes(info.bytesLoaded)} / ${formatBytes(info.totalBytes)}`
                            : `Downloaded ${formatBytes(info.bytesLoaded)}`;
                        setLoadingDetail(progress);
                    } else if (info.phase === 'parsing') {
                        setLoadingStep('Parsing epoch data...');
                        setLoadingDetail(formatBytes(info.bytesLoaded));
                    }
                };

                if (dataEndpoint) {
                    // Custom data endpoint (e.g., manifold_viz)
                    apiTrainingData = await fetch_from_data_endpoint(dataEndpoint, undefined, progressCallback, authToken);
                } else {
                    // Try GLB binary format first (much smaller downloads)
                    try {
                        setLoadingStep('Fetching training data...');
                        const glbResult = await fetch_training_glb(sessionId, apiBaseUrl, progressCallback, authToken);
                        if (glbResult) {
                            setLoadingStep('Decoding binary data...');
                            const parsed = parseTrainingGLB(glbResult.glbBuffer);
                            const converted = glbToTrainingMovieData(parsed, glbResult.sidecar);
                            apiTrainingData = {
                                epoch_projections: converted.epoch_projections,
                                training_metrics: converted.training_metrics,
                                _glb_session_cluster_results: converted.session_cluster_results,
                            };
                            console.log('📦 Using GLB binary format');
                        }
                    } catch (glbErr) {
                        console.warn('📦 GLB parse failed, falling back to JSON:', glbErr);
                        apiTrainingData = undefined;
                    }

                    // Fall back to JSON epoch_projections
                    if (!apiTrainingData) {
                        setLoadingStep('Fetching training epochs...');
                        let retryCount = 0;
                        const maxRetries = 3;

                        while (retryCount <= maxRetries) {
                            try {
                                apiTrainingData = await fetch_training_metrics(
                                    sessionId,
                                    apiBaseUrl,
                                    undefined, // epoch limit
                                    progressCallback,
                                    authToken,
                                    1000, // pointLimit - initial batch
                                    0     // pointOffset
                                );
                                break; // Success
                            } catch (err: any) {
                                const is504 = err.message?.includes('504') || err.message?.includes('Gateway Timeout');
                                const is500 = err.message?.includes('500') || err.message?.includes('Internal Server Error');
                                if ((is504 || is500) && retryCount < maxRetries) {
                                    retryCount++;
                                    const waitTime = retryCount * 5;
                                    setLoadingStep(`Server timeout, retrying (${retryCount}/${maxRetries})...`);
                                    for (let i = waitTime; i > 0; i--) {
                                        setLoadingDetail(`Retrying in ${i}s...`);
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                    }
                                    setLoadingStep('Fetching training epochs...');
                                    setLoadingDetail('');
                                } else {
                                    throw err;
                                }
                            }
                        }
                    }
                }
                if (!apiTrainingData) throw new Error('Failed to load training data after retries');

                if (apiTrainingData && apiTrainingData.epoch_projections) {
                    const epochCount = Object.keys(apiTrainingData.epoch_projections).length;
                    if (epochCount === 0) {
                        throw new Error('No epoch data available for this session. The training data may not have been saved or has been cleaned up.');
                    }
                    const firstEpochKey = Object.keys(apiTrainingData.epoch_projections)[0];
                    const firstEpochObj = apiTrainingData.epoch_projections[firstEpochKey];
                    const pointCount = firstEpochObj?.coords?.length || 0;
                    if (pointCount === 0) {
                        throw new Error('Epoch data exists but contains no points. The projection data may be corrupted or incomplete.');
                    }

                    // Track pagination state from API response
                    setLoadedPointCount(pointCount);
                    if (firstEpochObj?.total_count !== undefined) {
                        setTotalPointCount(firstEpochObj.total_count);
                    }

                    // Detect manifold visualization mode
                    const detectedManifoldViz = apiTrainingData.epoch_projections[firstEpochKey]?.is_manifold_viz === true;
                    if (detectedManifoldViz) {
                        console.log('🔬 Manifold visualization mode detected');
                        setIsManifoldViz(true);
                    }

                    // Try to fetch final projections for cluster results AND full dataset
                    let clusterResults: Record<string, any> = {};
                    let fullProjectionsCoords: any[] = [];
                    let sourceDataByRowId: Map<number, any> = new Map();

                    // If GLB provided session cluster results, use those
                    if (apiTrainingData._glb_session_cluster_results) {
                        clusterResults = apiTrainingData._glb_session_cluster_results;
                        console.log('📦 Using cluster results from GLB sidecar:', Object.keys(clusterResults).length, 'cluster counts');
                    }

                    // Skip supplementary fetches for custom data endpoints (e.g., manifold_viz)
                    // Also skip if GLB already provided everything we need
                    if (!dataEndpoint && !apiTrainingData._glb_session_cluster_results) {
                        setLoadingStep('Fetching full projections...');
                        setLoadingDetail(`${epochCount} epochs, ${pointCount} points per epoch`);

                        const baseUrl = apiBaseUrl || (window.location.hostname === 'localhost'
                            ? window.location.origin + '/proxy/featrix'
                            : 'https://sphere-api.featrix.com');

                        // Fetch /projections AND source_data in parallel
                        // /projections has cluster results + categorized columns (set/scalar/string)
                        // source_data has ALL original columns from the dataset
                        const fetchProjections = fetch(
                            `${baseUrl}/compute/session/${sessionId}/projections?limit=1000`,
                            authToken ? { headers: { 'Authorization': `Bearer ${authToken}` } } : undefined
                        ).then(async (resp) => {
                            if (resp.ok) {
                                const projectionsData = await resp.json();
                                if (projectionsData.projections?.entire_cluster_results) {
                                    clusterResults = projectionsData.projections.entire_cluster_results;
                                    console.log('Found cluster results in final projections:', Object.keys(clusterResults).length, 'cluster counts');
                                }
                                if (projectionsData.projections?.coords) {
                                    fullProjectionsCoords = projectionsData.projections.coords;
                                    console.log('📊 Got full projections with', fullProjectionsCoords.length, 'coords');
                                }
                            } else {
                                const errBody = await resp.text().catch(() => '');
                                console.warn(`⚠️ /projections returned ${resp.status}: ${errBody}`);
                            }
                        }).catch(err => {
                            console.warn('⚠️ /projections failed:', err);
                        });

                        const fetchSourceData = fetch(
                            `${baseUrl}/compute/session/${sessionId}/epoch_projections?include_source_data=true&limit=1`,
                            authToken ? { headers: { 'Authorization': `Bearer ${authToken}` } } : undefined
                        ).then(async (resp) => {
                            if (resp.ok) {
                                const sourceData = await resp.json();
                                if (sourceData.source_data_enriched && sourceData.epoch_projections) {
                                    const epochKey = Object.keys(sourceData.epoch_projections)[0];
                                    const epochCoords = sourceData.epoch_projections[epochKey]?.coords || [];

                                    epochCoords.forEach((coord: any) => {
                                        if (coord.source_data && coord.__featrix_row_id !== undefined) {
                                            sourceDataByRowId.set(coord.__featrix_row_id, coord.source_data);
                                        }
                                    });
                                    console.log('📊 Cached source_data for', sourceDataByRowId.size, 'points via include_source_data');
                                }
                            }
                        }).catch(err => {
                            console.log('⚠️ source_data fetch failed:', err);
                        });

                        await Promise.all([fetchProjections, fetchSourceData]);
                    }

                    setLoadingStep('Processing data...');
                    setLoadingDetail(`${epochCount} epochs, ${pointCount} points` + (fullProjectionsCoords.length > 0 ? `, ${fullProjectionsCoords.length} full projection rows` : ''));

                    setTrainingData(apiTrainingData.epoch_projections);

                    // Build final coords with source data
                    let finalCoords: any[];
                    if (fullProjectionsCoords.length > 0) {
                        finalCoords = fullProjectionsCoords;
                        console.log('📊 Using full projections coords');
                    } else {
                        finalCoords = apiTrainingData.epoch_projections[Object.keys(apiTrainingData.epoch_projections)[0]]?.coords || [];
                        console.log('📊 Using epoch coords');
                    }

                    // Enrich coords with full source_data (all original columns) if available
                    if (sourceDataByRowId.size > 0) {
                        finalCoords = finalCoords.map((coord: any) => {
                            const sourceData = sourceDataByRowId.get(coord.__featrix_row_id);
                            if (sourceData) {
                                return {
                                    ...coord,
                                    source_data: sourceData
                                };
                            }
                            return coord;
                        });
                        const enrichedCount = finalCoords.filter((c: any) => c.source_data).length;
                        console.log('📊 Enriched', enrichedCount, 'of', finalCoords.length, 'coords with full source_data');
                    }

                    const sessionData = {
                        ...apiTrainingData,
                        entire_cluster_results: clusterResults,
                        coords: finalCoords,
                        sourceDataByRowId: sourceDataByRowId.size > 0 ? sourceDataByRowId : undefined  // Pass the map for use in load_training_movie
                    };
                    setSessionProjections(sessionData);
                    
                    // Extract column types from first epoch for search functionality
                    const firstEpoch = apiTrainingData.epoch_projections[firstEpochKey];
                    if (firstEpoch && firstEpoch.coords) {
                        // Log total points across all epochs
                        let totalPointsAcrossEpochs = 0;
                        Object.keys(apiTrainingData.epoch_projections).forEach(epochKey => {
                            const epoch = apiTrainingData.epoch_projections[epochKey];
                            if (epoch && epoch.coords) {
                                totalPointsAcrossEpochs += epoch.coords.length;
                            }
                        });
                        // Use sessionData.coords (which has full projections with actual columns) instead of epoch coords (which have synthetic training columns)
                        const types = getColumnTypes({ coords: sessionData.coords });
                        setColumnTypes(types);
                        if (Object.keys(types).length > 0) {
                            setSelectedSearchColumn(Object.keys(types)[0]);
                        }
                    }
                    
                    // Use API training metrics for loss plot
                    if (apiTrainingData.training_metrics) {
                        setLossData(apiTrainingData.training_metrics);
                    }

                    // Store column MI rankings if available
                    if (apiTrainingData.column_mi_rankings) {
                        setColumnMiRankings(apiTrainingData.column_mi_rankings);
                        console.log(`📊 Loaded ${apiTrainingData.column_mi_rankings.length} column MI rankings`);
                    }
                } else {
                    console.error('No epoch_projections in API response');
                    throw new Error('No training movie data from API');
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const is404 = errMsg.includes('404') || errMsg.includes('Not Found');

                if (is404) {
                    // No data yet - training is probably still early. Enter waiting mode.
                    console.log('Training data not available yet (404), will poll...');
                    setWaitingForData(true);
                    setError(null);
                } else {
                    console.error('Error loading training movie:', err);
                    setError(errMsg);
                }
            } finally {
                clearTimeout(slowFetchTimer);
                setLoading(false);
                initialLoadCompleteTime.current = Date.now();
            }
        };

        loadTrainingData();
    }, [sessionId, apiBaseUrl, mode, loadRetryTrigger]); // Load when sessionId, apiBaseUrl, mode changes, or retry triggered

    // Poll session status while waiting for training data
    useEffect(() => {
        if (!waitingForData) return;

        const pollSession = async () => {
            try {
                const status = await fetch_session_status(sessionId, apiBaseUrl, authToken);
                if (status) {
                    setWaitingSessionInfo(status);

                    // If training is done, try loading projections again (but not forever)
                    const sessionStatus = status.session?.status || status.status;
                    if (sessionStatus === 'done' || sessionStatus === 'completed') {
                        if (loadRetryTrigger >= 3) {
                            // Already retried multiple times with status "done" but data still 404
                            console.error('Training is done but projection data is unavailable after', loadRetryTrigger, 'retries');
                            setWaitingForData(false);
                            setError('Training completed but projection data is not available. The data may have been cleaned up.');
                            return;
                        }
                        console.log('Training complete, loading projections (attempt', loadRetryTrigger + 1, ')...');
                        setWaitingForData(false);
                        setLoading(true);
                        setError(null);
                        setLoadRetryTrigger(prev => prev + 1);
                        return;
                    }
                }
            } catch {
                // Session status fetch failed, keep waiting
            }
        };

        // Fetch immediately
        pollSession();

        // Poll session status every 5 seconds for live progress
        const statusTimer = setInterval(pollSession, 5000);

        // Countdown display (resets every 5s to match poll interval)
        setWaitingCountdown(5);
        const countdownTimer = setInterval(() => {
            setWaitingCountdown(prev => prev <= 1 ? 5 : prev - 1);
        }, 1000);

        return () => {
            clearInterval(statusTimer);
            clearInterval(countdownTimer);
        };
    }, [waitingForData, sessionId, apiBaseUrl]);

    // Poll for new epochs if training is in progress
    useEffect(() => {
        if (!trainingData) return;
        if (!sessionId && !dataEndpoint) return;

        const checkForNewEpochs = async () => {
            // Skip if initial load just completed (avoid duplicate fetch)
            if (initialLoadCompleteTime.current && Date.now() - initialLoadCompleteTime.current < 25000) {
                return;
            }
            try {
                // Get current epoch keys
                const currentEpochKeys = Object.keys(trainingData);
                const currentMaxEpoch = Math.max(...currentEpochKeys.map(k => {
                    const epochNum = parseInt(k.replace('epoch_', ''));
                    return isNaN(epochNum) ? 0 : epochNum;
                }));

                let latestData;

                if (dataEndpoint) {
                    // Custom endpoint: poll with start_epoch for efficiency
                    setNextCheckCountdown(30);
                    latestData = await fetch_from_data_endpoint(dataEndpoint, currentMaxEpoch + 1, undefined, authToken);
                } else {
                    // Session-based: check status first, then fetch
                    const sessionStatus = await fetch_session_status(sessionId, apiBaseUrl, authToken);
                    if (!sessionStatus) return;

                    const isTraining = sessionStatus.session?.status === 'training' ||
                                      sessionStatus.session?.status === 'running' ||
                                      sessionStatus.session?.status === 'pending';

                    if (!isTraining) {
                        setTrainingStatus('completed');
                        return;
                    }

                    setTrainingStatus('training');
                    setNextCheckCountdown(30);

                    latestData = await fetch_training_metrics(sessionId, apiBaseUrl, undefined, undefined, authToken);
                }

                if (latestData && latestData.epoch_projections) {
                    const newEpochKeys = Object.keys(latestData.epoch_projections);
                    const newMaxEpoch = Math.max(...newEpochKeys.map(k => {
                        const epochNum = parseInt(k.replace('epoch_', ''));
                        return isNaN(epochNum) ? 0 : epochNum;
                    }));

                    if (newMaxEpoch > currentMaxEpoch) {
                        // New epoch detected

                        // Find all new epochs
                        const newEpochs: Record<string, any> = {};
                        newEpochKeys.forEach(epochKey => {
                            const epochNum = parseInt(epochKey.replace('epoch_', ''));
                            if (epochNum > currentMaxEpoch && !trainingData[epochKey]) {
                                newEpochs[epochKey] = latestData.epoch_projections[epochKey];
                            }
                        });

                        if (Object.keys(newEpochs).length > 0) {
                            // Adding new epochs to training movie

                            // Merge new epochs into existing training data
                            const updatedTrainingData = {
                                ...trainingData,
                                ...newEpochs
                            };
                            
                            setTrainingData(updatedTrainingData);
                            
                            // Update sphere with new epochs if it's already loaded
                            if (sphereRef && sphereRef.trainingMovieData) {
                                // Skip sphere manipulation for Canvas2D fallback -
                                // it picks up new data from trainingData state automatically
                                if (!sphereRef._canvas2dFallback) {
                                    // Check if movie was playing before we reload
                                    const wasPlaying = sphereRef.isPlayingMovie || false;
                                    const wasPaused = sphereRef._pausedByUser || false;

                                    // Stop current movie
                                    stop_training_movie(sphereRef);

                                    // Reload training movie with updated data
                                    load_training_movie(sphereRef, updatedTrainingData, latestData.training_metrics || lossData, sessionProjections);

                                    // Only auto-restart if user hadn't paused
                                    if (!wasPaused) {
                                        goto_training_movie_frame(sphereRef, 1);
                                        setIsPlaying(true);
                                        play_training_movie(sphereRef);
                                    } else {
                                        // Stay paused but update to current frame
                                        goto_training_movie_frame(sphereRef, sphereRef.currentEpoch || 1);
                                    }
                                }
                            }

                            // Update loss data if available
                            if (latestData.training_metrics) {
                                setLossData(latestData.training_metrics);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error checking for new epochs:', error);
            }
        };

        // Poll every 30 seconds
        const pollInterval = setInterval(checkForNewEpochs, 30000);
        
        // Countdown timer for next check
        const countdownInterval = setInterval(() => {
            setNextCheckCountdown(prev => {
                if (prev <= 1) {
                    return 30; // Reset to 30 when it reaches 0
                }
                return prev - 1;
            });
        }, 1000);
        
        // Don't check immediately - the initial load already fetched the data.
        // The 30s interval will pick up new epochs.

        return () => {
            clearInterval(pollInterval);
            clearInterval(countdownInterval);
        };
    }, [sessionId, apiBaseUrl, trainingData, sphereRef, dataEndpoint]);

    // Compute epoch movement stats whenever training data changes
    useEffect(() => {
        if (!trainingData || Object.keys(trainingData).length < 2) return;
        const stats = compute_epoch_movement_stats(trainingData);
        setMovementData(stats);
    }, [trainingData]);

    // Set loading status when loading - clear it when loading completes
    useEffect(() => {
        if (loading) {
            setTrainingStatus('loading');
        } else {
            // Clear loading status when loading completes (unless already set to training/completed)
            setTrainingStatus(prev => prev === 'loading' ? null : prev);
        }
    }, [loading]);

    // Handle dynamic visualization feature changes
    useEffect(() => {
        if (!sphereRef) {
            return;
        }

        // Update the ref for countdown as well
        sphereRefForCountdown.current = sphereRef;

        // Update sphere settings based on features
        sphereRef.showDynamicPoints = false; // Always disabled - not useful
        sphereRef.showDynamicHulls = showDynamicHulls;
        sphereRef.memoryTrailLength = trailLength;
        sphereRef.spotlightCluster = spotlightCluster;
        sphereRef.rocketMode = sportMode;
        sphereRef.sportMode = sportMode;

        // Reset point scales when sport mode is turned off
        if (!sportMode) {
            sphereRef.pointObjectsByRecordID?.forEach((mesh: any) => {
                mesh.scale.setScalar(1.0);
                const mat = mesh.material;
                if (mat && 'emissive' in mat) {
                    mat.emissive.setRGB(0, 0, 0);
                }
            });
        }

        // Trim existing trail history to match new setting immediately
        trim_trail_history(sphereRef);

        // Call the unified compute function with all settings
        compute_cluster_convex_hulls(sphereRef);
        update_cluster_spotlight(sphereRef, true); // updateOpacity=true when user changes setting
        render_sphere(sphereRef);

    }, [showDynamicHulls, trailLength, spotlightCluster, sportMode, sphereRef]);

    // Sync cluster color mode to sphere
    useEffect(() => {
        if (!sphereRef) return;
        set_cluster_color_mode(sphereRef, clusterColorMode);
    }, [clusterColorMode, sphereRef]);

    // Apply matplotlib colormap to cluster colors when specified
    useEffect(() => {
        if (!sphereRef || !colormap || !isValidColormap(colormap)) return;
        const activeKey = get_active_cluster_count_key(sphereRef);
        if (activeKey === null) return;
        const nClusters = activeKey;
        const colors = sampleColormap(colormap, nClusters);
        for (let i = 0; i < colors.length; i++) {
            set_cluster_color(sphereRef, i, colors[i]);
        }
        render_sphere(sphereRef);
    }, [colormap, sphereRef]);

    // Sync playback speed to sphere (force 1x in thumbnail mode)
    useEffect(() => {
        if (!sphereRef) return;
        set_playback_speed(sphereRef, isThumbnail ? 1 : playbackSpeed);
    }, [playbackSpeed, sphereRef, isThumbnail]);

    // Frame control functions
    const handlePlayPause = () => {
        if (!sphereRef) return;

        if (isPlaying) {
            if (sphereRef._canvas2dFallback) { sphereRef.pause(); } else { pause_training_movie(sphereRef); }
            setIsPlaying(false);
        } else {
            if (sphereRef._canvas2dFallback) { sphereRef.resume(); } else { resume_training_movie(sphereRef); }
            setIsPlaying(true);
        }
    };
        
    const handleStepBackward = () => {
        if (!sphereRef) return;
        step_training_movie_frame(sphereRef, 'backward');
        setIsPlaying(false); // Stepping pauses the movie
    };

    const handleStepForward = () => {
        if (!sphereRef) return;
        step_training_movie_frame(sphereRef, 'forward');
        setIsPlaying(false); // Stepping pauses the movie
    };

    const handleGotoFrame = () => {
        if (!sphereRef || !frameInput) return;
        const frameNumber = parseInt(frameInput);
        if (isNaN(frameNumber)) return;
        
        goto_training_movie_frame(sphereRef, frameNumber);
        setIsPlaying(false); // Jumping pauses the movie
    };

    const handleStop = () => {
        if (!sphereRef) return;
        stop_training_movie(sphereRef);
        setIsPlaying(false);
    };
    
    const handleReplay = () => {
        if (!sphereRef) return;
        // Reset to frame 1 and play
        goto_training_movie_frame(sphereRef, 1);
        setIsPlaying(true);
        play_training_movie(sphereRef, 10);
    };
    
    const toggleFullscreen = () => {
        if (!isFullscreen) {
            // Enter fullscreen mode
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            }
            setIsFullscreen(true);
        } else {
            // Exit fullscreen mode
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            setIsFullscreen(false);
        }
    };

    // Handle maximize button click in thumbnail mode
    const handleMaximize = useCallback(() => {
        if (onMaximize) {
            // Customer-provided callback
            onMaximize(sessionId);
        } else {
            // Default: enter browser fullscreen on the viewer container itself,
            // so it fills the screen rather than staying inside its small parent div
            setIsThumbnail(false);
            const el = outerContainerRef.current as any;
            if (el?.requestFullscreen) {
                el.requestFullscreen();
            } else if (el?.webkitRequestFullscreen) {
                el.webkitRequestFullscreen();
            }
            setIsFullscreen(true);
            // Trigger resize so the sphere re-renders at full size
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
                if (sphereRef) render_sphere(sphereRef);
            }, 150);
        }
    }, [onMaximize, sessionId, sphereRef]);

    // Listen for fullscreen changes (user pressing ESC) and resize sphere
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isCurrentlyFullscreen);

            // If exiting fullscreen and we were maximized from thumbnail via default behavior,
            // restore thumbnail mode
            if (!isCurrentlyFullscreen && mode === 'thumbnail' && !onMaximize) {
                setIsThumbnail(true);
            }

            // Resize sphere when fullscreen changes - delay to ensure DOM has updated
            if (sphereRef) {
                setTimeout(() => {
                    if (sphereRef) {
                        // Trigger window resize event to recalculate camera and renderer
                        window.dispatchEvent(new Event('resize'));
                        // render_sphere calls fit_sphere_to_container internally
                        render_sphere(sphereRef);
                    }
                }, 100);
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [sphereRef, mode, onMaximize]);
    
    // Get column types helper (same as FinalSphereView)
    const getColumnTypes = (projections: any) => {
        try {
            const d: any = {};
            const items = projections.coords || [];
            for (const entry of items) {
                if (entry.scalar_columns) {
                    const ks = Object.keys(entry.scalar_columns);
                    for (const k of ks) {
                        if (d[k] === undefined) {
                            d[k] = 'scalar';
                        }
                    }
                }
                if (entry.set_columns) {
                    const ks = Object.keys(entry.set_columns);
                    for (const k of ks) {
                        if (d[k] === undefined) {
                            d[k] = 'set';
                        }
                    }
                }
                if (entry.string_columns) {
                    const ks = Object.keys(entry.string_columns);
                    for (const k of ks) {
                        if (d[k] === undefined) {
                            d[k] = 'string';
                        }
                    }
                }
            }
            return d;
        } catch (error) {
            // Error getting column types
            return {};
        }
    };
    
    // Normalize boolean values for matching
    const normalizeBoolean = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        const str = String(value).toLowerCase().trim();
        // Handle various boolean representations
        if (str === 'true' || str === '1' || str === 'yes' || str === 'y' || str === 'on') {
            return 'true';
        }
        if (str === 'false' || str === '0' || str === 'no' || str === 'n' || str === 'off') {
            return 'false';
        }
        return null;
    };
    
    // Check if a value looks like a boolean
    const isBooleanLike = (value: any): boolean => {
        if (value === null || value === undefined) return false;
        const normalized = normalizeBoolean(value);
        return normalized !== null;
    };
    
    // Helper to parse array-like values (JSON arrays or Python-style list strings)
    const parseArrayValue = (val: any): string[] | null => {
        // Already an array
        if (Array.isArray(val)) {
            return val.map(v => String(v));
        }
        // Try to parse as JSON or Python-style list string
        if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    // Try JSON first
                    const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
                    if (Array.isArray(parsed)) {
                        return parsed.map(v => String(v));
                    }
                } catch {
                    // Try simple split for Python-style lists
                    const inner = trimmed.slice(1, -1);
                    if (inner.includes(',')) {
                        return inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                    }
                }
            }
        }
        return null;
    };

    // Filter record list for search with improved boolean handling and array support
    const filter_record_list = (queryColumnType: any, queryColumn: any, queryValue: any) => {
        if (!sphereRef || !sphereRef.pointRecordsByID) {
            console.log('🔍 Search: No sphere or records');
            return [];
        }

        // Normalize the query value for boolean matching
        const normalizedQuery = normalizeBoolean(queryValue);
        const isBooleanQuery = normalizedQuery !== null;
        const query = String(queryValue).toLowerCase().trim();

        let results: any = [];
        let checked = 0;
        let sampleValue: any = null;
        for (const record of sphereRef.pointRecordsByID.values()) {
            checked++;
            const columnValue = record.original[queryColumn];

            // Log first few values for debugging
            if (checked <= 3) {
                console.log(`🔍 Search sample ${checked}: column="${queryColumn}", value=`, columnValue, typeof columnValue);
                if (checked === 1) sampleValue = columnValue;
            }

            if (columnValue === undefined) continue;

            let matches = false;

            // First, check if this is an array/list value
            const arrayItems = parseArrayValue(columnValue);
            if (arrayItems !== null) {
                // Search within array items - partial, case-insensitive match
                matches = arrayItems.some(item =>
                    item.toLowerCase().includes(query)
                );
                if (checked <= 3) {
                    console.log(`🔍 Parsed as array:`, arrayItems, `matches="${query}":`, matches);
                }
                // Array was handled - skip string/set checks
            } else if (queryColumnType === 'string') {
                // Not an array - log why
                if (checked <= 3) {
                    console.log(`🔍 NOT array, checking as string. Raw value:`, JSON.stringify(columnValue).substring(0, 100));
                }
                const value = String(columnValue).toLowerCase();
                if (isBooleanQuery) {
                    // For boolean-like queries, try to match normalized boolean values
                    const normalizedValue = normalizeBoolean(columnValue);
                    if (normalizedValue !== null && normalizedValue === normalizedQuery) {
                        matches = true;
                    } else if (!normalizedValue) {
                        // Fallback to string matching if value isn't boolean-like
                        matches = value.includes(query);
                    }
                } else {
                    matches = value.includes(query);
                }
            } else if (queryColumnType === 'set') {
                // For set columns, also do partial case-insensitive matching
                const value = String(columnValue).toLowerCase();
                if (isBooleanQuery) {
                    // For boolean-like queries, try to match normalized boolean values
                    const normalizedValue = normalizeBoolean(columnValue);
                    if (normalizedValue !== null && normalizedValue === normalizedQuery) {
                        matches = true;
                    } else if (!normalizedValue) {
                        // Partial match for non-boolean values
                        matches = value.includes(query);
                    }
                } else {
                    // Partial, case-insensitive match (not exact!)
                    matches = value.includes(query);
                }
            } else if (queryColumnType === 'scalar') {
                // Handle scalar columns with comparison operators and null/nan support
                const queryStr = String(queryValue).trim().toLowerCase();
                
                // Check for null/nan first
                if (queryStr === 'null' || queryStr === 'nan' || queryStr === 'na') {
                    const isNull = columnValue === null || columnValue === undefined;
                    const isNaN = typeof columnValue === 'number' && (isNaN(columnValue) || !isFinite(columnValue));
                    matches = isNull || isNaN;
                } else {
                    // Parse comparison operators: =, !=, <, >, <=, >=
                    let operator = '=';
                    let comparisonValue: number | null = null;
                    
                    // Check for != first (before =)
                    if (queryStr.startsWith('!=')) {
                        operator = '!=';
                        const valStr = queryStr.substring(2).trim();
                        comparisonValue = valStr === 'null' || valStr === 'nan' || valStr === 'na' ? null : parseFloat(valStr);
                    } else if (queryStr.startsWith('<=')) {
                        operator = '<=';
                        comparisonValue = parseFloat(queryStr.substring(2).trim());
                    } else if (queryStr.startsWith('>=')) {
                        operator = '>=';
                        comparisonValue = parseFloat(queryStr.substring(2).trim());
                    } else if (queryStr.startsWith('=')) {
                        operator = '=';
                        const valStr = queryStr.substring(1).trim();
                        comparisonValue = valStr === 'null' || valStr === 'nan' || valStr === 'na' ? null : parseFloat(valStr);
                    } else if (queryStr.startsWith('<')) {
                        operator = '<';
                        comparisonValue = parseFloat(queryStr.substring(1).trim());
                    } else if (queryStr.startsWith('>')) {
                        operator = '>';
                        comparisonValue = parseFloat(queryStr.substring(1).trim());
                    } else if (queryStr.startsWith('!')) {
                        operator = '!=';
                        comparisonValue = parseFloat(queryStr.substring(1).trim());
                    } else {
                        // Default: try to parse as number for equality, or use range syntax
                        if (queryStr.includes('-') && queryStr.split('-').length === 2) {
                            // Range: "1-5"
                            const parts = queryStr.split('-').map(p => parseFloat(p.trim()));
                            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                const numValue = typeof columnValue === 'number' ? columnValue : parseFloat(String(columnValue));
                                const isNumeric = !isNaN(numValue) && isFinite(numValue);
                                if (isNumeric) {
                                    matches = numValue >= parts[0] && numValue <= parts[1];
                                }
                            }
                        } else {
                            // Try equality comparison
                            operator = '=';
                            comparisonValue = parseFloat(queryStr);
                        }
                    }
                    
                    // Perform comparison
                    if (comparisonValue !== null && !isNaN(comparisonValue)) {
                        const numValue = typeof columnValue === 'number' ? columnValue : parseFloat(String(columnValue));
                        const isNumeric = !isNaN(numValue) && isFinite(numValue);
                        
                        if (isNumeric) {
                            switch (operator) {
                                case '=':
                                    matches = Math.abs(numValue - comparisonValue) < Number.EPSILON * 100;
                                    break;
                                case '!=':
                                    matches = Math.abs(numValue - comparisonValue) >= Number.EPSILON * 100;
                                    break;
                                case '<':
                                    matches = numValue < comparisonValue;
                                    break;
                                case '>':
                                    matches = numValue > comparisonValue;
                                    break;
                                case '<=':
                                    matches = numValue <= comparisonValue;
                                    break;
                                case '>=':
                                    matches = numValue >= comparisonValue;
                                    break;
                            }
                        } else {
                            // Non-numeric value - only != can match
                            if (operator === '!=') {
                                matches = true;
                            }
                        }
                    } else if (comparisonValue === null) {
                        // Comparing to null/nan
                        const isNull = columnValue === null || columnValue === undefined;
                        const isNaN = typeof columnValue === 'number' && (isNaN(columnValue) || !isFinite(columnValue));
                        
                        if (operator === '=') {
                            matches = isNull || isNaN;
                        } else if (operator === '!=') {
                            matches = !isNull && !isNaN;
                        }
                    } else {
                        // Fallback to boolean or string matching
                        if (isBooleanQuery) {
                            const normalizedValue = normalizeBoolean(columnValue);
                            matches = normalizedValue !== null && normalizedValue === normalizedQuery;
                        } else {
                            const value = String(columnValue).toLowerCase();
                            const query = String(queryValue).toLowerCase();
                            matches = value === query || value.includes(query);
                        }
                    }
                }
            }
            
            if (matches) {
                results.push(record);
            }
        }
        console.log(`🔍 Search complete: query="${query}" column="${queryColumn}" type="${queryColumnType}" checked=${checked} matches=${results.length}`);
        return results;
    };
    
    // State for search result statistics
    const [searchResultStats, setSearchResultStats] = useState<{
        yes: number;
        no: number;
        unknown: number;
        isBoolean: boolean;
    } | null>(null);
    const [hideUnknown, setHideUnknown] = useState(false);
    
    // Column vocabulary/distribution state
    const [columnVocabulary, setColumnVocabulary] = useState<{
        type: 'scalar' | 'set' | 'string';
        distribution?: Array<{ bin: number, count: number }>; // For scalars
        rawValues?: number[]; // Raw numeric values for boxplot
        vocabulary?: string[]; // For non-scalars (backwards compat)
        vocabularyWithCounts?: Array<{ value: string, count: number, pct: number }>; // For set/string with counts
        totalValues?: number; // Total number of values for set/string
        uniqueCount?: number; // Number of unique values
        min?: number;
        max?: number;
        mean?: number;
        median?: number;
        q1?: number; // First quartile
        q3?: number; // Third quartile
    } | null>(null);
    
    // Apply all color rules to the sphere
    const applyColorRules = useCallback(() => {
        if (!sphereRef) return;
        
        // First clear all colors
        clear_colors(sphereRef);
        clear_selected_objects(sphereRef);
        
        // Apply each color rule
        for (const rule of colorRules) {
            for (const recordId of rule.recordIds) {
                add_selected_record(sphereRef, recordId);
                change_object_color(sphereRef, recordId, rule.color);
            }
        }
        
        render_sphere(sphereRef);
    }, [sphereRef, colorRules]);
    
    // Apply color rules when colorRules array changes (not when function reference changes)
    useEffect(() => {
        if (colorRules.length > 0 && sphereRef) {
            applyColorRules();
        }
    }, [colorRules.length, sphereRef]); // Only depend on length, not the array itself
    
    // Extract search submit logic to reusable function
    const handleSearchSubmit = () => {
        if (!sphereRef) {
            return;
        }
        
        if (!columnTypes) {
            return;
        }

        if (!selectedSearchColumn) {
            return;
        }

        if (!searchQuery.trim()) {
            return;
        }

        // Filter results
        const queryColumnType = columnTypes[selectedSearchColumn];
        
        const theRecords = filter_record_list(queryColumnType, selectedSearchColumn, searchQuery.trim());
        
        if (theRecords.length === 0) {
            alert(`No results found for "${searchQuery.trim()}" in column "${selectedSearchColumn}"`);
            return;
        }
        
        // Get next color from palette
        const colorIndex = colorRules.length % colorPalette.length;
        const color = colorPalette[colorIndex];
        
        // Create new color rule
        const newRule = {
            id: uuid4(),
            query: searchQuery.trim(),
            column: selectedSearchColumn,
            color: color,
            recordIds: theRecords.map(r => r.id)
        };
        
        // Add to color rules
        setColorRules(prev => {
            const updated = [...prev, newRule];
            return updated;
        });
        
        // Clear search input
        setSearchQuery('');
        setSearchResultStats(null);
        
    };
    
    // Handle Enter key to create color rule
    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            handleSearchSubmit();
        }
    };
    
    // Handle search input with live visual preview (green = match, gray = no match)
    const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        setSearchQuery(inputValue);

        if (!sphereRef) {
            return;
        }

        if (!columnTypes || !selectedSearchColumn) {
            return;
        }

        // If empty, clear selection and restore original cluster colors
        if (inputValue === "") {
            clear_selected_objects(sphereRef);
            applyColorRules();
            setSearchResultStats(null);
            return;
        }

        // Filter results for preview
        const queryColumnType = columnTypes[selectedSearchColumn];
        const theRecords = filter_record_list(queryColumnType, selectedSearchColumn, inputValue);

        // Create a set of matching record IDs for fast lookup
        const matchingIds = new Set(theRecords.map(r => r.id));

        // Clear previous selection and apply yellow highlight via selectedRecords
        // This ensures frame updates preserve the selection colors
        clear_colors(sphereRef);
        clear_selected_objects(sphereRef);

        const YELLOW = '#ffff00';

        sphereRef.pointObjectsByRecordID?.forEach((mesh: any, recordId: string) => {
            if (mesh.material && 'color' in mesh.material) {
                if (matchingIds.has(recordId)) {
                    // Match: yellow highlight, full opacity, added to selectedRecords for persistence
                    add_selected_record(sphereRef, recordId);
                    change_object_color(sphereRef, recordId, YELLOW);
                    mesh.material.opacity = sphereRef.pointOpacity || 0.5;
                } else {
                    // No match: dim
                    mesh.material.opacity = (sphereRef.pointOpacity || 0.5) * 0.15;
                }
                mesh.material.needsUpdate = true;
            }
        });

        // Trigger a render to show the preview
        render_sphere(sphereRef);

        // Update stats display
        setSearchResultStats({
            yes: theRecords.length,
            no: (sphereRef.pointObjectsByRecordID?.size || 0) - theRecords.length,
            unknown: 0,
            isBoolean: false
        });
    };
    
    // Note: Color rules are applied when colorRules.length changes (see above useEffect)
    
    // Fetch vocabulary/distribution when column changes
    useEffect(() => {
        if (!selectedSearchColumn || !sphereRef || !sphereRef.pointRecordsByID || !columnTypes) {
            setColumnVocabulary(null);
            return;
        }

        const colType = columnTypes[selectedSearchColumn];
        if (!colType) {
            setColumnVocabulary(null);
            return;
        }

        // Collect all values for this column
        const values: any[] = [];
        for (const record of sphereRef.pointRecordsByID.values()) {
            const val = record.original[selectedSearchColumn];
            if (val !== undefined && val !== null) {
                values.push(val);
            }
        }
        
        if (values.length === 0) {
            setColumnVocabulary(null);
            return;
        }
        
        if (colType === 'scalar') {
            // Calculate distribution for scalar columns
            const numericValues = values.map(v => {
                const num = typeof v === 'number' ? v : parseFloat(String(v));
                return isNaN(num) ? null : num;
            }).filter(v => v !== null) as number[];

            if (numericValues.length === 0) {
                setColumnVocabulary(null);
                return;
            }

            const sorted = [...numericValues].sort((a, b) => a - b);
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;

            // Calculate quartiles
            const getPercentile = (arr: number[], p: number) => {
                const index = (p / 100) * (arr.length - 1);
                const lower = Math.floor(index);
                const upper = Math.ceil(index);
                if (lower === upper) return arr[lower];
                return arr[lower] * (upper - index) + arr[upper] * (index - lower);
            };

            const q1 = getPercentile(sorted, 25);
            const median = getPercentile(sorted, 50);
            const q3 = getPercentile(sorted, 75);

            // Create histogram with 20 bins
            const numBins = 20;
            const binWidth = (max - min) / numBins || 1;
            const bins: number[] = new Array(numBins).fill(0);

            numericValues.forEach(val => {
                let binIndex = Math.floor((val - min) / binWidth);
                if (binIndex >= numBins) binIndex = numBins - 1; // Handle edge case
                bins[binIndex]++;
            });

            const distribution = bins.map((count, i) => ({
                bin: min + (i + 0.5) * binWidth,
                count: count
            }));

            setColumnVocabulary({
                type: 'scalar',
                distribution,
                rawValues: numericValues,
                min,
                max,
                mean,
                median,
                q1,
                q3
            });
        } else {
            // For set/string columns, show vocabulary with counts (histogram)
            const valueCounts: Map<string, number> = new Map();
            values.forEach(v => {
                const str = String(v);
                valueCounts.set(str, (valueCounts.get(str) || 0) + 1);
            });

            // Sort by count descending, then by value alphabetically
            const sortedEntries = Array.from(valueCounts.entries())
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

            const vocabularyWithCounts = sortedEntries.slice(0, 50).map(([value, count]) => ({
                value,
                count,
                pct: Math.round((count / values.length) * 100)
            }));

            setColumnVocabulary({
                type: colType as 'set' | 'string',
                vocabulary: sortedEntries.slice(0, 100).map(([v]) => v), // Keep for backwards compat
                vocabularyWithCounts,
                totalValues: values.length,
                uniqueCount: valueCounts.size
            });
        }
    }, [selectedSearchColumn, sphereRef, columnTypes]);
    
    // Update when hideUnknown changes
    useEffect(() => {
        if (searchQuery && sphereRef && columnTypes && selectedSearchColumn) {
            // Re-trigger search to apply hideUnknown setting
            const queryColumnType = columnTypes[selectedSearchColumn];
            const theRecords = filter_record_list(queryColumnType, selectedSearchColumn, searchQuery);
            const normalizedQuery = normalizeBoolean(searchQuery);
            const isBooleanQuery = normalizedQuery !== null;
            
            if (isBooleanQuery && theRecords.length > 0) {
                let yesCount = 0;
                let noCount = 0;
                let unknownCount = 0;
                
                clear_colors(sphereRef);
                clear_selected_objects(sphereRef);
                
                for (const record of theRecords) {
                    const columnValue = record.original[selectedSearchColumn];
                    const normalizedValue = normalizeBoolean(columnValue);
                    
                    if (normalizedValue === null) {
                        unknownCount++;
                        if (!hideUnknown) {
                            add_selected_record(sphereRef, record.id);
                            change_object_color(sphereRef, record.id, '#888888');
                        }
                    } else if (normalizedValue === 'true') {
                        yesCount++;
                        add_selected_record(sphereRef, record.id);
                        change_object_color(sphereRef, record.id, '#00ff00');
                    } else {
                        noCount++;
                        add_selected_record(sphereRef, record.id);
                        change_object_color(sphereRef, record.id, '#ff0000');
                    }
                }
                
                setSearchResultStats({
                    yes: yesCount,
                    no: noCount,
                    unknown: unknownCount,
                    isBoolean: true
                });
                render_sphere(sphereRef);
            }
        }
    }, [hideUnknown]);

    if (loading) {
        // THUMBNAIL MODE: Simple spinner, no detailed steps or build info
        if (mode === 'thumbnail') {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    background: theme.bgSecondary,
                    color: theme.textTertiary,
                }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        border: `2px solid ${theme.borderSecondary}`,
                        borderTop: `2px solid ${theme.textTertiary}`,
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }}></div>
                </div>
            );
        }

        return (
            <div className="training-progress-display" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: theme.bgLoading,
                color: theme.textSecondary,
                position: 'relative',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
                {trainingStatus === 'loading' && (
                    <>
                        <div style={{ marginBottom: '20px', fontSize: '18px' }}>
                            {retryStatus ? 'Server Unavailable - Retrying...' : 'Loading Training Movie...'}
                        </div>
                        {retryStatus ? (
                            <>
                                <div style={{
                                    fontSize: '48px',
                                    fontWeight: 'bold',
                                    color: theme.error,
                                    marginBottom: '10px',
                                    fontFamily: 'monospace'
                                }}>
                                    {retryStatus.nextRetryIn}s
                                </div>
                                <div style={{ fontSize: '14px', color: theme.error, marginBottom: '8px' }}>
                                    {retryStatus.error}
                                </div>
                                <div style={{ fontSize: '13px', color: theme.textTertiary, marginBottom: '8px' }}>
                                    Attempt {retryStatus.attempt} | Total wait: {Math.floor(retryStatus.totalElapsed / 60)}m {retryStatus.totalElapsed % 60}s
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    border: `3px solid ${theme.spinnerTrack}`,
                                    borderTop: `3px solid ${theme.spinnerHead}`,
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    marginBottom: '15px'
                                }}></div>
                                <div style={{ fontSize: '14px', color: theme.info, marginBottom: '8px' }}>
                                    {loadingStep}
                                </div>
                                {loadingDetail && (
                                    <div style={{ fontSize: '13px', color: theme.textTertiary, marginBottom: '8px' }}>
                                        {loadingDetail}
                                    </div>
                                )}
                            </>
                        )}
                        <div style={{ fontSize: '14px', color: theme.textSecondary, maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Session: {isMobile && sessionId.length > 20 ? sessionId.slice(0, 8) + '...' + sessionId.slice(-4) : sessionId}</div>
                        <div style={{ fontSize: '12px', color: theme.textTertiary, marginTop: '5px' }}>
                            Fetching from {apiBaseUrl || 'default API'}
                        </div>
                    </>
                )}
                {trainingStatus === 'training' && (
                    <>
                        <div style={{ marginBottom: '20px', fontSize: '18px', color: theme.accent }}>
                            Training in progress
                        </div>
                        <div style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '10px' }}>
                            Will check for new frames in {nextCheckCountdown} seconds
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textTertiary, marginTop: '5px', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            Session: {isMobile && sessionId.length > 20 ? sessionId.slice(0, 8) + '...' + sessionId.slice(-4) : sessionId}
                        </div>
                    </>
                )}
                {trainingStatus === 'completed' && (
                    <>
                        <div style={{ marginBottom: '20px', fontSize: '18px', color: theme.accent }}>
                            Training Completed
                        </div>
                        <div style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '10px' }}>
                            All epochs loaded
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textTertiary, marginTop: '5px', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            Session: {isMobile && sessionId.length > 20 ? sessionId.slice(0, 8) + '...' + sessionId.slice(-4) : sessionId}
                        </div>
                    </>
                )}
                {!trainingStatus && (
                    <>
                        <div style={{ marginBottom: '20px', fontSize: '18px' }}>
                            {retryStatus ? 'Server Unavailable - Retrying...' : 'Loading Training Movie...'}
                        </div>
                        {retryStatus ? (
                            <>
                                <div style={{
                                    fontSize: '48px',
                                    fontWeight: 'bold',
                                    color: theme.error,
                                    marginBottom: '10px',
                                    fontFamily: 'monospace'
                                }}>
                                    {retryStatus.nextRetryIn}s
                                </div>
                                <div style={{ fontSize: '14px', color: theme.error, marginBottom: '8px' }}>
                                    {retryStatus.error}
                                </div>
                                <div style={{ fontSize: '13px', color: theme.textTertiary, marginBottom: '8px' }}>
                                    Attempt {retryStatus.attempt} | Total wait: {Math.floor(retryStatus.totalElapsed / 60)}m {retryStatus.totalElapsed % 60}s
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    border: `3px solid ${theme.spinnerTrack}`,
                                    borderTop: `3px solid ${theme.spinnerHead}`,
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    marginBottom: '15px'
                                }}></div>
                                <div style={{ fontSize: '14px', color: theme.info, marginBottom: '8px' }}>
                                    {loadingStep}
                                </div>
                                {loadingDetail && (
                                    <div style={{ fontSize: '13px', color: theme.textTertiary, marginBottom: '8px' }}>
                                        {loadingDetail}
                                    </div>
                                )}
                            </>
                        )}
                        <div style={{ fontSize: '14px', color: theme.textSecondary, maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Session: {isMobile && sessionId.length > 20 ? sessionId.slice(0, 8) + '...' + sessionId.slice(-4) : sessionId}</div>
                        <div style={{ fontSize: '12px', color: theme.textTertiary, marginTop: '5px' }}>
                            Fetching from {apiBaseUrl || 'default API'}
                        </div>
                    </>
                )}
            </div>
        );
    }

    if (waitingForData) {
        // Extract training progress from session info
        const sessionStatus = waitingSessionInfo?.session?.status || waitingSessionInfo?.status || 'unknown';
        const jobPlan = waitingSessionInfo?.job_plan || waitingSessionInfo?.session?.job_plan || [];
        const activeJob = jobPlan.find((j: any) => j.status === 'running') || jobPlan[jobPlan.length - 1];
        const currentEpoch = activeJob?.current_epoch || activeJob?.progress?.current_epoch;
        const currentLoss = activeJob?.current_loss || activeJob?.progress?.current_loss;
        const validationLoss = activeJob?.validation_loss || activeJob?.progress?.validation_loss;

        return (
            <div className="training-progress-display" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: theme.bgLoading,
                color: theme.textSecondary,
            }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 1 } }`}</style>
                <div style={{
                    width: '40px',
                    height: '40px',
                    border: `3px solid ${theme.spinnerTrack}`,
                    borderTop: `3px solid ${theme.accent}`,
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '20px'
                }}></div>
                <div style={{ fontSize: '16px', color: theme.accent, marginBottom: '8px' }}>
                    Waiting for training data...
                </div>
                <div style={{ fontSize: '13px', color: theme.textTertiary, marginBottom: '16px' }}>
                    Training is in progress. The visualization will load once projections are available.
                </div>

                {/* Training progress stats */}
                {waitingSessionInfo && (
                    <div style={{
                        display: 'flex',
                        gap: '24px',
                        marginBottom: '20px',
                        padding: '12px 24px',
                        background: theme.bgSurface,
                        borderRadius: '8px',
                        border: `1px solid ${theme.borderSecondary}`,
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '10px', color: theme.textTertiary, textTransform: 'uppercase', marginBottom: '4px' }}>Status</div>
                            <div style={{ fontSize: '14px', color: sessionStatus === 'running' ? theme.accent : theme.textPrimary, fontWeight: 600 }}>
                                {sessionStatus}
                            </div>
                        </div>
                        {currentEpoch != null && (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: theme.textTertiary, textTransform: 'uppercase', marginBottom: '4px' }}>Epoch</div>
                                <div style={{ fontSize: '14px', color: theme.textPrimary, fontFamily: 'monospace' }}>{currentEpoch}</div>
                            </div>
                        )}
                        {currentLoss != null && (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: theme.textTertiary, textTransform: 'uppercase', marginBottom: '4px' }}>Loss</div>
                                <div style={{ fontSize: '14px', color: theme.textPrimary, fontFamily: 'monospace' }}>{Number(currentLoss).toFixed(4)}</div>
                            </div>
                        )}
                        {validationLoss != null && (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: theme.textTertiary, textTransform: 'uppercase', marginBottom: '4px' }}>Val Loss</div>
                                <div style={{ fontSize: '14px', color: theme.textPrimary, fontFamily: 'monospace' }}>{Number(validationLoss).toFixed(4)}</div>
                            </div>
                        )}
                    </div>
                )}

                <div style={{
                    fontSize: '20px',
                    fontFamily: 'monospace',
                    color: theme.accent,
                    animation: 'pulse 2s ease-in-out infinite',
                }}>
                    {waitingCountdown}s
                </div>
                <div style={{ fontSize: '11px', color: theme.textDisabled, marginTop: '4px' }}>
                    next poll
                </div>
                <div style={{ fontSize: '11px', color: theme.textDisabled, marginTop: '16px', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {sessionId}
                </div>
            </div>
        );
    }

    if (error) {
        // Determine user-friendly message based on error type
        const isTimeout = error.includes('timeout') || error.includes('Timeout') || error.includes('abort');
        const isServerError = error.includes('500') || error.includes('502') || error.includes('504') || error.includes('503');
        const is422 = error.includes('422');
        const isNoData = error.includes('No epoch data') || error.includes('no points') || error.includes('No training movie');
        const isNonJson = error.includes('Non-JSON response');
        const isNetworkError = error.includes('fetch') || error.includes('network') || error.includes('Failed to fetch');

        let friendlyMessage: string;
        if (is422 || isNoData) {
            friendlyMessage = 'No visualization data available for this session.';
        } else if (isTimeout || isServerError || isNonJson) {
            friendlyMessage = 'Visualization data is still being processed. Try refreshing in a few minutes.';
        } else if (isNetworkError) {
            friendlyMessage = 'Unable to reach the server. Check your connection and try again.';
        } else {
            friendlyMessage = 'Something went wrong loading the visualization. Try refreshing the page.';
        }

        return (
            <div className="training-progress-display" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: theme.bgLoading,
                color: theme.textSecondary,
                position: 'relative'
            }}>
                <div style={{
                    position: 'absolute',
                    ...(isMobile ? { bottom: '10px', left: '10px' } : { top: '10px', right: '10px' }),
                    fontSize: isMobile ? '10px' : '12px',
                    color: theme.textMuted,
                    fontFamily: 'monospace',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '4px 8px',
                    borderRadius: '4px'
                }}>
                    Build: {BUILD_TIMESTAMP.slice(0, 16)}
                </div>
                <div style={{ fontSize: '16px', marginBottom: '12px', color: theme.textPrimary }}>{friendlyMessage}</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '10px', textAlign: 'center', maxWidth: '80vw', wordBreak: 'break-word' as const }}>{error}</div>
                <div style={{ fontSize: '11px', color: theme.textDisabled, marginTop: '8px', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    Session: {isMobile && sessionId.length > 20 ? sessionId.slice(0, 8) + '...' + sessionId.slice(-4) : sessionId}
                </div>
            </div>
        );
    }

    if (!trainingData || Object.keys(trainingData).length === 0) {
        return (
            <div className="training-progress-display" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: theme.bgLoading,
                color: theme.textSecondary
            }}>
                No training movie data available
            </div>
        );
    }

    return (
        <div ref={outerContainerRef} className="training-progress-display" style={{
            display: isMobile || isThumbnail ? 'flex' : 'grid',
            flexDirection: 'column',
            gridTemplateRows: isThumbnail ? '1fr' : '44px 1fr',
            gridTemplateColumns: isThumbnail || isMobile ? '1fr' : (isWideScreen ? '400px 1fr' : '360px 1fr'),
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            maxWidth: '100%',
            height: '100%',
            margin: 0,
            padding: 0,
            boxSizing: 'border-box',
            overflow: 'hidden',
            background: theme.bgPrimary,
            color: theme.textPrimary,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            {/* Top Control Strip - spans full width */}
            {!isThumbnail && (
            <div style={{
                gridColumn: '1 / -1',
                height: '44px',
                flexShrink: 0,
                background: theme.bgTertiary,
                borderBottom: `1px solid ${theme.borderPrimary}`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                minWidth: 0,
                overflow: 'hidden',
                boxSizing: 'border-box',
            }}>
                {/* Left: Panel button (mobile) or Session name (desktop) */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    overflow: 'hidden',
                }}>
                    {isMobile && (
                        <button
                            onClick={() => setShowMobilePanel(true)}
                            style={{
                                background: theme.bgSurface,
                                border: `1px solid ${theme.borderPrimary}`,
                                color: theme.textSecondary,
                                padding: '6px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                flexShrink: 0,
                            }}
                        >
                            <span style={{ fontSize: '14px' }}>☰</span>
                            <span>Panel</span>
                        </button>
                    )}
                    <span style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: theme.textSecondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {isMobile && sessionId.length > 20 ? sessionId.slice(0, 12) + '...' : sessionId}
                    </span>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(sessionId);
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: theme.textTertiary,
                            padding: '4px 6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            flexShrink: 0,
                        }}
                        title="Copy Session ID"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>

                {/* Center: Frame X/Y and status */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                }}>
                    {frameInfo && !isMobile && (
                        <span style={{ fontSize: '12px', color: theme.textPrimary }}>
                            Frame {frameInfo.current} / {frameInfo.total}
                            {frameInfo.epoch && (
                                <span style={{ color: theme.textSecondary, marginLeft: '8px' }}>
                                    (Epoch {frameInfo.epoch.toString().replace('epoch_', '')})
                                </span>
                            )}
                        </span>
                    )}
                    {frameInfo && isMobile && (
                        <span style={{ fontSize: '11px', color: theme.textPrimary }}>
                            {frameInfo.current}/{frameInfo.total}
                        </span>
                    )}
                    {/* Movement metric in top bar */}
                    {currentEpochMovement && !isMobile && (
                        <span style={{
                            fontSize: '11px',
                            color: currentEpochMovement.median < 0.01 ? theme.success : currentEpochMovement.median < 0.05 ? theme.warning : theme.error,
                            fontFamily: 'monospace',
                        }}>
                            Δ {currentEpochMovement.median.toFixed(4)}
                        </span>
                    )}
                    {trainingStatus === 'training' && (
                        <span style={{ fontSize: '11px', color: theme.accent }}>In Progress</span>
                    )}
                    {trainingStatus === 'completed' && !isMobile && (
                        <span style={{ fontSize: '11px', color: theme.textSecondary }}>Completed</span>
                    )}
                </div>

                {/* Right: featrix branding + Play/Pause (mobile) + Rotate toggle */}
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                    {/* Sport mode badge moved to lower-right corner of sphere container */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: '8px' }}>
                        <a
                            href="https://featrix.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: theme.textMuted,
                                fontSize: '11px',
                                textDecoration: 'none',
                                fontFamily: 'monospace',
                            }}
                        >
                            featrix.ai
                        </a>
                        <span style={{ color: theme.textDisabled, fontSize: '9px', fontFamily: 'monospace' }}>
                            v{SPHERE_VIEWER_VERSION}
                        </span>
                    </div>
                    {/* Mobile: Playback play/pause always visible */}
                    {isMobile && (
                        <button
                            onClick={handlePlayPause}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: isPlaying ? theme.accent : theme.textSecondary,
                                padding: '6px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            title={isPlaying ? "Pause Playback" : "Play"}
                        >
                            {isPlaying ? '\u23F8' : '\u25B6'}
                        </button>
                    )}
                </div>
            </div>
            )}

            {/* Left Sidebar - Desktop */}
            {!isMobile && !isThumbnail && (
            <div style={{
                width: isWideScreen ? '400px' : '360px',
                background: theme.bgSecondary,
                borderRight: `1px solid ${theme.borderPrimary}`,
                padding: 0,
                overflowY: 'auto',
                fontSize: '12px',
            }}>
                {/* Header Bar - Always visible with current epoch and movement metrics */}
                <div style={{
                    padding: '12px 16px',
                    background: theme.bgTertiary,
                    borderBottom: `1px solid ${theme.borderPrimary}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {frameInfo && (
                            <span style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: theme.textPrimary,
                            }}>
                                Epoch {frameInfo.epoch?.toString().replace('epoch_', '') ?? '—'}
                            </span>
                        )}
                        {!frameInfo && (
                            <span style={{ fontSize: '12px', color: theme.textTertiary }}>Loading...</span>
                        )}
                        {/* Movement metrics display */}
                        {currentEpochMovement && (
                            <div
                                onClick={() => setShowMovementHistogram(!showMovementHistogram)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '4px 8px',
                                    background: showMovementHistogram ? theme.bgLoading : theme.bgSurface,
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s',
                                }}
                                title="Click to show movement histogram"
                            >
                                <span style={{ fontSize: '10px', color: theme.textTertiary, textTransform: 'uppercase' }}>Move</span>
                                <span style={{
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    color: currentEpochMovement.median < 0.01 ? theme.success : currentEpochMovement.median < 0.05 ? theme.warning : theme.error,
                                    fontFamily: 'monospace',
                                }}>
                                    {currentEpochMovement.median.toFixed(4)}
                                </span>
                                <span style={{ fontSize: '9px', color: theme.textMuted }}>▼</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Movement Histogram Popover */}
                {showMovementHistogram && currentEpochMovement && (
                    <div style={{
                        padding: '12px 16px',
                        background: theme.bgTertiary,
                        borderBottom: `1px solid ${theme.borderPrimary}`,
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '10px',
                        }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: theme.textPrimary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Movement Stats
                            </span>
                            <button
                                onClick={() => setShowMovementHistogram(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: theme.textTertiary,
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    padding: '2px 6px',
                                }}
                            >
                                ×
                            </button>
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '8px',
                            marginBottom: '12px',
                        }}>
                            <div style={{ textAlign: 'center', padding: '8px', background: theme.bgSurface, borderRadius: '4px' }}>
                                <div style={{ fontSize: '9px', color: theme.textTertiary, textTransform: 'uppercase', marginBottom: '4px' }}>Mean</div>
                                <div style={{ fontSize: '12px', color: theme.textPrimary, fontFamily: 'monospace' }}>{currentEpochMovement.mean.toFixed(4)}</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '8px', background: theme.bgSurface, borderRadius: '4px' }}>
                                <div style={{ fontSize: '9px', color: theme.textTertiary, textTransform: 'uppercase', marginBottom: '4px' }}>Median</div>
                                <div style={{ fontSize: '12px', color: theme.info, fontFamily: 'monospace' }}>{currentEpochMovement.median.toFixed(4)}</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '8px', background: theme.bgSurface, borderRadius: '4px' }}>
                                <div style={{ fontSize: '9px', color: theme.textTertiary, textTransform: 'uppercase', marginBottom: '4px' }}>P90</div>
                                <div style={{ fontSize: '12px', color: '#ff6666', fontFamily: 'monospace' }}>{currentEpochMovement.p90.toFixed(4)}</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '8px', background: theme.bgSurface, borderRadius: '4px' }}>
                                <div style={{ fontSize: '9px', color: theme.textTertiary, textTransform: 'uppercase', marginBottom: '4px' }}>Max</div>
                                <div style={{ fontSize: '12px', color: theme.textPrimary, fontFamily: 'monospace' }}>{currentEpochMovement.max.toFixed(4)}</div>
                            </div>
                        </div>
                        {/* Movement over time chart */}
                        {movementData.length > 0 && (
                            <MovementPlotOverlay
                                movementData={movementData}
                                currentEpoch={frameInfo?.epoch}
                                style={{ width: '100%', height: '100px', borderRadius: '4px', border: `1px solid ${theme.borderPrimary}` }}
                            />
                        )}
                    </div>
                )}


                {/* Panel 1: SEARCH */}
                {/* Panel 3: SEARCH (default CLOSED) */}
                <CollapsibleSection title="SEARCH" defaultOpen={false} storageKey="search">
                    {columnTypes && Object.keys(columnTypes).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Column selector */}
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Column</span>
                                <select
                                    value={selectedSearchColumn}
                                    onChange={(e) => setSelectedSearchColumn(e.target.value)}
                                    style={{
                                        height: '30px',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        padding: '0 8px',
                                        backgroundColor: theme.bgSurface,
                                        color: theme.textPrimary,
                                        border: `1px solid ${theme.borderPrimary}`,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        width: '100%',
                                    }}
                                >
                                    {Object.keys(columnTypes).map((col) => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Search input */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={handleSearchInput}
                                    onKeyDown={handleSearchKeyDown}
                                    placeholder="Search..."
                                    style={{
                                        flex: 1,
                                        height: '30px',
                                        background: theme.bgSurface,
                                        border: `1px solid ${theme.borderPrimary}`,
                                        color: theme.textPrimary,
                                        padding: '0 10px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                    }}
                                />
                                <button
                                    onClick={handleSearchSubmit}
                                    disabled={!searchQuery.trim()}
                                    style={{
                                        width: '48px',
                                        height: '30px',
                                        background: searchQuery.trim() ? theme.accent : theme.bgSurface,
                                        border: `1px solid ${theme.borderPrimary}`,
                                        color: searchQuery.trim() ? theme.accentText : theme.textTertiary,
                                        padding: '0',
                                        borderRadius: '6px',
                                        cursor: searchQuery.trim() ? 'pointer' : 'not-allowed',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                    }}
                                >
                                    GO
                                </button>
                                {searchQuery && (
                                    <button
                                        onClick={() => {
                                            setSearchQuery('');
                                            setSearchResultStats(null);
                                            if (sphereRef) clear_selected_objects(sphereRef);
                                            applyColorRules();
                                        }}
                                        style={{
                                            width: '30px',
                                            height: '30px',
                                            background: theme.bgSurface,
                                            border: `1px solid ${theme.borderPrimary}`,
                                            color: theme.textTertiary,
                                            padding: '0',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                        }}
                                    >
                                        X
                                    </button>
                                )}
                            </div>

                            {/* Live search preview count */}
                            {searchQuery && searchResultStats && (
                                <div style={{
                                    marginTop: '6px',
                                    padding: '6px 10px',
                                    background: searchResultStats.yes > 0 ? theme.successBg : theme.errorBg,
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    color: searchResultStats.yes > 0 ? theme.success : theme.error,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}>
                                    <span style={{ fontWeight: 600 }}>{searchResultStats.yes}</span>
                                    <span style={{ color: theme.textTertiary }}>matches</span>
                                    {searchResultStats.no > 0 && (
                                        <>
                                            <span style={{ color: theme.textDisabled }}>|</span>
                                            <span style={{ color: theme.textMuted }}>{searchResultStats.no} no match</span>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Color Rules */}
                            {colorRules.length > 0 && (
                                <div style={{ marginTop: '8px' }}>
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '6px' }}>
                                        Color Rules ({colorRules.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                                        {colorRules.map((rule) => (
                                            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px', background: theme.bgInset, borderRadius: '3px' }}>
                                                <div style={{ width: '14px', height: '14px', background: rule.color, borderRadius: '2px', flexShrink: 0 }} />
                                                <div style={{ flex: 1, fontSize: '11px', color: theme.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {rule.column}: {rule.query} ({rule.recordIds.length})
                                                </div>
                                                <button
                                                    onClick={() => setColorRules(prev => prev.filter(r => r.id !== rule.id))}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: theme.textSecondary,
                                                        padding: '2px 4px',
                                                        cursor: 'pointer',
                                                        fontSize: '10px',
                                                    }}
                                                >
                                                    X
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setColorRules([])}
                                        style={{
                                            marginTop: '6px',
                                            width: '100%',
                                            background: theme.bgLoading,
                                            border: 'none',
                                            color: theme.textSecondary,
                                            padding: '6px',
                                            borderRadius: '3px',
                                            cursor: 'pointer',
                                            fontSize: '11px',
                                        }}
                                    >
                                        Clear All
                                    </button>
                                </div>
                            )}

                            {/* Column vocabulary histogram for set/string columns */}
                            {columnVocabulary && columnVocabulary.type !== 'scalar' && columnVocabulary.vocabularyWithCounts && (
                                <div style={{ marginTop: '8px' }}>
                                    <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>
                                        Values ({columnVocabulary.uniqueCount} unique):
                                    </div>
                                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                        {columnVocabulary.vocabularyWithCounts.slice(0, 15).map((item, idx) => {
                                            const isSelected = searchQuery.toLowerCase() === item.value.toLowerCase();
                                            const maxCount = columnVocabulary.vocabularyWithCounts![0].count;
                                            const barWidth = Math.max(5, (item.count / maxCount) * 100);
                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => {
                                                        setSearchQuery(item.value);
                                                        const fakeEvent = { target: { value: item.value } } as React.ChangeEvent<HTMLInputElement>;
                                                        handleSearchInput(fakeEvent);
                                                    }}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '3px 6px',
                                                        marginBottom: '2px',
                                                        borderRadius: '3px',
                                                        cursor: 'pointer',
                                                        background: isSelected ? theme.bgSurfaceActive : 'transparent',
                                                        border: isSelected ? `1px solid ${theme.accent}` : '1px solid transparent',
                                                    }}
                                                >
                                                    {/* Value label */}
                                                    <span style={{
                                                        fontSize: '10px',
                                                        color: isSelected ? theme.accent : theme.textSecondary,
                                                        width: '80px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        flexShrink: 0,
                                                    }} title={item.value}>
                                                        {item.value.length > 12 ? item.value.substring(0, 12) + '…' : item.value}
                                                    </span>
                                                    {/* Bar */}
                                                    <div style={{
                                                        flex: 1,
                                                        height: '12px',
                                                        background: theme.bgLoading,
                                                        borderRadius: '2px',
                                                        overflow: 'hidden',
                                                    }}>
                                                        <div style={{
                                                            width: `${barWidth}%`,
                                                            height: '100%',
                                                            background: isSelected ? theme.accent : '#4a7c59',
                                                            borderRadius: '2px',
                                                        }} />
                                                    </div>
                                                    {/* Count */}
                                                    <span style={{
                                                        fontSize: '9px',
                                                        color: theme.textTertiary,
                                                        width: '45px',
                                                        textAlign: 'right',
                                                        flexShrink: 0,
                                                    }}>
                                                        {item.count} ({item.pct}%)
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        {columnVocabulary.vocabularyWithCounts.length > 15 && (
                                            <div style={{ fontSize: '9px', color: theme.textMuted, textAlign: 'center', marginTop: '4px' }}>
                                                +{columnVocabulary.vocabularyWithCounts.length - 15} more values
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Distribution chart and stats for scalar columns */}
                            {columnVocabulary && columnVocabulary.type === 'scalar' && columnVocabulary.rawValues && columnVocabulary.rawValues.length > 0 && (
                                <div style={{ marginTop: '8px' }}>
                                    <BoxPlotSparkline
                                        data={columnVocabulary.rawValues}
                                        width={340}
                                        height={28}
                                        variant="violin"
                                        theme={createTheme(themes.dark, {
                                            colors: { primary: '#6bb8f0', accent: '#6bb8f0' },
                                            popover: { bg: '#1e1e2e', border: '#333', text: '#e0e0e0', textMuted: '#888' },
                                        })}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ fontSize: '12px', color: theme.textSecondary }}>No searchable columns</div>
                    )}
                </CollapsibleSection>

                {/* Panel 2: CLUSTER CONTROLS / MANIFOLD LEGEND */}
                <CollapsibleSection title={isManifoldViz ? "PREDICTION COLORS" : "CLUSTER CONTROLS"} defaultOpen={isManifoldViz} storageKey="clusterControls">
                    {isManifoldViz ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>prob_positive</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11px', color: theme.textSecondary }}>0.0</span>
                                <div style={{
                                    flex: 1,
                                    height: '16px',
                                    borderRadius: '4px',
                                    background: 'linear-gradient(to right, #ef4444, #d1d5db, #22c55e)',
                                }} />
                                <span style={{ fontSize: '11px', color: theme.textSecondary }}>1.0</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: theme.textTertiary }}>
                                <span>Negative</span>
                                <span>Uncertain</span>
                                <span>Positive</span>
                            </div>
                        </div>
                    ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* Cluster Coloring dropdown */}
                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Cluster Coloring</span>
                            <select
                                value={clusterColorMode}
                                onChange={(e) => setClusterColorMode(e.target.value as 'final' | 'per-epoch')}
                                style={{
                                    height: '30px',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    padding: '0 8px',
                                    backgroundColor: theme.bgSurface,
                                    color: theme.textPrimary,
                                    border: `1px solid ${theme.borderPrimary}`,
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    width: '100%',
                                }}
                            >
                                <option value="final">Final Frame</option>
                                <option value="per-epoch">Per-Epoch</option>
                            </select>
                        </div>

                        {/* Focus Cluster dropdown */}
                        {frameInfo && (
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Focus Cluster</span>
                                <select
                                    value={spotlightCluster}
                                    onChange={(e) => {
                                        const cluster = parseInt(e.target.value);
                                        setSpotlightCluster(cluster);
                                        if (sphereRef) {
                                            sphereRef.spotlightCluster = cluster;
                                            update_cluster_spotlight(sphereRef, true);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{
                                        height: '30px',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        padding: '0 8px',
                                        backgroundColor: theme.bgSurface,
                                        color: theme.textPrimary,
                                        border: `1px solid ${theme.borderPrimary}`,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        width: '100%',
                                    }}
                                >
                                    <option value={-1}>None</option>
                                    {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => (
                                        <option key={i} value={i}>Cluster {i}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Cluster Analysis button */}
                        {frameInfo && frameInfo.visible > 0 && (
                            <button
                                onClick={() => setShowClusterAnalysis(true)}
                                style={{
                                    width: '100%',
                                    padding: '10px 16px',
                                    backgroundColor: theme.bgSurfaceActive,
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: theme.textPrimary,
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                }}
                            >
                                <span style={{ fontSize: '14px' }}>📊</span>
                                Cluster Analysis
                            </button>
                        )}

                        {/* Show Cluster Spheres checkbox */}
                        {frameInfo && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={showDynamicHulls}
                                    onChange={(e) => setShowDynamicHulls(e.target.checked)}
                                    disabled={frameInfo.visible < 4}
                                    style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: theme.accent }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 500, color: frameInfo.visible >= 4 ? theme.textSecondary : theme.textDisabled }}>Show Cluster Spheres</span>
                            </label>
                        )}

                        {/* Cluster color swatches (if showColorLegend) */}
                        {showColorLegend && frameInfo && frameInfo.visible > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '6px' }}>Cluster Colors</div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {Array.from({length: frameInfo.visible}, (_, i) => {
                                        const kColorTable = [0x4C78A8, 0x72B7B2, 0xF58518, 0xE45756, 0x54A24B, 0xB279A2, 0xFF9DA6, 0x9D755D, 0xBAB0AC, 0x79706E, 0xD37295, 0x8F6D31];
                                        const defaultColorHex = kColorTable[i] || 0x999999;
                                        const customColorHex = sphereRef?.customClusterColors?.get(i);
                                        const colorHex = customColorHex || defaultColorHex;
                                        const color = '#' + colorHex.toString(16).padStart(6, '0');
                                        return (
                                            <div key={`cluster-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                <span style={{ fontSize: '10px', color: theme.textSecondary }}>C{i}</span>
                                                <input
                                                    type="color"
                                                    value={color}
                                                    onChange={(e) => {
                                                        if (sphereRef) {
                                                            const newColor = e.target.value;
                                                            set_cluster_color(sphereRef, i, newColor);
                                                            render_sphere(sphereRef);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '24px',
                                                        height: '24px',
                                                        border: `1px solid ${theme.borderPrimary}`,
                                                        borderRadius: '3px',
                                                        cursor: 'pointer',
                                                        padding: 0
                                                    }}
                                                    title={`Change color for cluster ${i}`}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={() => {
                                        if (sphereRef) {
                                            clear_cluster_colors(sphereRef);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{
                                        marginTop: '8px',
                                        width: '100%',
                                        background: theme.bgLoading,
                                        border: 'none',
                                        color: theme.textSecondary,
                                        padding: '6px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '11px'
                                    }}
                                >
                                    Reset Colors
                                </button>
                            </div>
                        )}

                        {/* Cluster inspector (if showClusterDebug) */}
                        {showClusterDebug && (
                            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${theme.borderPrimary}` }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginTop: '14px', marginBottom: '6px' }}>Cluster Inspector</div>
                                {sphereRef && (() => {
                                    const clusterCounts = new Map<number, number>();
                                    let pointsWithoutCluster = 0;
                                    let totalPoints = 0;

                                    if (sphereRef.pointObjectsByRecordID && sphereRef.pointRecordsByID) {
                                        sphereRef.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
                                            totalPoints++;
                                            const record = sphereRef.pointRecordsByID.get(recordId);
                                            let cluster = -1;
                                            const activeClusterKey = get_active_cluster_count_key(sphereRef);
                                            if (activeClusterKey !== null && sphereRef.finalClusterResults?.[activeClusterKey]?.cluster_labels) {
                                                const rowOffset = record?.featrix_meta?.__featrix_row_offset;
                                                if (rowOffset !== undefined && rowOffset < sphereRef.finalClusterResults[activeClusterKey].cluster_labels.length) {
                                                    cluster = sphereRef.finalClusterResults[activeClusterKey].cluster_labels[rowOffset];
                                                }
                                            }
                                            if (cluster === -1) {
                                                pointsWithoutCluster++;
                                            } else {
                                                clusterCounts.set(cluster, (clusterCounts.get(cluster) || 0) + 1);
                                            }
                                        });
                                    }

                                    if (clusterCounts.size === 0) {
                                        return <div style={{ fontSize: '12px', color: theme.textSecondary }}>No cluster data ({totalPoints} points)</div>;
                                    }

                                    return (
                                        <div style={{ fontSize: '11px', fontFamily: 'monospace', maxHeight: '120px', overflowY: 'auto' }}>
                                            {Array.from(clusterCounts.entries()).sort((a, b) => a[0] - b[0]).map(([cluster, count]) => (
                                                <div key={cluster} style={{ marginBottom: '2px', color: theme.textSecondary }}>
                                                    C{cluster}: {count} points
                                                </div>
                                            ))}
                                            {pointsWithoutCluster > 0 && (
                                                <div style={{ marginTop: '4px', color: theme.textSecondary }}>{pointsWithoutCluster} unassigned</div>
                                            )}
                                        </div>
                                    );
                                })()}
                                {selectedPointInfo && (
                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${theme.borderPrimary}`, fontSize: '11px' }}>
                                        <div style={{ color: theme.textPrimary, fontWeight: 'bold', marginBottom: '4px' }}>Selected Point</div>
                                        <div style={{ color: theme.textSecondary }}>Row: {selectedPointInfo.rowOffset}</div>
                                        <div style={{ color: theme.textSecondary }}>Cluster: {selectedPointInfo.clusterId}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    )}
                </CollapsibleSection>

                {/* Panel 3: MODEL INFO */}
                {/* Panel 2: MODEL INFO (default CLOSED) */}
                <CollapsibleSection title="MODEL INFO" defaultOpen={false} storageKey="modelInfo">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {/* Training status and frame info - flat text line */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                                {trainingStatus === 'training' && <span style={{ color: theme.accent }}>Training in progress</span>}
                                {trainingStatus === 'completed' && <span>Training completed</span>}
                                {!trainingStatus && <span>Status unknown</span>}
                            </span>
                            {frameInfo && (
                                <span style={{ fontSize: '12px', color: theme.textTertiary }}>
                                    Frame {frameInfo.current} / {frameInfo.total}
                                </span>
                            )}
                        </div>

                        {/* Validation Loss chart - flat, no box */}
                        {lossData && (() => {
                            let validationLossData = null;
                            if (lossData.validation_loss && Array.isArray(lossData.validation_loss)) {
                                validationLossData = lossData.validation_loss;
                            } else if (lossData.training_info && lossData.training_info.loss_history) {
                                validationLossData = lossData.training_info.loss_history.map((item: any) => ({
                                    epoch: item.epoch || item.epoch_number || 0,
                                    value: item.validation_loss || item.loss || 0
                                }));
                            } else if (Array.isArray(lossData)) {
                                validationLossData = lossData;
                            }
                            if (!validationLossData || !Array.isArray(validationLossData) || validationLossData.length === 0) return null;

                            let learningRateData = null;
                            if (lossData.learning_rate && Array.isArray(lossData.learning_rate)) {
                                learningRateData = lossData.learning_rate;
                            } else if (lossData.training_info?.loss_history) {
                                learningRateData = lossData.training_info.loss_history
                                    .filter((item: any) => item.current_learning_rate !== undefined || item.learning_rate !== undefined || item.lr !== undefined)
                                    .map((item: any) => ({ epoch: item.epoch || 0, value: item.current_learning_rate || item.learning_rate || item.lr || 0 }));
                            }

                            return (
                                <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '6px' }}>Validation Loss</div>
                                    <LossPlotOverlay
                                        lossData={validationLossData}
                                        learningRateData={learningRateData && learningRateData.length > 0 ? learningRateData : undefined}
                                        currentEpoch={frameInfo?.epoch}
                                        title=""
                                        style={{ width: '100%', height: '120px', pointerEvents: 'none', borderRadius: '4px', border: `1px solid ${theme.inspectorHeaderBg}` }}
                                    />
                                </div>
                            );
                        })()}

                        {/* Divider between charts */}
                        {lossData && movementData.length > 0 && (
                            <div style={{ height: '1px', background: theme.borderPrimary, margin: '14px 0' }} />
                        )}

                        {/* Point Movement chart - flat, no box */}
                        {movementData.length > 0 && (
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '6px' }}>Point Movement</div>
                                <MovementPlotOverlay
                                    movementData={movementData}
                                    currentEpoch={frameInfo?.epoch}
                                    style={{ width: '100%', height: '120px', pointerEvents: 'none', borderRadius: '4px', border: `1px solid ${theme.inspectorHeaderBg}` }}
                                />
                            </div>
                        )}

                        {/* Divider before histogram */}
                        {currentHistogramData && (
                            <div style={{ height: '1px', background: theme.borderPrimary, margin: '14px 0' }} />
                        )}

                        {/* Movement Histogram by Cluster */}
                        {currentHistogramData && (
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '6px' }}>Movement Distribution by Cluster</div>
                                <MovementHistogramByCluster
                                    histogramData={currentHistogramData}
                                    style={{ width: '100%', height: '150px', borderRadius: '4px', border: `1px solid ${theme.inspectorHeaderBg}` }}
                                />
                            </div>
                        )}

                        {/* View Model Card - link style action */}
                        <div style={{ marginTop: '16px', textAlign: 'right' }}>
                            <button
                                onClick={() => setShowModelCard(true)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: theme.accent,
                                    padding: '0',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                            >
                                View Model Card →
                            </button>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* Panel 4: SETTINGS */}
                {/* Panel 4: SETTINGS */}
                <CollapsibleSection title="SETTINGS" defaultOpen={false} storageKey="settings">
                    {/* Rendering group */}
                    <div style={{ marginBottom: '18px' }}>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '8px' }}>Rendering</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Point Size</span>
                                <select
                                    value={pointSize}
                                    onChange={(e) => {
                                        const newSize = parseFloat(e.target.value);
                                        setPointSize(newSize);
                                        if (sphereRef) {
                                            set_visual_options(sphereRef, newSize, pointAlpha);
                                            // Auto-toggle convex hulls when switching to/from surface-only mode
                                            if (newSize === 0 && !sphereRef.showEmbeddingHull) {
                                                toggle_embedding_hull(sphereRef, true);
                                            } else if (newSize > 0 && pointSize === 0 && sphereRef.showEmbeddingHull) {
                                                // Switching away from surface-only: turn hulls back off
                                                toggle_embedding_hull(sphereRef, false);
                                            }
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{
                                        height: '30px',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        padding: '0 8px',
                                        backgroundColor: theme.bgSurface,
                                        color: theme.textPrimary,
                                        border: `1px solid ${theme.borderPrimary}`,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        width: '100%',
                                    }}
                                >
                                    <option value={0}>Surface only</option>
                                    <option value={0.01}>0.01</option>
                                    <option value={0.02}>0.02</option>
                                    <option value={0.04}>0.04</option>
                                    <option value={0.06}>0.06</option>
                                    <option value={0.08}>0.08</option>
                                    <option value={0.10}>0.10</option>
                                    <option value={0.15}>0.15</option>
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Alpha</span>
                                <select
                                    value={pointAlpha}
                                    onChange={(e) => {
                                        const newAlpha = parseFloat(e.target.value);
                                        setPointAlpha(newAlpha);
                                        if (sphereRef) {
                                            set_visual_options(sphereRef, pointSize, newAlpha);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{
                                        height: '30px',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        padding: '0 8px',
                                        backgroundColor: theme.bgSurface,
                                        color: theme.textPrimary,
                                        border: `1px solid ${theme.borderPrimary}`,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        width: '100%',
                                    }}
                                >
                                    <option value={0.25}>25%</option>
                                    <option value={0.50}>50%</option>
                                    <option value={0.75}>75%</option>
                                    <option value={1.00}>100%</option>
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Trail Length</span>
                                <select
                                    value={trailLength}
                                    onChange={(e) => setTrailLength(parseInt(e.target.value))}
                                    style={{
                                        height: '30px',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        padding: '0 8px',
                                        backgroundColor: theme.bgSurface,
                                        color: theme.textPrimary,
                                        border: `1px solid ${theme.borderPrimary}`,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        width: '100%',
                                    }}
                                >
                                    <option value={0}>Off</option>
                                    <option value={1}>1 frame</option>
                                    <option value={2}>2 frames</option>
                                    <option value={5}>5 frames</option>
                                    <option value={8}>8 frames</option>
                                    <option value={10}>10 frames</option>
                                    <option value={15}>15 frames</option>
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Wireframe</span>
                                <select
                                    value={wireframeOpacity}
                                    onChange={(e) => {
                                        const newOpacity = parseFloat(e.target.value);
                                        setWireframeOpacity(newOpacity);
                                        if (sphereRef) {
                                            set_wireframe_opacity(sphereRef, newOpacity);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{
                                        height: '30px',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        padding: '0 8px',
                                        backgroundColor: theme.bgSurface,
                                        color: theme.textPrimary,
                                        border: `1px solid ${theme.borderPrimary}`,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        width: '100%',
                                    }}
                                >
                                    <option value={0}>Off</option>
                                    <option value={0.02}>2%</option>
                                    <option value={0.05}>5%</option>
                                    <option value={0.10}>10%</option>
                                    <option value={0.15}>15%</option>
                                    <option value={0.25}>25%</option>
                                </select>
                            </div>
                            {/* Alpha by Movement checkbox */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={alphaByMovement}
                                    onChange={(e) => {
                                        const enabled = e.target.checked;
                                        setAlphaByMovement(enabled);
                                        if (sphereRef) {
                                            sphereRef.alphaByMovement = enabled;
                                        }
                                    }}
                                    style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: theme.accent }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Alpha by Movement</span>
                                <span style={{ fontSize: '10px', color: theme.textTertiary, marginLeft: '4px' }}>(converging = brighter)</span>
                            </label>
                        </div>
                    </div>

                    {/* Geometry Overlays group */}
                    <div>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginTop: '14px', marginBottom: '8px' }}>Geometry Overlays</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* Show Bounds Boxes */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={showBoundsBox}
                                    onChange={(e) => {
                                        const enabled = e.target.checked;
                                        setShowBoundsBox(enabled);
                                        if (sphereRef) {
                                            toggle_bounds_box(sphereRef, enabled);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: theme.accent }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Show Bounds Box</span>
                            </label>

                            {/* Show Great Circles */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={showGreatCircles}
                                    onChange={(e) => {
                                        const enabled = e.target.checked;
                                        setShowGreatCircles(enabled);
                                        if (sphereRef) {
                                            toggle_great_circles(sphereRef, enabled);
                                        }
                                    }}
                                    style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: theme.accent }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Show Great Circles</span>
                            </label>

                            {/* Show Convex Hulls */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={sphereRef?.showEmbeddingHull || false}
                                    onChange={(e) => {
                                        if (sphereRef) {
                                            toggle_embedding_hull(sphereRef, e.target.checked);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: theme.accent }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Show Convex Hulls</span>
                            </label>

                            {/* Expand Hulls - only visible when hulls are shown */}
                            {sphereRef?.showEmbeddingHull && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginLeft: '20px' }}>
                                    <input
                                        type="checkbox"
                                        checked={(sphereRef?.hullExpansionFactor || 1.0) > 1.0}
                                        onChange={(e) => {
                                            if (sphereRef) {
                                                // Toggle between 1.0 (normal) and 1.3 (expanded)
                                                sphereRef.hullExpansionFactor = e.target.checked ? 1.3 : 1.0;
                                                compute_embedding_convex_hull(sphereRef);
                                                render_sphere(sphereRef);
                                            }
                                        }}
                                        style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: theme.accent }}
                                    />
                                    <span style={{ fontSize: '11px', fontWeight: 400, color: theme.textTertiary }}>Expand for overlap visibility</span>
                                </label>
                            )}

                            {/* Show Voronoi Regions */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={(sphereRef as any)?.showVoronoi || false}
                                    onChange={(e) => {
                                        if (sphereRef) {
                                            toggle_voronoi(sphereRef, e.target.checked);
                                        }
                                    }}
                                    style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: theme.accent }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>Show Voronoi Regions</span>
                            </label>
                        </div>

                        {/* Sphere Coverage display - updates every epoch */}
                        {frameInfo?.sphereCoverage !== undefined && (
                            <div style={{ fontSize: '11px', color: theme.textTertiary, marginTop: '10px' }}>
                                Sphere Coverage: <span style={{ color: theme.textPrimary, fontFamily: 'monospace' }}>{frameInfo.sphereCoverage.toFixed(1)}%</span>
                            </div>
                        )}
                    </div>
                </CollapsibleSection>

                {/* Sidebar Footer - Build info and load time */}
                <div style={{
                    padding: '12px 16px',
                    borderTop: `1px solid ${theme.borderPrimary}`,
                    marginTop: 'auto',
                    fontSize: '10px',
                    color: theme.textDisabled,
                    fontFamily: 'monospace',
                    display: 'flex',
                    justifyContent: 'space-between',
                }}>
                    <span>v1.0 build 2024.02</span>
                    <span>loaded {pageLoadTime}</span>
                </div>
            </div>
            )}

            {/* Mobile Slide-Over Drawer */}
            {isMobile && !isThumbnail && (
            <>
                {/* Scrim overlay */}
                {showMobilePanel && (
                    <div
                        onClick={() => setShowMobilePanel(false)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: theme.bgOverlay,
                            zIndex: 9998,
                        }}
                    />
                )}
                {/* Drawer panel */}
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '320px',
                    maxWidth: '85vw',
                    height: '100%',
                    background: theme.bgSecondary,
                    borderRight: `1px solid ${theme.borderPrimary}`,
                    zIndex: 9999,
                    transform: showMobilePanel ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 250ms ease-out',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    fontSize: '12px',
                }}>
                    {/* Drawer header with close button and epoch info */}
                    <div style={{
                        minHeight: '44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: theme.bgTertiary,
                        borderBottom: `1px solid ${theme.borderPrimary}`,
                        flexShrink: 0,
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {frameInfo ? (
                                <>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                                        Epoch {frameInfo.epoch?.toString().replace('epoch_', '') ?? '—'}
                                    </span>
                                    <span style={{ fontSize: '10px', color: theme.textTertiary }}>
                                        Frame {frameInfo.current} / {frameInfo.total}
                                    </span>
                                </>
                            ) : (
                                <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>Controls</span>
                            )}
                        </div>
                        <button
                            onClick={() => setShowMobilePanel(false)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: theme.textSecondary,
                                fontSize: '20px',
                                cursor: 'pointer',
                                padding: '4px 8px',
                                lineHeight: 1,
                            }}
                        >
                            ×
                        </button>
                    </div>
                    {/* Same accordion content as desktop */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {/* Panel 0: PLAYBACK - Transport controls */}
                        <CollapsibleSection title="PLAYBACK" defaultOpen={true} storageKey="playback">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {/* Play/Pause and frame navigation */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <button
                                        onClick={() => {
                                            if (sphereRef) {
                                                step_training_movie_frame(sphereRef, 'backward');
                                            }
                                        }}
                                        style={{
                                            background: theme.bgSurface,
                                            border: `1px solid ${theme.borderSecondary}`,
                                            color: theme.textSecondary,
                                            padding: '10px 16px',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                        title="Previous Frame"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="5" width="3" height="14"/><polygon points="19,5 9,12 19,19"/></svg>
                                    </button>
                                    <button
                                        onClick={handlePlayPause}
                                        style={{
                                            background: isPlaying ? theme.accent : theme.bgSurface,
                                            border: `1px solid ${theme.borderSecondary}`,
                                            color: isPlaying ? theme.accentText : theme.textPrimary,
                                            padding: '10px 24px',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '18px',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                        title={isPlaying ? "Pause" : "Play"}
                                    >
                                        {isPlaying ? (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                        ) : (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (sphereRef) {
                                                step_training_movie_frame(sphereRef, 'forward');
                                            }
                                        }}
                                        style={{
                                            background: theme.bgSurface,
                                            border: `1px solid ${theme.borderSecondary}`,
                                            color: theme.textSecondary,
                                            padding: '10px 16px',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                        title="Next Frame"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,5 15,12 5,19"/><rect x="18" y="5" width="3" height="14"/></svg>
                                    </button>
                                </div>
                                {/* Frame scrubber */}
                                {frameInfo && frameInfo.total > 1 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: theme.textTertiary, fontSize: '11px', width: '30px' }}>1</span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={frameInfo.total}
                                            value={frameInfo.current}
                                            onChange={(e) => {
                                                if (sphereRef) {
                                                    goto_training_movie_frame(sphereRef, parseInt(e.target.value));
                                                }
                                            }}
                                            style={{ flex: 1, cursor: 'pointer' }}
                                        />
                                        <span style={{ color: theme.textTertiary, fontSize: '11px', width: '30px', textAlign: 'right' }}>{frameInfo.total}</span>
                                    </div>
                                )}
                            </div>
                        </CollapsibleSection>

                        {/* Panel 1: CLUSTER CONTROLS / MANIFOLD LEGEND */}
                        <CollapsibleSection title={isManifoldViz ? "PREDICTION COLORS" : "CLUSTER CONTROLS"} defaultOpen={isManifoldViz} storageKey="clusterControls">
                            {isManifoldViz ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary }}>prob_positive</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '11px', color: theme.textSecondary }}>0.0</span>
                                        <div style={{
                                            flex: 1,
                                            height: '16px',
                                            borderRadius: '4px',
                                            background: 'linear-gradient(to right, #ef4444, #d1d5db, #22c55e)',
                                        }} />
                                        <span style={{ fontSize: '11px', color: theme.textSecondary }}>1.0</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: theme.textTertiary }}>
                                        <span>Negative</span>
                                        <span>Uncertain</span>
                                        <span>Positive</span>
                                    </div>
                                </div>
                            ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <label style={{ color: theme.textSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>Cluster Coloring</span>
                                    <select
                                        value={clusterColorMode}
                                        onChange={(e) => setClusterColorMode(e.target.value as 'final' | 'per-epoch')}
                                        style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: theme.bgSurface, color: theme.textPrimary, border: `1px solid ${theme.borderPrimary}`, borderRadius: '3px', cursor: 'pointer', width: '120px' }}
                                    >
                                        <option value="final">Final Frame</option>
                                        <option value="per-epoch">Per-Epoch</option>
                                    </select>
                                </label>
                                {frameInfo && (
                                    <label style={{ color: theme.textSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>Focus Cluster</span>
                                        <select
                                            value={spotlightCluster}
                                            onChange={(e) => {
                                                const cluster = parseInt(e.target.value);
                                                setSpotlightCluster(cluster);
                                                if (sphereRef) {
                                                    sphereRef.spotlightCluster = cluster;
                                                    update_cluster_spotlight(sphereRef, true);
                                                    render_sphere(sphereRef);
                                                }
                                            }}
                                            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: theme.bgSurface, color: theme.textPrimary, border: `1px solid ${theme.borderPrimary}`, borderRadius: '3px', cursor: 'pointer', width: '120px' }}
                                        >
                                            <option value={-1}>None</option>
                                            {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => (
                                                <option key={i} value={i}>Cluster {i}</option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            </div>
                            )}
                        </CollapsibleSection>

                        {/* Panel 2: SETTINGS */}
                        <CollapsibleSection title="SETTINGS" defaultOpen={false} storageKey="settings">
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginTop: '0', marginBottom: '6px' }}>Rendering</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label style={{ color: theme.textSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>Point Size</span>
                                        <select
                                            value={pointSize}
                                            onChange={(e) => {
                                                const newSize = parseFloat(e.target.value);
                                                setPointSize(newSize);
                                                if (sphereRef) {
                                                    set_visual_options(sphereRef, newSize, pointAlpha);
                                                    if (newSize === 0 && !sphereRef.showEmbeddingHull) {
                                                        toggle_embedding_hull(sphereRef, true);
                                                    } else if (newSize > 0 && pointSize === 0 && sphereRef.showEmbeddingHull) {
                                                        toggle_embedding_hull(sphereRef, false);
                                                    }
                                                    render_sphere(sphereRef);
                                                }
                                            }}
                                            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: theme.bgSurface, color: theme.textPrimary, border: `1px solid ${theme.borderPrimary}`, borderRadius: '3px', cursor: 'pointer', width: '80px' }}
                                        >
                                            <option value={0}>Surface only</option>
                                            <option value={0.01}>0.01</option>
                                            <option value={0.02}>0.02</option>
                                            <option value={0.04}>0.04</option>
                                            <option value={0.06}>0.06</option>
                                        </select>
                                    </label>
                                    <label style={{ color: theme.textSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>Alpha</span>
                                        <select
                                            value={pointAlpha}
                                            onChange={(e) => {
                                                const newAlpha = parseFloat(e.target.value);
                                                setPointAlpha(newAlpha);
                                                if (sphereRef) {
                                                    set_visual_options(sphereRef, pointSize, newAlpha);
                                                    render_sphere(sphereRef);
                                                }
                                            }}
                                            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: theme.bgSurface, color: theme.textPrimary, border: `1px solid ${theme.borderPrimary}`, borderRadius: '3px', cursor: 'pointer', width: '80px' }}
                                        >
                                            <option value={0.25}>25%</option>
                                            <option value={0.50}>50%</option>
                                            <option value={0.75}>75%</option>
                                            <option value={1.00}>100%</option>
                                        </select>
                                    </label>
                                    {/* Alpha by Movement checkbox */}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={alphaByMovement}
                                            onChange={(e) => {
                                                const enabled = e.target.checked;
                                                setAlphaByMovement(enabled);
                                                if (sphereRef) {
                                                    sphereRef.alphaByMovement = enabled;
                                                }
                                            }}
                                            style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: theme.accent }}
                                        />
                                        <span style={{ fontSize: '12px', color: theme.textSecondary }}>Alpha by Movement</span>
                                    </label>
                                </div>
                            </div>
                        </CollapsibleSection>

                        {/* Panel 4: SEARCH */}
                        <CollapsibleSection title="SEARCH" defaultOpen={false} storageKey="search">
                            {columnTypes && Object.keys(columnTypes).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Column selector */}
                                    <label style={{ color: theme.textSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>Column</span>
                                        <select
                                            value={selectedSearchColumn}
                                            onChange={(e) => setSelectedSearchColumn(e.target.value)}
                                            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: theme.bgSurface, color: theme.textPrimary, border: `1px solid ${theme.borderPrimary}`, borderRadius: '3px', cursor: 'pointer', width: '160px' }}
                                        >
                                            {Object.keys(columnTypes).map((col) => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>
                                    </label>

                                    {/* Search input */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={handleSearchInput}
                                            onKeyDown={handleSearchKeyDown}
                                            placeholder="Search..."
                                            style={{
                                                flex: 1,
                                                height: '32px',
                                                background: theme.bgSurface,
                                                border: `1px solid ${theme.borderPrimary}`,
                                                color: theme.textPrimary,
                                                padding: '0 10px',
                                                borderRadius: '4px',
                                                fontSize: '12px',
                                            }}
                                        />
                                        <button
                                            onClick={handleSearchSubmit}
                                            disabled={!searchQuery.trim()}
                                            style={{
                                                width: '48px',
                                                height: '32px',
                                                background: searchQuery.trim() ? theme.accent : theme.bgSurface,
                                                border: `1px solid ${theme.borderPrimary}`,
                                                color: searchQuery.trim() ? theme.accentText : theme.textTertiary,
                                                padding: '0',
                                                borderRadius: '4px',
                                                cursor: searchQuery.trim() ? 'pointer' : 'not-allowed',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                            }}
                                        >
                                            GO
                                        </button>
                                        {searchQuery && (
                                            <button
                                                onClick={() => {
                                                    setSearchQuery('');
                                                    setSearchResultStats(null);
                                                    applyColorRules();
                                                }}
                                                style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    background: theme.bgSurface,
                                                    border: `1px solid ${theme.borderPrimary}`,
                                                    color: theme.textTertiary,
                                                    padding: '0',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                }}
                                            >
                                                X
                                            </button>
                                        )}
                                    </div>

                                    {/* Live search preview count */}
                                    {searchQuery && searchResultStats && (
                                        <div style={{
                                            marginTop: '4px',
                                            padding: '4px 8px',
                                            background: searchResultStats.yes > 0 ? theme.successBg : theme.errorBg,
                                            borderRadius: '4px',
                                            fontSize: '10px',
                                            color: searchResultStats.yes > 0 ? theme.success : theme.error,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                        }}>
                                            <span style={{ fontWeight: 600 }}>{searchResultStats.yes}</span>
                                            <span style={{ color: theme.textTertiary }}>matches</span>
                                        </div>
                                    )}

                                    {/* Color Rules (compact for mobile) */}
                                    {colorRules.length > 0 && (
                                        <div style={{ marginTop: '4px' }}>
                                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '4px' }}>
                                                Color Rules ({colorRules.length})
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                                                {colorRules.map((rule) => (
                                                    <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px', background: theme.bgInset, borderRadius: '3px' }}>
                                                        <div style={{ width: '12px', height: '12px', background: rule.color, borderRadius: '2px', flexShrink: 0 }} />
                                                        <div style={{ flex: 1, fontSize: '10px', color: theme.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {rule.column}: {rule.query} ({rule.recordIds.length})
                                                        </div>
                                                        <button
                                                            onClick={() => setColorRules(prev => prev.filter(r => r.id !== rule.id))}
                                                            style={{ background: 'transparent', border: 'none', color: theme.textSecondary, padding: '2px 4px', cursor: 'pointer', fontSize: '10px' }}
                                                        >
                                                            X
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => setColorRules([])}
                                                style={{ marginTop: '4px', width: '100%', background: theme.borderPrimary, border: 'none', color: theme.textSecondary, padding: '6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}
                                            >
                                                Clear All
                                            </button>
                                        </div>
                                    )}

                                    {/* Quick value selection for categorical columns */}
                                    {columnVocabulary && columnVocabulary.type !== 'scalar' && columnVocabulary.vocabulary && (
                                        <div style={{ marginTop: '4px' }}>
                                            <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '4px' }}>Values:</div>
                                            <div style={{ maxHeight: '80px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {columnVocabulary.vocabulary.slice(0, 15).map((val, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            setSearchQuery(val);
                                                            const fakeEvent = { target: { value: val } } as React.ChangeEvent<HTMLInputElement>;
                                                            handleSearchInput(fakeEvent);
                                                        }}
                                                        style={{
                                                            background: theme.bgSurface,
                                                            border: searchQuery === val ? `1px solid ${theme.accent}` : `1px solid ${theme.borderPrimary}`,
                                                            color: searchQuery === val ? theme.accent : theme.textSecondary,
                                                            padding: '2px 6px',
                                                            borderRadius: '3px',
                                                            cursor: 'pointer',
                                                            fontSize: '10px',
                                                        }}
                                                    >
                                                        {val.length > 12 ? val.substring(0, 12) + '...' : val}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ fontSize: '12px', color: theme.textSecondary }}>No searchable columns</div>
                            )}
                        </CollapsibleSection>
                    </div>
                </div>
            </>
            )}

            {/* Sphere Container - fills remaining space */}
            <div style={{
                gridColumn: isMobile || isThumbnail ? '1' : '2',
                gridRow: isThumbnail ? '1' : '2',
                position: 'relative',
                background: bgOverride || (sportMode ? theme.bgCanvasSport : theme.bgCanvas),
                minHeight: 0,
                minWidth: 0,
                overflow: 'hidden',
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                transition: 'background 600ms ease',
                flex: isMobile || isThumbnail ? 1 : undefined,
            }}>
                {/* Countdown Overlay - only temporary, positioned over sphere */}
                {showCountdown && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: theme.inspectorBg,
                        color: theme.textPrimary,
                        padding: '30px 50px',
                        borderRadius: '12px',
                        fontSize: '32px',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                        border: `2px solid ${theme.accent}`,
                        textAlign: 'center',
                        boxShadow: '0 0 30px rgba(100, 181, 246, 0.3)',
                        zIndex: 2000,
                        pointerEvents: 'none'
                    }}>
                        {countdownText}
                    </div>
                )}
                
                {/* Gesture hints overlay for mobile - hide during countdown */}
                {showGestureHints && isMobile && !isThumbnail && !showCountdown && (
                    <div
                        onClick={() => setShowGestureHints(false)}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: theme.bgOverlay,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '28px',
                            zIndex: 1500,
                            color: theme.textPrimary,
                            fontFamily: 'system-ui, sans-serif',
                            fontSize: '16px',
                        }}
                    >
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', marginBottom: '4px' }}>&#9757; Drag</div>
                            <div style={{ color: theme.textTertiary }}>Rotate sphere</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', marginBottom: '4px' }}>&#128076; Pinch</div>
                            <div style={{ color: theme.textTertiary }}>Zoom in / out</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', marginBottom: '4px' }}>&#128073; Tap</div>
                            <div style={{ color: theme.textTertiary }}>Select point</div>
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textTertiary, marginTop: '8px' }}>
                            Tap to dismiss
                        </div>
                    </div>
                )}

                {/* ACTUAL 3D SPHERE VIEWER - WebGL container ALWAYS FILLS AVAILABLE SPACE */}
                <div
                    id="training-movie-3d-container"
                    onMouseMove={!isMobile ? handleCanvasMouseMove : undefined}
                    onMouseLeave={!isMobile ? handleCanvasMouseLeave : undefined}
                    onClick={isMobile ? handleCanvasTap : undefined}
                    style={{
                        width: '100%',
                        height: '100%',
                        minHeight: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                    }}
                >
                    <div
                        ref={containerRef}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'transparent',
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                        }}
                    />
                {trainingData ? (
                    <TrainingMovieSphere
                        onLoadingProgress={(loaded, total) => setLoadingProgress({ loaded, total })}
                        pointSize={pointSize}
                        pointAlpha={pointAlpha}
                        trailLength={trailLength}
                        trainingData={trainingData}
                        sessionProjections={sessionProjections}
                        lossData={lossData}
                        forceCanvas2D={mode === 'thumbnail'}
                        onPointInspected={(pointInfo: any) => {
                            setSelectedPointInfo(pointInfo);
                            // Add to selected points list (or toggle if already selected)
                            setSelectedPoints(prev => {
                                const exists = prev.find(p => p.recordId === pointInfo.recordId);
                                if (exists) {
                                    // Remove if already selected
                                    return prev.filter(p => p.recordId !== pointInfo.recordId);
                                } else {
                                    // Add to selection
                                    return [...prev, pointInfo];
                                }
                            });
                            // Auto-show data inspector when points are selected
                            setShowDataInspector(true);
                        }}
                        rotationEnabled={rotationEnabled}
                        containerRef={containerRef}
                        onReady={(sphere: any) => {
                            // Training movie sphere ready
                            setSphereRef(sphere);
                            sphereRefForCountdown.current = sphere; // Store sphere in ref

                            // Listen for touch taps on the 3D canvas to toggle playback controls
                            // (touch preventDefault in Three.js blocks React onClick from firing)
                            if (sphere?.event_listeners) {
                                register_event_listener(sphere, 'backgroundTap', () => {
                                    playbackRef.current?.toggle();
                                });
                            }

                            // Canvas2D fallback handles its own playback - skip countdown/pause
                            if (sphere._canvas2dFallback) {
                                setIsPlaying(true);
                                return;
                            }

                            // Start with paused state for countdown
                            setIsPlaying(false);

                            // Pause the sphere initially
                            if (sphere) {
                                pause_training_movie(sphere);
                            }


                            // Start countdown after a brief delay (skip for thumbnail mode)
                            if (mode === 'thumbnail') {
                                // Thumbnail: immediately start rotation, no countdown
                                setTimeout(() => {
                                    if (sphere) {
                                        resume_training_movie(sphere);
                                        setIsPlaying(true);
                                    }
                                }, 100);
                            } else {
                                setTimeout(() => {
                                    try {
                                        if (typeof startCountdown === 'function') {
                                            startCountdown();
                                        } else {
                                            console.error('startCountdown is not a function:', typeof startCountdown);
                                        }
                                    } catch (error) {
                                        console.error('Error calling startCountdown:', error);
                                    }
                                }, 1000);
                            }
                        }}
                        onFrameUpdate={(info) => {
                            // DEBUG: Log frameInfo for troubleshooting focus dropdown
                            // console.log('🎯 Frame update received:', {
                            //     current: info.current,
                            //     total: info.total,
                            //     visible: info.visible,
                            //     epoch: info.epoch,
                            //     type: typeof info.visible
                            // });
                            
                            // Detect restart (frame went back to 1 from higher number)
                            const prevFrame = frameInfo?.current || 0;
                            if (prevFrame > 1 && info.current === 1 && typeof startCountdown === 'function') {
                                setTimeout(() => {
                                    try {
                                        startCountdown();
                                    } catch (error) {
                                        console.error('Error calling startCountdown:', error);
                                    }
                                }, 500);
                            }
                            setFrameInfo(info);
                            // Update frame input to current frame for convenience
                            if (frameInput === '') {
                                setFrameInput(info.current.toString());
                            }
                        }}
                    />
                ) : (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        color: theme.textMuted,
                        background: theme.bgLoading
                    }}>
                        Initializing 3D sphere...
                    </div>
                )}

                {/* Close/exit fullscreen button - visible only in fullscreen mode (default maximize, no onMaximize callback) */}
                {isFullscreen && !onMaximize && (
                    <button
                        onClick={() => { if (document.exitFullscreen) document.exitFullscreen(); }}
                        style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            width: '32px',
                            height: '32px',
                            background: 'rgba(0, 0, 0, 0.5)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '6px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 100,
                            padding: 0,
                            transition: 'background 0.2s, color 0.2s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)'; e.currentTarget.style.color = 'rgba(255, 255, 255, 1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.5)'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'; }}
                        title="Exit fullscreen"
                    >
                        {/* Compress/minimize icon (arrows pointing inward) */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="4 14 10 14 10 20" />
                            <polyline points="20 10 14 10 14 4" />
                            <line x1="10" y1="14" x2="3" y2="21" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                        </svg>
                    </button>
                )}

                {/* Maximize button overlay - visible only in thumbnail mode */}
                {isThumbnail && (
                    <button
                        onClick={handleMaximize}
                        style={{
                            position: 'absolute',
                            bottom: '10px',
                            right: '10px',
                            width: '32px',
                            height: '32px',
                            background: 'rgba(0, 0, 0, 0.5)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '6px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 100,
                            padding: 0,
                            transition: 'background 0.2s, color 0.2s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)'; e.currentTarget.style.color = 'rgba(255, 255, 255, 1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.5)'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'; }}
                        title="Maximize"
                    >
                        {/* Expand/maximize icon (arrows pointing outward) */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 3 21 3 21 9" />
                            <polyline points="9 21 3 21 3 15" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                    </button>
                )}

                {/* Load More Points button */}
                {!isThumbnail && totalPointCount !== null && loadedPointCount < totalPointCount && (
                    <div style={{
                        position: 'absolute',
                        bottom: '60px',
                        left: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: (theme.bgSurface || 'rgba(0,0,0,0.7)') + 'dd',
                        backdropFilter: 'blur(8px)',
                        border: `1px solid ${theme.borderPrimary || 'rgba(255,255,255,0.15)'}`,
                        borderRadius: '6px',
                        padding: '6px 12px',
                        zIndex: 50,
                    }}>
                        <span style={{ fontSize: '11px', color: theme.textSecondary || '#aaa' }}>
                            {loadedPointCount.toLocaleString()} / {totalPointCount.toLocaleString()} points
                        </span>
                        <button
                            onClick={handleLoadMore}
                            disabled={isLoadingMore}
                            style={{
                                background: '#3b82f6',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                padding: '4px 10px',
                                fontSize: '11px',
                                cursor: isLoadingMore ? 'wait' : 'pointer',
                                opacity: isLoadingMore ? 0.6 : 1,
                            }}
                        >
                            {isLoadingMore ? 'Loading...' : 'Load 1,000 more'}
                        </button>
                    </div>
                )}

                {/* Playback Overlay - reusable PlaybackController component */}
                {frameInfo && frameInfo.total > 0 && !isThumbnail && !(isMobile && showMobilePanel) && (
                    <PlaybackController
                        ref={playbackRef}
                        callbacks={{
                            onPlay: () => { if (sphereRef) { if (sphereRef._canvas2dFallback) { sphereRef.resume(); } else { resume_training_movie(sphereRef); } setIsPlaying(true); } },
                            onPause: () => { if (sphereRef) { if (sphereRef._canvas2dFallback) { sphereRef.pause(); } else { pause_training_movie(sphereRef); } setIsPlaying(false); } },
                            onStepForward: () => { handleStepForward(); },
                            onStepBackward: () => { handleStepBackward(); },
                            onGotoFirst: () => { if (sphereRef) { goto_training_movie_frame(sphereRef, 1); setIsPlaying(false); setFrameInput('1'); } },
                            onGotoLast: () => { if (sphereRef && frameInfo) { goto_training_movie_frame(sphereRef, frameInfo.total); setIsPlaying(false); setFrameInput(frameInfo.total.toString()); } },
                            onGotoFrame: (frame: number) => { if (sphereRef) { goto_training_movie_frame(sphereRef, frame); setIsPlaying(false); setFrameInput(frame.toString()); } },
                            onSpeedChange: (speed: number) => { setPlaybackSpeed(speed); },
                        }}
                        currentFrame={frameInfo.current}
                        totalFrames={frameInfo.total}
                        isPlaying={isPlaying}
                        playbackSpeed={playbackSpeed}
                        isMobile={isMobile}
                        extraControls={<>
                            {/* Rotation play/pause */}
                            <button
                                onClick={() => setRotationEnabled(!rotationEnabled)}
                                style={{
                                    background: 'none',
                                    border: `1px solid ${theme.borderSecondary}`,
                                    borderRadius: '4px',
                                    color: rotationEnabled ? theme.textPrimary : theme.textTertiary,
                                    cursor: 'pointer',
                                    padding: '2px 6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    marginLeft: '4px',
                                    flexShrink: 0,
                                }}
                                title={rotationEnabled ? 'Pause Rotation' : 'Resume Rotation'}
                            >
                                {rotationEnabled ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                                ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
                                )}
                            </button>
                            {/* Show/hide training toggle */}
                            <button
                                onClick={handlePlayPause}
                                style={{
                                    background: 'none',
                                    border: `1px solid ${theme.borderSecondary}`,
                                    borderRadius: '4px',
                                    color: theme.textTertiary,
                                    cursor: 'pointer',
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    fontFamily: 'system-ui, -apple-system, sans-serif',
                                    whiteSpace: 'nowrap',
                                    marginLeft: '4px',
                                    flexShrink: 0,
                                }}
                                title={isPlaying ? 'Hide training animation' : 'Show training animation'}
                            >
                                {isPlaying ? '[hide training]' : '[show training]'}
                            </button>
                        </>}
                    />
                )}

                </div>
            </div>

            {/* Floating Data Inspector */}
            {showDataInspector && selectedPoints.length > 0 && !isThumbnail && (
                <>
                {/* Tap-outside to dismiss overlay (mobile only) */}
                {isMobile && (
                    <div
                        onClick={() => setShowDataInspector(false)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: theme.bgOverlay,
                            zIndex: 19999,
                        }}
                    />
                )}
                <div
                    style={{
                        position: 'fixed',
                        ...(isMobile ? {
                            left: '8px',
                            right: '8px',
                            top: '60px',
                            maxHeight: '60vh',
                        } : {
                            left: `${inspectorPosition.x}px`,
                            top: `${inspectorPosition.y}px`,
                            minWidth: '400px',
                            maxWidth: '800px',
                            maxHeight: '80vh',
                        }),
                        background: theme.inspectorBg,
                        border: '2px solid #4c4',
                        borderRadius: '8px',
                        padding: '12px',
                        zIndex: 20000,
                        boxShadow: theme.shadowMedium,
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: isDraggingInspector ? 'grabbing' : 'default'
                    }}
                >
                    {/* Header with drag handle */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '8px',
                            paddingBottom: '8px',
                            borderBottom: `1px solid ${theme.borderSecondary}`,
                            cursor: 'grab',
                            userSelect: 'none'
                        }}
                        onMouseDown={(e) => {
                            setIsDraggingInspector(true);
                            setDragOffset({
                                x: e.clientX - inspectorPosition.x,
                                y: e.clientY - inspectorPosition.y
                            });
                        }}
                    >
                        <div style={{ color: '#4c4', fontWeight: 'bold', fontSize: '16px' }}>
                            Data Inspector ({selectedPoints.length} point{selectedPoints.length !== 1 ? 's' : ''})
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <label style={{ fontSize: '11px', color: theme.textTertiary, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={hideNulls}
                                    onChange={(e) => setHideNulls(e.target.checked)}
                                />
                                Hide nulls
                            </label>
                            {selectedPoints.length > 1 && (
                                <label style={{ fontSize: '11px', color: theme.textTertiary, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={showOnlyDifferences}
                                        onChange={(e) => setShowOnlyDifferences(e.target.checked)}
                                    />
                                    Differences only
                                </label>
                            )}
                            <button
                                onClick={() => setSelectedPoints([])}
                                style={{
                                    background: '#c44',
                                    border: 'none',
                                    color: 'white',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                                title="Clear all selected points"
                            >
                                Clear
                            </button>
                            <button
                                onClick={() => setShowDataInspector(false)}
                                style={{
                                    background: theme.textDisabled,
                                    border: 'none',
                                    color: 'white',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {/* Search field */}
                    {(() => {
                        // Compute total field count for display
                        const allFieldsSet = new Set<string>();
                        selectedPoints.forEach(point => {
                            if (point.data) Object.keys(point.data).forEach(f => allFieldsSet.add(f));
                        });
                        const totalFields = allFieldsSet.size;

                        return (
                            <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    placeholder={`Search ${totalFields} fields...`}
                                    value={inspectorFieldSearch}
                                    onChange={(e) => setInspectorFieldSearch(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '6px 10px',
                                        background: theme.bgLoading,
                                        border: `1px solid ${theme.borderSecondary}`,
                                        borderRadius: '4px',
                                        color: theme.textSecondary,
                                        fontSize: '12px',
                                        outline: 'none'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#4c4'}
                                    onBlur={(e) => e.target.style.borderColor = theme.borderSecondary}
                                />
                                {inspectorFieldSearch && (
                                    <button
                                        onClick={() => setInspectorFieldSearch('')}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: theme.textTertiary,
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            padding: '4px'
                                        }}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        );
                    })()}

                    {/* Data table */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '12px',
                            fontFamily: 'monospace'
                        }}>
                            <thead style={{ position: 'sticky', top: 0, background: theme.bgTertiary, zIndex: 1 }}>
                                <tr>
                                    <th style={{
                                        padding: '6px 8px',
                                        textAlign: 'left',
                                        borderBottom: `2px solid ${theme.borderSecondary}`,
                                        color: '#4cf',
                                        fontWeight: 'bold'
                                    }}>Field</th>
                                    {selectedPoints.map((point, idx) => (
                                        <th key={point.recordId} style={{
                                            padding: '6px 8px',
                                            textAlign: 'left',
                                            borderBottom: `3px solid ${point.color || '#ff4'}`,
                                            borderLeft: `1px solid ${theme.borderSecondary}`,
                                            fontWeight: 'bold',
                                            minWidth: '120px',
                                            position: 'relative'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{
                                                    width: '10px',
                                                    height: '10px',
                                                    borderRadius: '50%',
                                                    background: point.color || '#ff4',
                                                    flexShrink: 0
                                                }} />
                                                <span style={{ color: theme.textSecondary }}>Point {idx + 1}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedPoints(prev => prev.filter(p => p.recordId !== point.recordId));
                                                    }}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: theme.textTertiary,
                                                        cursor: 'pointer',
                                                        fontSize: '14px',
                                                        padding: '0 2px',
                                                        marginLeft: 'auto',
                                                        lineHeight: 1
                                                    }}
                                                    title="Remove this point"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '10px', color: theme.textTertiary, marginTop: '2px' }}>Row {point.rowOffset} · Cluster {point.clusterId}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    // Get all unique field names from all selected points
                                    const allFields = new Set<string>();
                                    selectedPoints.forEach(point => {
                                        if (point.data) {
                                            Object.keys(point.data).forEach(field => allFields.add(field));
                                        }
                                    });

                                    const totalFieldCount = allFields.size;

                                    // Build MI ranking lookup map
                                    const miRankingMap = new Map<string, number>();
                                    if (columnMiRankings) {
                                        columnMiRankings.forEach((item, idx) => {
                                            miRankingMap.set(item.column, idx);
                                        });
                                    }

                                    // Internal/special fields that should be moved to the bottom
                                    const internalFieldPatterns = [
                                        'cumulative_distance', 'epoch_distance',
                                        'net_displacement_', 'split', 'label',
                                        '__featrix', '_row_id', '_row_offset'
                                    ];
                                    const isInternalField = (field: string) =>
                                        internalFieldPatterns.some(pattern => field.toLowerCase().includes(pattern.toLowerCase()));

                                    // Filter by search term if provided
                                    const searchLower = inspectorFieldSearch.toLowerCase();
                                    const sortedFields = Array.from(allFields)
                                        .filter(field => !searchLower || field.toLowerCase().includes(searchLower))
                                        .sort((a, b) => {
                                            // Internal fields go to the bottom
                                            const aInternal = isInternalField(a);
                                            const bInternal = isInternalField(b);
                                            if (aInternal && !bInternal) return 1;
                                            if (!aInternal && bInternal) return -1;

                                            // Sort by MI ranking (most predictable first), then alphabetically
                                            const rankA = miRankingMap.get(a) ?? Infinity;
                                            const rankB = miRankingMap.get(b) ?? Infinity;
                                            if (rankA !== rankB) return rankA - rankB;
                                            return a.localeCompare(b);
                                        });

                                    // Show field count at start if there are many fields
                                    const fieldCountInfo = searchLower
                                        ? `Showing ${sortedFields.length} of ${totalFieldCount} fields`
                                        : `${totalFieldCount} fields`;

                                    // Helper to normalize values for comparison
                                    const normalizeValue = (val: any) => {
                                        if (val === null || val === undefined || val === '') return null;
                                        return JSON.stringify(val);
                                    };

                                    return sortedFields.map(field => {
                                        // Get all values for this field
                                        const values = selectedPoints.map(point => point.data?.[field]);
                                        const normalizedValues = values.map(normalizeValue);

                                        // Check if all values are null
                                        const allNull = normalizedValues.every(v => v === null);

                                        // Check if all values are the same
                                        const allSame = selectedPoints.length > 1 &&
                                            normalizedValues.every(v => v === normalizedValues[0]);

                                        // Skip if hiding nulls and all values are null
                                        if (hideNulls && allNull) return null;

                                        // Skip if showing only differences and all values are the same
                                        if (showOnlyDifferences && allSame) return null;

                                        // Determine if this row has differences
                                        const hasDifferences = !allSame && selectedPoints.length > 1;

                                        // Get MI ranking for this field
                                        const miRank = miRankingMap.get(field);
                                        const miInfo = columnMiRankings?.find(r => r.column === field);
                                        const fieldIsInternal = isInternalField(field);

                                        return (
                                            <tr key={field} style={{
                                                borderBottom: `1px solid ${theme.borderSecondary}`,
                                                background: hasDifferences ? 'rgba(255, 200, 50, 0.05)' : fieldIsInternal ? 'rgba(100, 100, 100, 0.1)' : 'transparent'
                                            }}>
                                                <td style={{
                                                    padding: '6px 8px',
                                                    color: fieldIsInternal ? theme.textMuted : hasDifferences ? '#fc8' : theme.textTertiary,
                                                    fontWeight: 'bold',
                                                    verticalAlign: 'top'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {fieldIsInternal && (
                                                            <span style={{
                                                                fontSize: '8px',
                                                                background: theme.borderSecondary,
                                                                color: theme.textTertiary,
                                                                padding: '1px 3px',
                                                                borderRadius: '2px',
                                                                fontWeight: 'normal'
                                                            }} title="Internal system field">
                                                                sys
                                                            </span>
                                                        )}
                                                        {miRank !== undefined && miRank < 20 && (
                                                            <span style={{
                                                                fontSize: '9px',
                                                                background: miRank < 5 ? '#4c4' : miRank < 10 ? '#884' : '#555',
                                                                color: '#fff',
                                                                padding: '1px 4px',
                                                                borderRadius: '3px',
                                                                fontWeight: 'normal'
                                                            }} title={miInfo ? `MI Score: ${miInfo.mi_score.toFixed(1)}` : ''}>
                                                                #{miRank + 1}
                                                            </span>
                                                        )}
                                                        <span style={{ opacity: fieldIsInternal ? 0.6 : 1 }}>{field}</span>
                                                    </div>
                                                </td>
                                                {selectedPoints.map((point, idx) => {
                                                    const value = point.data?.[field];
                                                    const displayValue = value === null || value === undefined ? 'null' : String(value);
                                                    const isNull = value === null || value === undefined;

                                                    // Check if this value differs from others
                                                    const thisNormalized = normalizeValue(value);
                                                    const isDifferent = hasDifferences &&
                                                        normalizedValues.some((v, i) => i !== idx && v !== thisNormalized);

                                                    return (
                                                        <td key={point.recordId} style={{
                                                            padding: '6px 8px',
                                                            color: isNull ? theme.textMuted : (isDifferent ? '#fff' : theme.textSecondary),
                                                            borderLeft: `1px solid ${theme.borderSecondary}`,
                                                            verticalAlign: 'top',
                                                            wordBreak: 'break-word',
                                                            background: isDifferent ? `${point.color || '#ff4'}22` : 'transparent'
                                                        }}>
                                                            {displayValue}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    }).filter(Boolean);
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
                </>
            )}

            {/* Cluster Analysis Modal */}
            {showClusterAnalysis && sphereRef && (
                <>
                    {/* Scrim */}
                    <div
                        onClick={() => setShowClusterAnalysis(false)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: theme.bgOverlay,
                            zIndex: 25000,
                        }}
                    />
                    {/* Modal Dialog */}
                    <div style={{
                        position: 'fixed',
                        top: '5%',
                        left: '5%',
                        right: '5%',
                        bottom: '5%',
                        background: theme.bgTertiary,
                        border: '2px solid #4c78a8',
                        borderRadius: '12px',
                        zIndex: 25001,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            borderBottom: `1px solid ${theme.borderSecondary}`,
                            background: theme.bgSurface,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '20px' }}>📊</span>
                                <span style={{ color: '#4c78a8', fontWeight: 'bold', fontSize: '18px' }}>
                                    Cluster Analysis
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: theme.textTertiary, fontSize: '12px' }}>Clusters:</span>
                                    <select
                                        value={analysisClusterCount || ''}
                                        onChange={(e) => {
                                            const newClusterCount = e.target.value || null;
                                            setAnalysisClusterCount(newClusterCount);
                                            // Also update the sphere visualization to show this cluster count
                                            if (sphereRef && sphereRef.jsonData) {
                                                const clusterKey = newClusterCount || get_active_cluster_count_key(sphereRef)?.toString();
                                                if (clusterKey) {
                                                    change_cluster_count(sphereRef, sphereRef.jsonData, clusterKey);
                                                }
                                            }
                                        }}
                                        style={{
                                            padding: '6px 12px',
                                            background: theme.borderSecondary,
                                            border: `1px solid ${theme.borderSecondary}`,
                                            borderRadius: '4px',
                                            color: theme.textPrimary,
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <option value="">Auto ({get_active_cluster_count_key(sphereRef) || '?'})</option>
                                        {sphereRef.finalClusterResults && Object.keys(sphereRef.finalClusterResults)
                                            .sort((a, b) => parseInt(a) - parseInt(b))
                                            .map(k => (
                                                <option key={k} value={k}>{k} clusters</option>
                                            ))
                                        }
                                    </select>
                                </div>
                                <button
                                    onClick={() => setShowClusterAnalysis(false)}
                                style={{
                                    background: theme.textDisabled,
                                    border: 'none',
                                    color: 'white',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                    }}
                                >
                                    ✕ Close
                                </button>
                            </div>
                        </div>

                        {/* Tab Bar */}
                        <div style={{
                            display: 'flex',
                            gap: '0',
                            borderBottom: `1px solid ${theme.borderSecondary}`,
                            background: theme.bgPrimary,
                            padding: '0 20px',
                        }}>
                            {[
                                { id: 'signatures', label: '🎯 Cluster Signatures', desc: 'What defines each cluster' },
                                { id: 'fields', label: '📋 Field Analysis', desc: 'Which values belong to which clusters' },
                                { id: 'details', label: '📊 Raw Data', desc: 'Detailed breakdown' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setClusterAnalysisView(tab.id as any)}
                                    style={{
                                        padding: '12px 20px',
                                        background: clusterAnalysisView === tab.id ? theme.bgLoading : 'transparent',
                                        border: 'none',
                                        borderBottom: clusterAnalysisView === tab.id ? '2px solid #4c78a8' : '2px solid transparent',
                                        color: clusterAnalysisView === tab.id ? theme.textPrimary : theme.textTertiary,
                                        fontSize: '13px',
                                        fontWeight: clusterAnalysisView === tab.id ? 600 : 400,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                    title={tab.desc}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                            {(() => {
                                // Gather all points by cluster
                                const clusterData: Map<number, { points: any[], color: string }> = new Map();
                                const allFields = new Set<string>();
                                // Use selected cluster count, or fall back to active
                                const clusterKey = analysisClusterCount || get_active_cluster_count_key(sphereRef);

                                sphereRef.pointObjectsByRecordID?.forEach((mesh: any, recordId: string) => {
                                    const record = sphereRef.pointRecordsByID?.get(recordId);
                                    if (!record) return;

                                    let cluster = -1;
                                    if (clusterKey !== null && sphereRef.finalClusterResults?.[clusterKey]?.cluster_labels) {
                                        const rowOffset = record?.featrix_meta?.__featrix_row_offset;
                                        if (rowOffset !== undefined && rowOffset < sphereRef.finalClusterResults[clusterKey].cluster_labels.length) {
                                            cluster = sphereRef.finalClusterResults[clusterKey].cluster_labels[rowOffset];
                                        }
                                    }

                                    if (cluster >= 0) {
                                        if (!clusterData.has(cluster)) {
                                            const colorHex = mesh.material?.color?.getHexString?.() || 'ffffff';
                                            clusterData.set(cluster, { points: [], color: `#${colorHex}` });
                                        }

                                        // Add point data - use record.original which contains the source data
                                        const pointData = record.original || record.source_data || record;
                                        clusterData.get(cluster)!.points.push(pointData);

                                        // Collect all fields (exclude internal fields)
                                        if (pointData) {
                                            Object.keys(pointData).forEach(f => {
                                                // Skip internal/meta fields
                                                if (!f.startsWith('featrix_') &&
                                                    !f.startsWith('__featrix') &&
                                                    f !== 'id' &&
                                                    f !== 'coords' &&
                                                    f !== 'original') {
                                                    allFields.add(f);
                                                }
                                            });
                                        }
                                    }
                                });

                                const numClusters = clusterData.size;
                                const fieldList = Array.from(allFields).sort();
                                const kColorTable = ['#4C78A8', '#72B7B2', '#F58518', '#E45756', '#54A24B', '#B279A2', '#FF9DA6', '#9D755D', '#BAB0AC', '#79706E', '#D37295', '#8F6D31'];

                                if (numClusters === 0) {
                                    return <div style={{ color: theme.textTertiary, textAlign: 'center', padding: '40px' }}>No cluster data available</div>;
                                }

                                // Compute value distributions for each field in each cluster
                                // Helper to parse array-like strings: "['a', 'b']" -> ['a', 'b']
                                const parseArrayString = (val: any): string[] | null => {
                                    if (Array.isArray(val)) {
                                        // Already an array - flatten to strings
                                        return val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v));
                                    }
                                    if (typeof val === 'string') {
                                        // Try to parse array-like strings: ['a', 'b'] or ["a", "b"]
                                        const trimmed = val.trim();
                                        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                                            try {
                                                const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
                                                if (Array.isArray(parsed)) {
                                                    return parsed.map(v => String(v));
                                                }
                                            } catch {
                                                // Not valid JSON, try simple split
                                                const inner = trimmed.slice(1, -1);
                                                if (inner.includes(',')) {
                                                    return inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                                                }
                                            }
                                        }
                                    }
                                    return null; // Not an array
                                };

                                // Helper to stringify single values
                                const stringify = (val: any): string => {
                                    if (val === null || val === undefined) return 'null';
                                    if (typeof val === 'object' && !Array.isArray(val)) {
                                        const keys = Object.keys(val);
                                        if (keys.length === 0) return '{}';
                                        return `{${keys[0]}: ...}`;
                                    }
                                    return String(val);
                                };

                                // Compute distribution - explode arrays into individual items
                                const computeDistribution = (points: any[], field: string) => {
                                    const valueCounts: Map<string, number> = new Map();
                                    let nullCount = 0;
                                    let isArrayField = false;

                                    points.forEach(p => {
                                        const val = p?.[field];
                                        if (val === null || val === undefined) {
                                            nullCount++;
                                            return;
                                        }

                                        // Try to parse as array
                                        const arrayItems = parseArrayString(val);
                                        if (arrayItems && arrayItems.length > 0) {
                                            isArrayField = true;
                                            // Count each item in the array separately
                                            arrayItems.forEach(item => {
                                                const trimmed = item.trim();
                                                if (trimmed && trimmed !== 'null' && trimmed !== '') {
                                                    valueCounts.set(trimmed, (valueCounts.get(trimmed) || 0) + 1);
                                                }
                                            });
                                        } else {
                                            // Single value
                                            const strVal = stringify(val);
                                            if (strVal !== 'null' && strVal !== '[]') {
                                                valueCounts.set(strVal, (valueCounts.get(strVal) || 0) + 1);
                                            } else {
                                                nullCount++;
                                            }
                                        }
                                    });
                                    return { valueCounts, nullCount, total: points.length, isArrayField };
                                };

                                // Compute overlap between two distributions (Jaccard similarity on value sets)
                                const computeOverlap = (dist1: ReturnType<typeof computeDistribution>, dist2: ReturnType<typeof computeDistribution>) => {
                                    const set1 = new Set(dist1.valueCounts.keys());
                                    const set2 = new Set(dist2.valueCounts.keys());
                                    const intersection = new Set([...set1].filter(x => set2.has(x)));
                                    const union = new Set([...set1, ...set2]);
                                    if (union.size === 0) return 0;
                                    return intersection.size / union.size;
                                };

                                // Compute stats for each field
                                const fieldStats = fieldList.map(field => {
                                    const distributions: Map<number, ReturnType<typeof computeDistribution>> = new Map();
                                    clusterData.forEach((data, cluster) => {
                                        distributions.set(cluster, computeDistribution(data.points, field));
                                    });

                                    // Compute pairwise overlaps
                                    const clusters = Array.from(clusterData.keys()).sort((a, b) => a - b);
                                    let totalOverlap = 0;
                                    let pairCount = 0;
                                    for (let i = 0; i < clusters.length; i++) {
                                        for (let j = i + 1; j < clusters.length; j++) {
                                            const overlap = computeOverlap(distributions.get(clusters[i])!, distributions.get(clusters[j])!);
                                            totalOverlap += overlap;
                                            pairCount++;
                                        }
                                    }
                                    const avgOverlap = pairCount > 0 ? totalOverlap / pairCount : 0;

                                    // Compute variance in unique value counts (higher = more distinguishing)
                                    const uniqueCounts = clusters.map(c => distributions.get(c)!.valueCounts.size);
                                    const avgUnique = uniqueCounts.reduce((a, b) => a + b, 0) / uniqueCounts.length;
                                    const variance = uniqueCounts.reduce((sum, c) => sum + Math.pow(c - avgUnique, 2), 0) / uniqueCounts.length;

                                    return { field, distributions, avgOverlap, variance, clusters };
                                });

                                // Sort by distinguishing power (low overlap = distinguishing)
                                fieldStats.sort((a, b) => a.avgOverlap - b.avgOverlap);

                                const clusters = Array.from(clusterData.keys()).sort((a, b) => a - b);
                                const totalPoints = Array.from(clusterData.values()).reduce((sum, d) => sum + d.points.length, 0);

                                // Compute cluster signatures: values that are over-represented in each cluster
                                // A value is a "signature" if it appears much more in this cluster than overall
                                // Minimum count threshold: at least 3 occurrences AND >3% of total points
                                const minAbsoluteCount = 3;
                                const minPctThreshold = 0.03; // 3% of total
                                const minCountByPct = Math.ceil(totalPoints * minPctThreshold);
                                const minSignatureCount = Math.max(minAbsoluteCount, minCountByPct);

                                const computeClusterSignatures = () => {
                                    const signatures: Map<number, { field: string, value: string, clusterPct: number, overallPct: number, lift: number, isArrayField: boolean }[]> = new Map();

                                    clusters.forEach(cluster => {
                                        const clusterSignatures: { field: string, value: string, clusterPct: number, overallPct: number, lift: number, isArrayField: boolean }[] = [];
                                        const clusterPoints = clusterData.get(cluster)!.points;
                                        const clusterSize = clusterPoints.length;

                                        fieldStats.slice(0, 30).forEach(({ field, distributions }) => { // Top 30 distinguishing fields
                                            const clusterDist = distributions.get(cluster);
                                            if (!clusterDist) return;

                                            const isArrayField = clusterDist.isArrayField || false;

                                            // Get overall distribution
                                            const overallCounts: Map<string, number> = new Map();
                                            distributions.forEach(dist => {
                                                dist.valueCounts.forEach((count, value) => {
                                                    overallCounts.set(value, (overallCounts.get(value) || 0) + count);
                                                });
                                            });

                                            // Find values with high "lift" in this cluster
                                            clusterDist.valueCounts.forEach((count, value) => {
                                                const overallCount = overallCounts.get(value) || count;

                                                // Skip rare values - they appear too few times to be meaningful
                                                if (overallCount < minSignatureCount) return;

                                                const clusterPct = count / clusterSize;
                                                const overallPct = overallCount / totalPoints;
                                                const lift = overallPct > 0 ? clusterPct / overallPct : 1;

                                                // Include if: appears in >20% of cluster AND lift > 1.5
                                                if (clusterPct >= 0.2 && lift >= 1.5) {
                                                    clusterSignatures.push({ field, value, clusterPct, overallPct, lift, isArrayField });
                                                }
                                            });
                                        });

                                        // Sort by lift, take top signatures
                                        clusterSignatures.sort((a, b) => b.lift - a.lift);
                                        signatures.set(cluster, clusterSignatures.slice(0, 8));
                                    });

                                    return signatures;
                                };

                                const clusterSignatures = computeClusterSignatures();

                                // Compute field ownership: which cluster "owns" which values
                                const computeFieldOwnership = () => {
                                    return fieldStats.slice(0, 25).map(({ field, distributions, avgOverlap }) => {
                                        const valueOwners: { value: string, ownerCluster: number, pct: number, totalCount: number, otherClusters: { cluster: number, pct: number }[] }[] = [];

                                        // Check if this is an array field
                                        let isArrayField = false;
                                        distributions.forEach(dist => {
                                            if (dist.isArrayField) isArrayField = true;
                                        });

                                        // Get all unique values across all clusters and compute total count for each
                                        const allValues = new Map<string, number>(); // value -> total count across all clusters
                                        distributions.forEach(dist => {
                                            dist.valueCounts.forEach((count, value) => {
                                                allValues.set(value, (allValues.get(value) || 0) + count);
                                            });
                                        });

                                        // Calculate minimum count threshold: at least 3 occurrences AND >3% of total points
                                        const minAbsoluteCount = 3;
                                        const minPctThreshold = 0.03; // 3% of total
                                        const minCountByPct = Math.ceil(totalPoints * minPctThreshold);
                                        const minCount = Math.max(minAbsoluteCount, minCountByPct);

                                        // For each value, find which cluster has the highest % of it
                                        allValues.forEach((totalCount, value) => {
                                            // Filter out rare values - they appear too few times to be meaningful
                                            if (totalCount < minCount) return;

                                            let maxPct = 0;
                                            let ownerCluster = -1;
                                            const clusterPcts: { cluster: number, pct: number }[] = [];

                                            distributions.forEach((dist, cluster) => {
                                                const count = dist.valueCounts.get(value) || 0;
                                                const pct = count / dist.total;
                                                clusterPcts.push({ cluster, pct });
                                                if (pct > maxPct) {
                                                    maxPct = pct;
                                                    ownerCluster = cluster;
                                                }
                                            });

                                            // Only include if some cluster has >15% of this value
                                            if (maxPct >= 0.15) {
                                                valueOwners.push({
                                                    value,
                                                    ownerCluster,
                                                    pct: maxPct,
                                                    totalCount,
                                                    otherClusters: clusterPcts.filter(c => c.cluster !== ownerCluster && c.pct > 0.05).sort((a, b) => b.pct - a.pct)
                                                });
                                            }
                                        });

                                        // Sort by owner's percentage
                                        valueOwners.sort((a, b) => b.pct - a.pct);

                                        // Recalculate avgOverlap excluding rare values for more accurate DISTINGUISHING label
                                        // A field is only "distinguishing" if it has meaningful values that differ
                                        const meaningfulOverlap = valueOwners.length > 0 ? avgOverlap : 1; // No meaningful values = not distinguishing

                                        return { field, avgOverlap: meaningfulOverlap, isArrayField, valueOwners: valueOwners.slice(0, 6) };
                                    });
                                };

                                const fieldOwnership = computeFieldOwnership();

                                // ============ RENDER BASED ON VIEW ============

                                // Cluster summary header (shown in all views)
                                const ClusterSummary = () => (
                                    <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                        {clusters.map(cluster => {
                                            const data = clusterData.get(cluster)!;
                                            const color = kColorTable[cluster] || '#888';
                                            return (
                                                <div key={cluster} style={{
                                                    background: theme.bgSurface,
                                                    padding: '8px 14px',
                                                    borderRadius: '6px',
                                                    borderLeft: `3px solid ${color}`,
                                                    fontSize: '12px',
                                                }}>
                                                    <span style={{ color, fontWeight: 'bold' }}>C{cluster}</span>
                                                    <span style={{ color: theme.textTertiary, marginLeft: '8px' }}>{data.points.length} pts</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );

                                // Get column statistics from model card (MI, predictability) - for all views
                                const columnStats = modelCardData?.column_statistics || {};

                                // ============ SIGNATURES VIEW ============
                                if (clusterAnalysisView === 'signatures') {
                                    return (
                                        <div>
                                            <ClusterSummary />
                                            <div style={{ fontSize: '13px', color: theme.textTertiary, marginBottom: '16px' }}>
                                                Values that are <strong style={{ color: '#4f4' }}>over-represented</strong> in each cluster compared to the overall dataset.
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
                                                {clusters.map(cluster => {
                                                    const sigs = clusterSignatures.get(cluster) || [];
                                                    const color = kColorTable[cluster] || '#888';
                                                    return (
                                                        <div key={cluster} style={{
                                                            background: theme.bgSurface,
                                                            borderRadius: '8px',
                                                            border: `1px solid ${color}44`,
                                                            overflow: 'hidden',
                                                        }}>
                                                            <div style={{
                                                                background: `${color}22`,
                                                                padding: '12px 16px',
                                                                borderBottom: `1px solid ${color}44`,
                                                            }}>
                                                                <span style={{ color, fontWeight: 'bold', fontSize: '16px' }}>Cluster {cluster}</span>
                                                                <span style={{ color: theme.textTertiary, marginLeft: '12px', fontSize: '12px' }}>
                                                                    {clusterData.get(cluster)!.points.length} points
                                                                </span>
                                                            </div>
                                                            <div style={{ padding: '12px 16px' }}>
                                                                {sigs.length === 0 ? (
                                                                    <div style={{ color: theme.textMuted, fontStyle: 'italic', fontSize: '12px' }}>
                                                                        No strong distinguishing values found
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                        {sigs.map((sig, i) => {
                                                                            const sigFieldStats = columnStats[sig.field];
                                                                            const sigMI = sigFieldStats?.mutual_information_bits;
                                                                            return (
                                                                            <div key={i} style={{ fontSize: '12px' }}>
                                                                                <span style={{ color: '#4cf' }}>{sig.field}</span>
                                                                                {sigMI !== undefined && sigMI !== null && (
                                                                                    <span style={{
                                                                                        fontSize: '9px',
                                                                                        padding: '1px 4px',
                                                                                        borderRadius: '3px',
                                                                                        background: '#4448',
                                                                                        color: theme.textTertiary,
                                                                                        marginLeft: '4px',
                                                                                        fontFamily: 'monospace',
                                                                                    }}
                                                                                    title={`Mutual Information: ${sigMI.toFixed(3)} bits`}
                                                                                    >
                                                                                        MI:{sigMI.toFixed(2)}
                                                                                    </span>
                                                                                )}
                                                                                <span style={{ color: theme.textMuted }}>{sig.isArrayField ? ' contains ' : ' = '}</span>
                                                                                <span style={{ color: '#fff' }}>"{sig.value.length > 25 ? sig.value.slice(0, 25) + '...' : sig.value}"</span>
                                                                                {sig.isArrayField && <span style={{ color: theme.textMuted, fontSize: '10px', marginLeft: '4px' }}>(list)</span>}
                                                                                <div style={{ marginLeft: '12px', fontSize: '11px', color: theme.textTertiary }}>
                                                                                    <span style={{ color: '#4f4' }}>{(sig.clusterPct * 100).toFixed(0)}%</span> have this vs{' '}
                                                                                    <span>{(sig.overallPct * 100).toFixed(0)}%</span> overall{' '}
                                                                                    <span style={{ color: '#f84' }}>({sig.lift.toFixed(1)}x)</span>
                                                                                </div>
                                                                            </div>
                                                                        );})}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                }

                                // ============ FIELDS VIEW ============
                                if (clusterAnalysisView === 'fields') {
                                    return (
                                        <div>
                                            <ClusterSummary />
                                            <div style={{ fontSize: '13px', color: theme.textTertiary, marginBottom: '16px' }}>
                                                For each field, which <strong style={{ color: '#4cf' }}>values belong to which clusters</strong>.
                                                Fields sorted by distinctiveness (most distinguishing first).
                                                {Object.keys(columnStats).length > 0 && (
                                                    <span style={{ marginLeft: '8px', color: theme.textMuted }}>
                                                        MI = Mutual Information (how predictable from other columns)
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                {fieldOwnership.filter(f => f.valueOwners.length > 0).map(({ field, avgOverlap, isArrayField, valueOwners }) => {
                                                    const overlapColor = avgOverlap < 0.2 ? '#4f4' : avgOverlap < 0.5 ? '#ff4' : '#f44';
                                                    const fieldStats = columnStats[field];
                                                    const mi = fieldStats?.mutual_information_bits;
                                                    const predictability = fieldStats?.predictability_pct;
                                                    return (
                                                        <div key={field} style={{
                                                            background: theme.bgSurface,
                                                            borderRadius: '6px',
                                                            padding: '12px 16px',
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                                                <span style={{ color: '#4cf', fontWeight: 'bold', fontSize: '13px' }}>{field}</span>
                                                                {mi !== undefined && mi !== null && (
                                                                    <span style={{
                                                                        fontSize: '9px',
                                                                        padding: '2px 6px',
                                                                        borderRadius: '4px',
                                                                        background: mi > 0.5 ? '#9c27b022' : '#4448',
                                                                        color: mi > 0.5 ? '#ce93d8' : theme.textTertiary,
                                                                        fontFamily: 'monospace',
                                                                    }}
                                                                    title={`Mutual Information: ${mi.toFixed(3)} bits${predictability !== undefined ? ` (${predictability.toFixed(1)}% predictable)` : ''}`}
                                                                    >
                                                                        MI: {mi.toFixed(2)}
                                                                    </span>
                                                                )}
                                                                {isArrayField && (
                                                                    <span style={{
                                                                        fontSize: '9px',
                                                                        padding: '2px 5px',
                                                                        borderRadius: '4px',
                                                                        background: '#4448',
                                                                        color: theme.textTertiary,
                                                                    }}>
                                                                        list membership
                                                                    </span>
                                                                )}
                                                                <span style={{
                                                                    fontSize: '10px',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '8px',
                                                                    background: `${overlapColor}22`,
                                                                    color: overlapColor,
                                                                }}>
                                                                    {avgOverlap < 0.2 ? 'DISTINGUISHING' : avgOverlap < 0.5 ? 'MODERATE' : 'COMMON'}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                                {valueOwners.map((vo, i) => {
                                                                    const ownerColor = kColorTable[vo.ownerCluster] || '#888';
                                                                    return (
                                                                        <div key={i} style={{
                                                                            background: theme.bgLoading,
                                                                            padding: '6px 10px',
                                                                            borderRadius: '4px',
                                                                            fontSize: '11px',
                                                                            borderLeft: `3px solid ${ownerColor}`,
                                                                        }}>
                                                                            <span style={{ color: theme.textSecondary }}>"{vo.value.length > 20 ? vo.value.slice(0, 20) + '...' : vo.value}"</span>
                                                                            <span style={{ color: ownerColor, marginLeft: '8px', fontWeight: 'bold' }}>
                                                                                C{vo.ownerCluster} ({(vo.pct * 100).toFixed(0)}%)
                                                                            </span>
                                                                            {vo.otherClusters.slice(0, 2).map(oc => (
                                                                                <span key={oc.cluster} style={{ color: theme.textMuted, marginLeft: '4px' }}>
                                                                                    C{oc.cluster}:{(oc.pct * 100).toFixed(0)}%
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                }

                                // ============ DETAILS VIEW (original) ============
                                return (
                                    <div>
                                        {/* Cluster summary */}
                                        <div style={{ marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                            {clusters.map(cluster => {
                                                const data = clusterData.get(cluster)!;
                                                const color = kColorTable[cluster] || '#888';
                                                return (
                                                    <div key={cluster} style={{
                                                        background: theme.bgSurface,
                                                        padding: '12px 16px',
                                                        borderRadius: '8px',
                                                        borderLeft: `4px solid ${color}`,
                                                    }}>
                                                        <div style={{ color, fontWeight: 'bold', fontSize: '14px' }}>Cluster {cluster}</div>
                                                        <div style={{ color: theme.textTertiary, fontSize: '12px' }}>{data.points.length} points</div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Field analysis table */}
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{
                                                width: '100%',
                                                borderCollapse: 'collapse',
                                                fontSize: '12px',
                                                fontFamily: 'monospace'
                                            }}>
                                                <thead style={{ position: 'sticky', top: 0, background: theme.bgTertiary, zIndex: 1 }}>
                                                    <tr>
                                                        <th style={{
                                                            padding: '10px',
                                                            textAlign: 'left',
                                                            borderBottom: `2px solid ${theme.borderSecondary}`,
                                                            color: '#4cf',
                                                            fontWeight: 'bold',
                                                            minWidth: '150px'
                                                        }}>
                                                            Field
                                                        </th>
                                                        <th style={{
                                                            padding: '10px',
                                                            textAlign: 'center',
                                                            borderBottom: `2px solid ${theme.borderSecondary}`,
                                                            color: '#f84',
                                                            fontWeight: 'bold',
                                                            width: '80px'
                                                        }} title="Average Jaccard similarity across clusters (lower = more distinguishing)">
                                                            Overlap
                                                        </th>
                                                        {clusters.map(cluster => {
                                                            const color = kColorTable[cluster] || '#888';
                                                            return (
                                                                <th key={cluster} style={{
                                                                    padding: '10px',
                                                                    textAlign: 'left',
                                                                    borderBottom: `3px solid ${color}`,
                                                                    color: theme.textSecondary,
                                                                    fontWeight: 'bold',
                                                                    minWidth: '200px'
                                                                }}>
                                                                    C{cluster} Top Values
                                                                </th>
                                                            );
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fieldStats.map(({ field, distributions, avgOverlap }) => {
                                                        const overlapColor = avgOverlap < 0.2 ? '#4f4' : avgOverlap < 0.5 ? '#ff4' : '#f44';
                                                        const overlapLabel = avgOverlap < 0.2 ? 'LOW' : avgOverlap < 0.5 ? 'MED' : 'HIGH';

                                                        return (
                                                            <tr key={field} style={{ borderBottom: `1px solid ${theme.borderSecondary}` }}>
                                                                <td style={{
                                                                    padding: '8px 10px',
                                                                    color: avgOverlap < 0.3 ? '#4cf' : theme.textTertiary,
                                                                    fontWeight: avgOverlap < 0.3 ? 'bold' : 'normal',
                                                                    verticalAlign: 'top'
                                                                }}>
                                                                    {field}
                                                                </td>
                                                                <td style={{
                                                                    padding: '8px 10px',
                                                                    textAlign: 'center',
                                                                    verticalAlign: 'top'
                                                                }}>
                                                                    <div style={{
                                                                        display: 'inline-block',
                                                                        padding: '2px 8px',
                                                                        borderRadius: '10px',
                                                                        background: overlapColor + '33',
                                                                        color: overlapColor,
                                                                        fontSize: '10px',
                                                                        fontWeight: 'bold'
                                                                    }}>
                                                                        {overlapLabel}
                                                                    </div>
                                                                    <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>
                                                                        {(avgOverlap * 100).toFixed(0)}%
                                                                    </div>
                                                                </td>
                                                                {clusters.map(cluster => {
                                                                    const dist = distributions.get(cluster)!;
                                                                    const topValues = Array.from(dist.valueCounts.entries())
                                                                        .sort((a, b) => b[1] - a[1])
                                                                        .slice(0, 3);
                                                                    const uniqueCount = dist.valueCounts.size;

                                                                    return (
                                                                        <td key={cluster} style={{
                                                                            padding: '8px 10px',
                                                                            color: theme.textSecondary,
                                                                            verticalAlign: 'top',
                                                                            borderLeft: `1px solid ${theme.borderSecondary}`,
                                                                            fontSize: '11px'
                                                                        }}>
                                                                            {topValues.length > 0 ? (
                                                                                <>
                                                                                    {topValues.map(([val, count], i) => (
                                                                                        <div key={i} style={{ marginBottom: '2px' }}>
                                                                                            <span style={{ color: '#fff' }}>{val.length > 30 ? val.substring(0, 30) + '...' : val}</span>
                                                                                            <span style={{ color: theme.textMuted, marginLeft: '6px' }}>({count}/{dist.total})</span>
                                                                                        </div>
                                                                                    ))}
                                                                                    {uniqueCount > 3 && (
                                                                                        <div style={{ color: theme.textMuted, fontStyle: 'italic' }}>
                                                                                            +{uniqueCount - 3} more unique values
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            ) : (
                                                                                <span style={{ color: theme.textDisabled }}>all null</span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </>
            )}

            {/* Model Card Modal */}
            {showModelCard && (
                <>
                    {/* Scrim */}
                    <div
                        onClick={() => setShowModelCard(false)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: theme.bgOverlay,
                            zIndex: 10000,
                        }}
                    />
                    {/* Modal Dialog */}
                    <div style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: theme.bgPrimary,
                        border: `1px solid ${theme.borderPrimary}`,
                        borderRadius: '8px',
                        zIndex: 10001,
                        width: 'min(90vw, 800px)',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            borderBottom: `1px solid ${theme.borderPrimary}`,
                            background: theme.bgInset,
                        }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>Model Card</span>
                            <button
                                onClick={() => setShowModelCard(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: theme.textSecondary,
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    padding: '0 4px',
                                    lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        </div>
                        {/* Modal Body */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '20px',
                        }}>
                            {modelCardLoading && (
                                <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>
                                    <div style={{
                                        width: '30px',
                                        height: '30px',
                                        border: `3px solid ${theme.spinnerTrack}`,
                                        borderTop: `3px solid ${theme.spinnerHead}`,
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite',
                                        margin: '0 auto 16px'
                                    }} />
                                    Loading model card...
                                </div>
                            )}
                            {modelCardError && (
                                <div style={{ color: theme.error, textAlign: 'center', padding: '40px' }}>
                                    <div style={{ marginBottom: '12px' }}>Failed to load model card</div>
                                    <div style={{ fontSize: '12px', color: theme.textTertiary }}>{modelCardError}</div>
                                </div>
                            )}
                            {!modelCardLoading && !modelCardError && modelCardData && (
                                <div ref={modelCardContainerRef} />
                            )}
                            {!modelCardLoading && !modelCardError && !modelCardData && (
                                <div style={{ color: theme.textSecondary, fontSize: '14px' }}>
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '6px' }}>Session ID</div>
                                        <div style={{ fontFamily: 'monospace', color: theme.textPrimary }}>{sessionId}</div>
                                    </div>
                                    {frameInfo && (
                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '6px' }}>Training Progress</div>
                                            <div style={{ color: theme.textPrimary }}>{frameInfo.total} epochs completed</div>
                                        </div>
                                    )}
                                    {trainingStatus && (
                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '6px' }}>Status</div>
                                            <div style={{ color: trainingStatus === 'completed' ? theme.accent : theme.textPrimary }}>
                                                {trainingStatus === 'completed' ? 'Training Complete' : 'Training In Progress'}
                                            </div>
                                        </div>
                                    )}
                                    {sphereRef?.recordList && (
                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '6px' }}>Data Points</div>
                                            <div style={{ color: theme.textPrimary }}>{sphereRef.recordList.length} points</div>
                                        </div>
                                    )}
                                    {frameInfo && frameInfo.visible > 0 && (
                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '6px' }}>Clusters</div>
                                            <div style={{ color: theme.textPrimary }}>{frameInfo.visible} clusters identified</div>
                                        </div>
                                    )}
                                    {lossData?.training_info?.model_parameters !== undefined && (
                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textTertiary, marginBottom: '6px' }}>Model Parameters</div>
                                            <div style={{ color: theme.textPrimary }}>{lossData.training_info.model_parameters.toLocaleString()}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

interface SphereEmbeddedProps {
    initial_data: any;
    apiBaseUrl?: string;
    // JWT auth token - sent as Bearer token on all API requests
    authToken?: string;
    isRotating?: boolean;
    rotationSpeed?: number;
    animateClusters?: boolean;
    pointSize?: number;
    pointOpacity?: number;
    onSphereReady?: (sphereRef: any) => void;
    // Display mode: 'thumbnail' hides all UI controls, 'full' shows everything
    mode?: 'thumbnail' | 'full';
    // Custom data endpoint URL - overrides the default epoch_projections URL
    dataEndpoint?: string;
    // Theme: 'dark' (default) or 'light'
    theme?: 'dark' | 'light';
    // Custom background color for the sphere container area
    backgroundColor?: string;
    // Default alpha/opacity for points (0-1, default 0.5)
    pointAlpha?: number;
    // Matplotlib colormap name for cluster colors (e.g. 'viridis', 'tab10', 'plasma')
    colormap?: string;
    // Callback when maximize button is clicked in thumbnail mode
    onMaximize?: (sessionId?: string) => void;
}

// Final Sphere View Component - shows the completed sphere with all points
const FinalSphereView: React.FC<{
    data: any;
    isRotating?: boolean;
    rotationSpeed?: number;
    animateClusters?: boolean;
    pointSize?: number;
    pointOpacity?: number;
    onSphereReady?: (sphereRef: any) => void;
}> = ({ data, isRotating, rotationSpeed, animateClusters, pointSize, pointOpacity, onSphereReady }) => {
    // Process the data to create recordList and columnTypes
    const [recordList, setRecordList] = useState<SphereRecord[]>([]);
    const [columnTypes, setColumnTypes] = useState<any>(null);
    const [jsonData, setJsonData] = useState<any>(null);
    
    useEffect(() => {
        if (!data || !data.coords || data.coords.length === 0) {
            return;
        }
        
        // Remap cluster assignments for consistency
        if (data.entire_cluster_results) {
            remap_server_cluster_assignments(data.entire_cluster_results);
        }
        
        // Fix cluster_pre assignments
        if (data.coords) {
            data.coords.forEach((entry: any) => {
                if (data.entire_cluster_results && data.entire_cluster_results['12']) {
                    const rowOffset = entry.__featrix_row_offset;
                    if (rowOffset !== undefined && data.entire_cluster_results['12'].cluster_labels) {
                        entry.cluster_pre = data.entire_cluster_results['12'].cluster_labels[rowOffset];
                    }
                }
            });
        }
        
        // Create record list
        const records = create_record_list(data);
        setRecordList(records);
        
        // Get column types
        const types = getColumnTypes(data);
        setColumnTypes(types);
        
        // Set jsonData
        setJsonData(data);

        console.log('Final sphere data processed:', records.length, 'points,', Object.keys(data.entire_cluster_results || {}).length, 'cluster counts');
    }, [data]);
    
    // Get column types helper
    const getColumnTypes = (projections: any) => {
        try {
            const d: any = {};
            const items = projections.coords;
            for (const entry of items) {
                if (entry.scalar_columns) {
                    const ks = Object.keys(entry.scalar_columns);
                    for (const k of ks) {
                        if (d[k] === undefined) {
                            d[k] = 'scalar';
                        }
                    }
                }
                if (entry.set_columns) {
                    const ks = Object.keys(entry.set_columns);
                    for (const k of ks) {
                        if (d[k] === undefined) {
                            d[k] = 'set';
                        }
                    }
                }
                if (entry.string_columns) {
                    const ks = Object.keys(entry.string_columns);
                    for (const k of ks) {
                        if (d[k] === undefined) {
                            d[k] = 'string';
                        }
                    }
                }
            }
            return d;
        } catch (error) {
            // Error getting column types
            return null;
        }
    };
    
    // Create record list helper
    const create_record_list = (server_data: any): SphereRecord[] => {
        const recordIndex: SphereRecord[] = [];
        if (!server_data || !server_data.coords) {
            return recordIndex;
        }
        
        for (const entry of server_data.coords) {
            const uuid = String(uuid4());
            // Support both numeric keys ("0","1","2") from /projections
            // and named keys ("x","y","z") from /epoch_projections
            const cx = entry["0"] ?? entry["x"] ?? entry.x ?? 0;
            const cy = entry["1"] ?? entry["y"] ?? entry.y ?? 0;
            const cz = entry["2"] ?? entry["z"] ?? entry.z ?? 0;
            const sphere_record: SphereRecord = {
                coords: {
                    x: cx,
                    y: cy,
                    z: cz,
                },
                id: uuid,
                featrix_meta: {
                    cluster_pre: entry.cluster_pre,
                    webgl_id: null,
                    __featrix_row_id: entry.__featrix_row_id,
                    __featrix_row_offset: entry.__featrix_row_offset,
                },
                original: {
                    ...(entry.set_columns || {}),
                    ...(entry.scalar_columns || {}),
                    ...(entry.string_columns || {})
                },
            };
            recordIndex.push(sphere_record);
        }
        return recordIndex;
    };
    
    // Remap cluster assignments helper
    const remap_server_cluster_assignments = (clusterInfoByClusterCount: any) => {
        if (!clusterInfoByClusterCount) return;
        const max_clusters = Object.keys(clusterInfoByClusterCount).length;
        for (let base_n_clusters = 2; base_n_clusters < max_clusters + 1; base_n_clusters++) {
            const base_clusters = clusterInfoByClusterCount[base_n_clusters]?.cluster_labels;
            const new_clusters = clusterInfoByClusterCount[base_n_clusters + 1]?.cluster_labels;
            if (!base_clusters || !new_clusters) continue;
            
            const remap = remap_cluster_assignments(base_clusters, new_clusters);
            clusterInfoByClusterCount[base_n_clusters + 1].cluster_labels = new_clusters.map((label: number) => remap[label]);
        }
    };
    
    if (!recordList.length || !jsonData) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
                <p>Processing sphere data...</p>
            </div>
        );
    }
    
    return (
        <FeatrixEmbeddingsExplorer
            recordList={recordList}
            columnTypes={columnTypes}
            data={data}
            jsonData={jsonData}
            isRotating={isRotating}
            rotationSpeed={rotationSpeed}
            animateClusters={animateClusters}
            pointSize={pointSize}
            pointOpacity={pointOpacity}
            onSphereReady={onSphereReady}
        />
    );
};

export default function FeatrixSphereEmbedded({ initial_data, apiBaseUrl, authToken, isRotating, rotationSpeed, animateClusters, pointSize, pointOpacity, onSphereReady, mode, dataEndpoint, theme = 'dark', backgroundColor, pointAlpha, colormap, onMaximize }: SphereEmbeddedProps) {
    // Check if we have final sphere data (coords + cluster_results) or just a session ID
    const hasFinalData = initial_data?.coords && initial_data?.coords.length > 0 && initial_data?.entire_cluster_results;
    const sessionId = initial_data?.session?.session_id;

    // If we have final sphere data, show the final sphere
    // Otherwise, show training movie (if sessionId provided)
    if (hasFinalData) {
        // Show final sphere with provided data
        return (
            <ThemeProvider mode={theme} backgroundColor={backgroundColor}>
            <div className="sphere-embedded-container">
                <div className="mx-auto">
                    <FinalSphereView
                        data={initial_data}
                        isRotating={isRotating}
                        rotationSpeed={rotationSpeed}
                        animateClusters={animateClusters}
                        pointSize={pointSize}
                        pointOpacity={pointOpacity ?? pointAlpha}
                        onSphereReady={onSphereReady}
                    />
                </div>
            </div>
            </ThemeProvider>
        );
    } else if (sessionId) {
        // Show training movie for the provided session ID
        return (
            <ThemeProvider mode={theme} backgroundColor={backgroundColor}>
            <div className="sphere-embedded-container">
                <div className="mx-auto">
                    <TrainingMovie sessionId={sessionId} apiBaseUrl={apiBaseUrl} authToken={authToken} mode={mode} dataEndpoint={dataEndpoint} pointAlpha={pointAlpha} colormap={colormap} onMaximize={onMaximize} />
                </div>
            </div>
            </ThemeProvider>
        );
    } else {
        // No data and no session ID - show error
        return (
            <ThemeProvider mode={theme} backgroundColor={backgroundColor}>
            <div className="sphere-embedded-container">
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                    <p>No data or session ID provided</p>
                    <p style={{ fontSize: '12px', marginTop: '10px' }}>Please provide sphere data or a session ID</p>
                </div>
            </div>
            </ThemeProvider>
        );
    }
} 