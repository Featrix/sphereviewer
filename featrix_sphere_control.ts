import { TRACE_OUTPUT_VERSION } from "next/dist/shared/lib/constants";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { v4 as uuid4 } from "uuid";


const RED = "#ff0000";
const BLACK = "#000000";
const GRAY = "#dddddd";

// --- Cached sprite textures for rocket mode ---
let _fireTexture: THREE.CanvasTexture | null = null;
let _smokeTexture: THREE.CanvasTexture | null = null;
let _glowTexture: THREE.CanvasTexture | null = null;

function getFireTexture(): THREE.CanvasTexture {
    if (_fireTexture) return _fireTexture;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    // Teardrop-ish flame shape: radial gradient biased upward
    const cx = size / 2, cy = size * 0.55;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.45);
    grad.addColorStop(0, 'rgba(255, 255, 220, 1.0)');   // white-hot core
    grad.addColorStop(0.15, 'rgba(255, 240, 120, 0.95)'); // bright yellow
    grad.addColorStop(0.35, 'rgba(255, 180, 40, 0.8)');   // orange
    grad.addColorStop(0.6, 'rgba(255, 80, 10, 0.5)');     // red-orange
    grad.addColorStop(0.85, 'rgba(200, 30, 5, 0.2)');     // dark red
    grad.addColorStop(1.0, 'rgba(100, 10, 0, 0.0)');      // transparent
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    _fireTexture = new THREE.CanvasTexture(canvas);
    _fireTexture.needsUpdate = true;
    return _fireTexture;
}

function getSmokeTexture(): THREE.CanvasTexture {
    if (_smokeTexture) return _smokeTexture;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    // Soft cloudy smoke puff
    const cx = size / 2, cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.45);
    grad.addColorStop(0, 'rgba(180, 175, 170, 0.6)');    // warm gray center
    grad.addColorStop(0.3, 'rgba(160, 155, 150, 0.4)');
    grad.addColorStop(0.6, 'rgba(140, 135, 130, 0.2)');
    grad.addColorStop(1.0, 'rgba(120, 115, 110, 0.0)');   // transparent edge
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    _smokeTexture = new THREE.CanvasTexture(canvas);
    _smokeTexture.needsUpdate = true;
    return _smokeTexture;
}

function getGlowTexture(): THREE.CanvasTexture {
    if (_glowTexture) return _glowTexture;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2, cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
    grad.addColorStop(0, 'rgba(255, 200, 80, 0.8)');
    grad.addColorStop(0.4, 'rgba(255, 120, 20, 0.4)');
    grad.addColorStop(1.0, 'rgba(200, 50, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    _glowTexture = new THREE.CanvasTexture(canvas);
    _glowTexture.needsUpdate = true;
    return _glowTexture;
}

/**
 * Simple k-means clustering on 3D points.
 * Returns an array of cluster labels (one per point).
 */
function kmeans_cluster(points: { x: number, y: number, z: number }[], k: number, maxIterations: number = 50): number[] {
    const n = points.length;
    if (n === 0 || k <= 0) return [];
    if (k >= n) return points.map((_, i) => i);

    // Initialize centroids using k-means++ seeding
    const centroids: { x: number, y: number, z: number }[] = [];
    const firstIdx = Math.floor(Math.random() * n);
    centroids.push({ ...points[firstIdx] });

    for (let c = 1; c < k; c++) {
        const distances = points.map(p => {
            let minDist = Infinity;
            for (const centroid of centroids) {
                const dx = p.x - centroid.x, dy = p.y - centroid.y, dz = p.z - centroid.z;
                const d = dx * dx + dy * dy + dz * dz;
                if (d < minDist) minDist = d;
            }
            return minDist;
        });
        const totalDist = distances.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalDist;
        let picked = 0;
        for (let i = 0; i < n; i++) {
            r -= distances[i];
            if (r <= 0) { picked = i; break; }
        }
        centroids.push({ ...points[picked] });
    }

    const labels = new Array(n).fill(0);
    for (let iter = 0; iter < maxIterations; iter++) {
        let changed = false;
        for (let i = 0; i < n; i++) {
            let minDist = Infinity;
            let bestCluster = 0;
            for (let c = 0; c < k; c++) {
                const dx = points[i].x - centroids[c].x;
                const dy = points[i].y - centroids[c].y;
                const dz = points[i].z - centroids[c].z;
                const d = dx * dx + dy * dy + dz * dz;
                if (d < minDist) { minDist = d; bestCluster = c; }
            }
            if (labels[i] !== bestCluster) { labels[i] = bestCluster; changed = true; }
        }
        if (!changed) break;

        const counts = new Array(k).fill(0);
        const sums = Array.from({ length: k }, () => ({ x: 0, y: 0, z: 0 }));
        for (let i = 0; i < n; i++) {
            const c = labels[i];
            counts[c]++;
            sums[c].x += points[i].x;
            sums[c].y += points[i].y;
            sums[c].z += points[i].z;
        }
        for (let c = 0; c < k; c++) {
            if (counts[c] > 0) {
                centroids[c].x = sums[c].x / counts[c];
                centroids[c].y = sums[c].y / counts[c];
                centroids[c].z = sums[c].z / counts[c];
            }
        }
    }
    return labels;
}

/**
 * Run k-means for multiple values of k on the LAST epoch's 3D positions.
 * Returns entire_cluster_results in the same format the server would provide.
 */
function compute_client_side_clusters(trainingMovieData: any): Record<string, any> {
    // Get the last epoch's coordinates (final positions = final clustering)
    const epochKeys = Object.keys(trainingMovieData).sort((a: string, b: string) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });
    if (epochKeys.length === 0) return {};

    const lastEpochKey = epochKeys[epochKeys.length - 1];
    const lastEpochData = trainingMovieData[lastEpochKey];
    if (!lastEpochData?.coords || lastEpochData.coords.length < 4) return {};

    const coords = lastEpochData.coords;

    // Extract 3D positions
    const points: { x: number, y: number, z: number }[] = [];
    for (const entry of coords) {
        const extracted = extractCoordinates(entry);
        if (extracted) {
            points.push(extracted);
        } else {
            points.push({ x: 0, y: 0, z: 0 });
        }
    }

    const results: Record<string, any> = {};
    const maxK = Math.min(12, Math.floor(points.length / 3));
    let bestK = 2;
    let bestScore = Infinity;

    for (let k = 2; k <= maxK; k++) {
        const labels = kmeans_cluster(points, k);

        // Compute inertia
        const counts = new Array(k).fill(0);
        const sums = Array.from({ length: k }, () => ({ x: 0, y: 0, z: 0 }));
        for (let i = 0; i < points.length; i++) {
            const c = labels[i];
            counts[c]++;
            sums[c].x += points[i].x;
            sums[c].y += points[i].y;
            sums[c].z += points[i].z;
        }
        const centroids = sums.map((s, c) => counts[c] > 0
            ? { x: s.x / counts[c], y: s.y / counts[c], z: s.z / counts[c] }
            : { x: 0, y: 0, z: 0 });

        let inertia = 0;
        for (let i = 0; i < points.length; i++) {
            const c = labels[i];
            const dx = points[i].x - centroids[c].x;
            const dy = points[i].y - centroids[c].y;
            const dz = points[i].z - centroids[c].z;
            inertia += dx * dx + dy * dy + dz * dz;
        }

        const score = inertia * (1 + k * 0.05);
        results[String(k)] = { cluster_labels: labels, score };

        if (score < bestScore) {
            bestScore = score;
            bestK = k;
        }
    }

    console.log(`Client-side clustering complete: best k=${bestK} (tried 2-${maxK} on ${points.length} points)`);
    return results;
}

/**
 * Helper function to extract x, y, z coordinates from various data formats.
 * Handles:
 * - Object with named properties: {x: n, y: n, z: n}
 * - Object with numeric keys: {0: n, 1: n, 2: n}
 * - Array format: [x, y, z]
 *
 * @param coords The coordinate data in any supported format
 * @returns Object with x, y, z properties or null if invalid
 */
function extractCoordinates(coords: any): { x: number, y: number, z: number } | null {
    if (!coords || typeof coords !== 'object') {
        return null;
    }

    let x, y, z;

    if (Array.isArray(coords)) {
        // Array format: [x, y, z]
        x = coords[0];
        y = coords[1];
        z = coords[2];
    } else if ('x' in coords && 'y' in coords && 'z' in coords) {
        // Object with named properties: {x, y, z}
        x = coords.x;
        y = coords.y;
        z = coords.z;
    } else if (0 in coords && 1 in coords && 2 in coords) {
        // Object with numeric keys: {0, 1, 2}
        x = coords[0];
        y = coords[1];
        z = coords[2];
    } else {
        return null;
    }

    // Validate all coordinates are valid numbers
    if (typeof x !== 'number' || isNaN(x) ||
        typeof y !== 'number' || isNaN(y) ||
        typeof z !== 'number' || isNaN(z)) {
        return null;
    }

    return { x, y, z };
}

export interface SphereData {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    angle: number;
    verticalAngle: number;
    cubeSize: number;
    sceneCenter: THREE.Vector3;
    orbitRadius: number;
    isAnimating: boolean;
    cancelAnimationRef: number;
    container: HTMLElement;
    isDragging: boolean;
    firstPos: { x: number, y: number};
    prevPos: { x: number, y: number};
    prevPinchDistance: number | null;
    selectedRecords: Set<string>;
    customClusterColors: Map<number, number>; // Map cluster ID to custom color (hex)
    event_listeners: Record<string, Map<string, CallableFunction>>;

    pointRecordsByID: Map<string, SphereRecord>;
    pointObjectsByRecordID: Map<string, THREE.Mesh>;

    similaritySearchResults: Map<string, Array<string>>

    recordFields: string[];
    hasLoggedSizeIssue?: boolean;
    
    // Animation controls
    rotationSpeed: number;
    rotationControlsEnabled: boolean; // Controls mouse dragging (always true)
    autoRotationEnabled: boolean; // Controls auto-rotation animation
    animateClusters: boolean;
    clusterAnimationRef: number;
    currentCluster: number;
    jsonData?: any;
    
    // Visual controls
    pointSize: number;
    pointOpacity: number;

    finalClusterResults?: any;

    // Cluster color mode: 'final' uses session-level cluster assignments for all frames,
    // 'per-epoch' uses each epoch's own cluster_results for that frame
    clusterColorMode: 'final' | 'per-epoch';

    // Manifold visualization mode: uses prob_positive diverging color instead of clusters
    isManifoldViz?: boolean;

    // Embedding convex hull
    embeddingHull?: THREE.Mesh;
    embeddingHullArea?: number;
    showEmbeddingHull?: boolean;
    hullExpansionFactor?: number; // Scale factor for hulls (1.0 = normal, 1.2 = expanded for better visibility)

    // Set when user manually zooms - prevents auto-fit from overriding
    userHasZoomed?: boolean;

    // Drag-pause state: track what was playing before drag started
    wasPlayingMovieBeforeDrag?: boolean;
    wasAutoRotatingBeforeDrag?: boolean;

    // Physics simulation for restart effect
    physicsWorld?: CANNON.World;
    physicsBodies?: Map<string, CANNON.Body>;
    physicsLineBodies?: Array<{ body: CANNON.Body; object: THREE.Object3D; originalPos: THREE.Vector3; originalQuat: THREE.Quaternion }>;
    isPhysicsRunning?: boolean;
    physicsAnimationRef?: number;
    originalPositions?: Map<string, THREE.Vector3>;

    // Auto-loop movie with physics effect between loops
    autoLoopMovie?: boolean;

    // Internal: Track pending auto-loop timeout so we can cancel it on pause
    _autoLoopCheckRef?: ReturnType<typeof setTimeout>;

    // Internal: Track if user explicitly paused (prevents auto-restart)
    _pausedByUser?: boolean;

    // Alpha by movement - transparent for large moves, opaque for small moves (convergence effect)
    alphaByMovement?: boolean;

    // Playback speed multiplier (1.0 = normal, 2.0 = 2x faster, 0.5 = half speed)
    playbackSpeed?: number;

    // Internal: Counter for throttling hull animation updates
    _hullAnimationCounter?: number;

    // Internal: Track previous spotlight cluster to detect changes
    _previousSpotlightCluster?: number;
}

export type SphereRecord = {
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
    original: {
        [key: string]: any
    },
}

export type SphereRecordIndex = Map<string, SphereRecord>;


// NOTE: `render` and `send_event` are to be used from event handlers only.
// They are not to be used inside the functions that directly manipulate the
// state of the sphere. We want the basic manipulation functions to be fast and
// composable, and adding the render/notify logic to them would make them slower
// and potentially result in multiple renders for a single operation.


function create_new_sphere(container: HTMLElement): SphereData {
    const scene = new THREE.Scene();

    // Add lighting for nice visual effects
    // Soft ambient light to ensure nothing is completely dark
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Key light - main directional light from upper right
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    // Fill light - softer light from opposite side to reduce harsh shadows
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-2, 1, -2);
    scene.add(fillLight);

    // Rim light - subtle backlight for depth
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, -2, -3);
    scene.add(rimLight);

    const init_height = 500;
    const init_width = 500;
    const init_aspect_ratio = init_width / init_height;
    const camera = new THREE.PerspectiveCamera(75, init_aspect_ratio, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let angle = 0;
    let verticalAngle = 0;

    // All points lay on the unit sphere, so the sphere has diameter 2.
    const dataRange = 2;
    const cubeSize = dataRange * 1;
    const sceneCenter = new THREE.Vector3(0, 0, 0);

    // Camera distance - will be computed by fit_sphere_to_container on first render
    let orbitRadius = cubeSize * 1.5;

    const prevPos = { x: 0, y: 0 };

    const sphere = {
        scene,
        camera,
        renderer,
        raycaster,
        mouse,
        angle,
        verticalAngle,
        cubeSize,
        sceneCenter,
        orbitRadius,
        container,
        isAnimating: false,
        cancelAnimationRef: 0,
        isDragging: false,
        firstPos: { x: 0, y: 0 },
        prevPos,
        prevPinchDistance: null,
        selectedRecords: new Set<string>(),
        customClusterColors: new Map<number, number>(),
        event_listeners: {},

        pointRecordsByID: new Map<string, SphereRecord>(),
        pointObjectsByRecordID: new Map<string, THREE.Mesh>(),

        recordFields: [],

        similaritySearchResults: new Map<string, Array<string>>(),
        
        // Animation controls
        rotationSpeed: 0.1,
        rotationControlsEnabled: true, // Default enabled - controls mouse drag
        autoRotationEnabled: true, // Default enabled - controls auto-rotation
        animateClusters: false,
        clusterAnimationRef: 0,
        currentCluster: 2,
        jsonData: null,
        
        // Visual controls
        pointSize: 0.05,
        pointOpacity: 0.5,
        
        // Training movie controls
        trainingMovieData: null,
        currentEpoch: 0,
        isPlayingMovie: false,
        movieAnimationRef: 0,

        finalClusterResults: undefined,
        clusterColorMode: 'final',
        embeddingHull: undefined,
        embeddingHullArea: undefined,
        showEmbeddingHull: false,
        wasPlayingMovieBeforeDrag: false,
        wasAutoRotatingBeforeDrag: false,
    } as SphereData


    return sphere;
}


export function add_similarity_search_results(sphere: SphereData, query_record: string, similar_record_ids: Array<string>) {
    sphere.similaritySearchResults.set(query_record, similar_record_ids);
}

export function remove_similarity_search_results(sphere: SphereData, anchor_id: string) {
    sphere.similaritySearchResults.delete(anchor_id);
}


function fit_sphere_to_container(sphere: SphereData) {
    const width = sphere.container.clientWidth;
    const height = sphere.container.clientHeight;

    // Force minimum height if container has no height
    const effectiveHeight = height > 0 ? height : 500;

    const aspect = width / effectiveHeight;
    const fov = 75; // Vertical FOV in degrees

    sphere.camera.aspect = aspect;
    sphere.camera.fov = fov;
    sphere.camera.updateProjectionMatrix();
    // Only call setSize when dimensions actually change — setSize clears the canvas
    // buffer every call, which can cause black flashes between frames
    const currentSize = sphere.renderer.getSize(new THREE.Vector2());
    if (Math.abs(currentSize.x - width) > 0.5 || Math.abs(currentSize.y - effectiveHeight) > 0.5) {
        sphere.renderer.setSize(width, effectiveHeight);
    }

    // Auto-fit orbit radius to show the whole sphere, unless user has manually zoomed
    if (!sphere.userHasZoomed) {
        const sphereRadius = 1.0;
        const padding = 1.3; // 30% padding around the sphere
        const vFovRad = (fov / 2) * (Math.PI / 180);

        // Distance needed to fit sphere vertically
        const distForVertical = (sphereRadius * padding) / Math.sin(vFovRad);
        // Distance needed to fit sphere horizontally
        const hFovRad = Math.atan(Math.tan(vFovRad) * aspect);
        const distForHorizontal = (sphereRadius * padding) / Math.sin(hFovRad);

        // Use whichever requires more distance (tighter axis)
        sphere.orbitRadius = Math.max(distForVertical, distForHorizontal);
    }

    // Force canvas style if it still has zero height
    if (sphere.renderer.domElement.style.height === '0px' && effectiveHeight > 0) {
        sphere.renderer.domElement.style.height = `${effectiveHeight}px`;
    }
}

function attach_sphere_to_container(sphere: SphereData) {
    // Position canvas at top-left of container to prevent iOS offset issues
    const canvas = sphere.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    sphere.container.appendChild(canvas);
}

/**
 * Update point opacity based on depth relative to camera.
 * Points on the back of the sphere get lower opacity for better depth perception.
 *
 * PERFORMANCE: This is expensive - only run every N frames
 */
let depthOpacityFrameCounter = 0;
const DEPTH_OPACITY_UPDATE_INTERVAL = 6; // Update every 6 frames (~10fps at 60fps)

function updatePointDepthOpacity(sphere: SphereData) {
    // PERFORMANCE: Skip most frames to reduce CPU load
    depthOpacityFrameCounter++;
    if (depthOpacityFrameCounter % DEPTH_OPACITY_UPDATE_INTERVAL !== 0) {
        return;
    }

    // Calculate camera direction (normalized vector from center to camera)
    const cameraDir = new THREE.Vector3();
    cameraDir.subVectors(sphere.camera.position, sphere.sceneCenter).normalize();

    // Iterate through all point meshes and adjust opacity based on depth
    sphere.pointObjectsByRecordID.forEach((pointMesh) => {
        // Get point position relative to sphere center
        const pointPos = new THREE.Vector3();
        pointMesh.getWorldPosition(pointPos);
        pointPos.sub(sphere.sceneCenter).normalize();

        // Calculate dot product: 1.0 = facing camera, -1.0 = away from camera
        const dotProduct = pointPos.dot(cameraDir);

        // Map dot product to opacity range
        // Front of sphere (dotProduct = 1.0) -> full opacity (sphere.pointOpacity)
        // Back of sphere (dotProduct = -1.0) -> reduced opacity (30% of base opacity)
        const minOpacityFactor = 0.3; // Back points are 30% as opaque
        const opacityFactor = minOpacityFactor + ((dotProduct + 1.0) / 2.0) * (1.0 - minOpacityFactor);

        // Apply depth-based opacity
        const baseOpacity = sphere.pointOpacity;
        pointMesh.material.opacity = baseOpacity * opacityFactor;
        pointMesh.material.transparent = true;
    });
}

export function render_sphere(sphere: SphereData) {
    if (!sphere.container || !sphere.renderer) return;
    const beforeWidth = sphere.container.clientWidth;
    const beforeHeight = sphere.container.clientHeight;
    
    fit_sphere_to_container(sphere);

    const afterCanvasWidth = sphere.renderer.domElement.width;
    const afterCanvasHeight = sphere.renderer.domElement.height;
    
    if (afterCanvasHeight === 0 || beforeHeight === 0) {
        if (!sphere.hasLoggedSizeIssue) {
            sphere.hasLoggedSizeIssue = true;
        }
    }

    sphere.camera.position.x = sphere.orbitRadius * Math.sin(sphere.angle) * Math.cos(sphere.verticalAngle);
    sphere.camera.position.y = sphere.orbitRadius * Math.sin(sphere.verticalAngle);
    sphere.camera.position.z = sphere.orbitRadius * Math.cos(sphere.angle) * Math.cos(sphere.verticalAngle);
    sphere.camera.lookAt(sphere.sceneCenter);

    // Update point opacity based on depth (distance from camera)
    // Points on the back of the sphere should be lighter/more transparent
    updatePointDepthOpacity(sphere);

    sphere.renderer.render(sphere.scene, sphere.camera);
}


function add_floor_and_grid(sphere: SphereData) {
    // Floor removed - not needed
    // Grid removed - not needed
    // Function kept for compatibility but does nothing
}

const kColorTable = [
    0x4C78A8, // C0 muted blue
    0x72B7B2, // C1 teal
    0xF58518, // C2 soft orange
    0xE45756, // C3 muted red
    0x54A24B, // C4 green
    0xB279A2, // C5 purple
    0xFF9DA6, // C6 dusty pink
    0x9D755D, // C7 brown
    0xBAB0AC, // C8 warm gray
    0x79706E, // C9 cool gray
    0xD37295, // C10 rose
    0x8F6D31, // C11 ochre
];

/**
 * Get color for a cluster based on cluster ID
 * Uses the color table with wrapping for cluster IDs beyond the table size
 */
export function get_cluster_color(sphere: SphereData, clusterId: number): number {
    // Check if there's a custom color for this cluster
    if (sphere.customClusterColors && sphere.customClusterColors.has(clusterId)) {
        return sphere.customClusterColors.get(clusterId)!;
    }

    // Use color table with wrapping
    return kColorTable[clusterId % kColorTable.length];
}

/**
 * Get initial color for a point. Uses cluster_pre if available,
 * otherwise falls back to a default color from the color table
 * based on the point's row offset to give visual differentiation.
 */
const getColor = (record: SphereRecord): number => {
    try {
        // 1. Use cluster_pre if available (set by fix_server_cluster_pre_assignments)
        if (record.featrix_meta?.cluster_pre !== undefined && record.featrix_meta.cluster_pre !== null) {
            return kColorTable[record.featrix_meta.cluster_pre % kColorTable.length];
        }

        // 2. Default: use a muted blue so points are visible but not misleading
        return 0x4488cc;
    } catch (ex) {
        return 0x4488cc;
    }
}

/**
 * Diverging red↔gray↔green color for manifold visualization.
 * prob_positive: 0.0 → red (#ef4444), 0.5 → gray (#d1d5db), 1.0 → green (#22c55e)
 */
function get_manifold_color(probPositive: number): number {
    const p = Math.max(0, Math.min(1, probPositive));

    let r: number, g: number, b: number;

    if (p < 0.5) {
        // Red (#ef4444) → Gray (#d1d5db)
        const t = p / 0.5;
        r = Math.round(0xef + t * (0xd1 - 0xef));
        g = Math.round(0x44 + t * (0xd5 - 0x44));
        b = Math.round(0x44 + t * (0xdb - 0x44));
    } else {
        // Gray (#d1d5db) → Green (#22c55e)
        const t = (p - 0.5) / 0.5;
        r = Math.round(0xd1 + t * (0x22 - 0xd1));
        g = Math.round(0xd5 + t * (0xc5 - 0xd5));
        b = Math.round(0xdb + t * (0x5e - 0xdb));
    }

    return (r << 16) | (g << 8) | b;
}

/**
 * Get prob_positive for a point in a given epoch from the training movie data.
 */
function get_prob_positive_for_point(sphere: SphereData, rowOffset: number, epochKey: string): number | null {
    const epochData = sphere.trainingMovieData?.[epochKey];
    if (!epochData?.coords || rowOffset >= epochData.coords.length) return null;

    const coord = epochData.coords[rowOffset];
    if (!coord) return null;

    const probPositive = coord.scalar_columns?.prob_positive;
    if (typeof probPositive === 'number' && !isNaN(probPositive)) {
        return probPositive;
    }
    return null;
}

function add_point_to_sphere(sphere: SphereData, record: SphereRecord) {
    
    const record_id = record.id;
    
    const pointSize = sphere.pointSize;
    const opacity = sphere.pointOpacity;
    

    const geometry = new THREE.SphereGeometry(pointSize, 12, 8);
    const material = new THREE.MeshPhongMaterial({
        color: getColor(record),
        opacity: opacity,
        transparent: true,
        shininess: 60,
        specular: 0x444444,
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.position.set(record.coords.x, record.coords.y, record.coords.z);
    sphere.scene.add(mesh);

    const object_id = mesh.uuid;
    
    // mesh.userData.__featrix_row_id = record.featrix_meta.__featrix_row_id;
    // mesh.userData.__featrix_row_offset = record.featrix_meta.__featrix_row_offset;

    // Add cross-references between object and record.
    mesh.userData.record_id = record_id;
    record.featrix_meta.webgl_id = object_id;

    // Add mesh and record to the sphere's respective indexes.
    sphere.pointObjectsByRecordID.set(record_id, mesh);
    sphere.pointRecordsByID.set(record_id, record);
}

function add_points_to_sphere(sphere: SphereData, recordList: SphereRecord[], batchSize: number = 100, onProgress?: (loaded: number, total: number) => void) {
    

    // Figure out the set of all fields in the records.
    const fieldsSet = new Set<string>();
    for (const record of recordList) {
        Object.keys(record.original).forEach(field => fieldsSet.add(field));
    };
    // Order fields alphabetically.
    sphere.recordFields = Array.from(fieldsSet).sort((a, b) => a.localeCompare(b));
    
    // If batchSize is 0 or negative, or recordList is small, add all points synchronously
    if (batchSize <= 0 || recordList.length <= batchSize) {
        for (const record of recordList) {    
            add_point_to_sphere(sphere, record)
        }
        if (onProgress) {
            onProgress(recordList.length, recordList.length);
        }
        return;
    }
    
    // Batch loading: process points in chunks to avoid blocking UI
    let currentIndex = 0;
    const total = recordList.length;
    
    const processBatch = () => {
        const endIndex = Math.min(currentIndex + batchSize, total);
        
        // Process this batch
        for (let i = currentIndex; i < endIndex; i++) {
            add_point_to_sphere(sphere, recordList[i]);
        }
        
        currentIndex = endIndex;
        
        // Report progress
        if (onProgress) {
            onProgress(currentIndex, total);
        }
        
        // If more points to process, schedule next batch
        if (currentIndex < total) {
            // Use requestAnimationFrame for smooth UI updates
            requestAnimationFrame(processBatch);
        } else {
            render_sphere(sphere);
        }
    };

    processBatch();
}


export function remap_cluster_assignments(base_assignments: any, new_assignments: any) {
    // The input is supposed to look like this:
    // base_assignment = [0, 0, 0, 1, 1, 0, 1, 0, 1]
    // new_assignments = [2, 2, 1, 0, 0, 1, 0, 1, 0]

    // The return value should be an object that remaps new cluster indices to ones
    // that are most similar to the old cluster indices. the number of entries should
    // be equal to the number of new clusters, and each index should appear exactly
    // once in the keys and value of the object.

    const base_n_clusters = Math.max(...base_assignments) + 1;
    const new_n_clusters = Math.max(...new_assignments) + 1;

    // Group new_assignments by cluster. I want an object where the key is
    // the cluster idx, and the value is a list of the indices of the points
    // in that cluster.
    const new_assignments_by_base_cluster_idx = base_assignments.reduce((acc: any, base_cluster_idx: any, idx: any) => {;
        const new_cluster_idx = new_assignments[idx];
        
        if (!acc[base_cluster_idx]) {
            acc[base_cluster_idx] = {};
        }
        
        if (!acc[base_cluster_idx][new_cluster_idx]) {
            acc[base_cluster_idx][new_cluster_idx] = 0;
        }
        
        acc[base_cluster_idx][new_cluster_idx] += 1;
        return acc;
    }, {});

    // Decide which new cluster each old cluster should be mapped to.
    // For example, the new cluster that contains the most point from old cluster 0
    // should be remapped to 0.

    // Case 1: increasing the number of clusters
    // For each old cluster, find the new cluster that contains the most points from
    // the old cluster. Then, remap the cluster idx of that new cluster to
    // the cluster idx of the old cluster.
    // After we've gone through all the old clusters, assign any unused cluster ids
    // to the new clusters.
    const remap: any = {};
    const used_new_clusters = new Set();

    // iterate over the old cluster indices to find which new index has the largest
    // overlap
    for (let base_cluster_idx = 0; base_cluster_idx < base_n_clusters; base_cluster_idx++) {

        const new_cluster_counts = new_assignments_by_base_cluster_idx[base_cluster_idx];
        let max_count = 0;
        let best_new_cluster_idx = -1;

        for (const [new_cluster_idx, count] of Object.entries(new_cluster_counts) as [string, number][]) {
            if (count > max_count && !used_new_clusters.has(Number(new_cluster_idx))) {
                max_count = count;
                best_new_cluster_idx = Number(new_cluster_idx);
            }
        }

        if (best_new_cluster_idx !== -1) {
            remap[best_new_cluster_idx] = base_cluster_idx;
            used_new_clusters.add(best_new_cluster_idx);
        }
    }

    // At this point, we have remapped the new clusters to the old clusters, but only for the 
    // new clusters that map to the old clusters. Now we need to figure out which new clusters
    // have not yet been asssigned, and which new cluster indices are left to be assinged.

    // Figure out which indices are not in remap keys
    // These are the new cluster indices that have not been assigned to a new cluster index.
    const missing_from_keys = [];
    for (let new_cluster_idx = 0; new_cluster_idx < new_n_clusters; new_cluster_idx++) {
        if (!remap.hasOwnProperty(new_cluster_idx)) {
            missing_from_keys.push(new_cluster_idx);
        }
    }

    // Figure out which values are not in remap values
    // These are the cluster indices that are still "free" to be assigned to.
    // If base_n_clusters is 3 and new_n_clusters is 5, this should be [3, 4].
    const missing_from_values = [];
    for (let new_cluster_idx = 0; new_cluster_idx < new_n_clusters; new_cluster_idx++) {
        if (!Object.values(remap).includes(new_cluster_idx)) {
            missing_from_values.push(new_cluster_idx);
        }
    }

    if (missing_from_keys.length !== missing_from_values.length) {
        throw new Error("missing_from_keys and missing_from_values should have the same length");
    }

    // Assign the missing keys to the missing values in first-come first-served order.
    for (let i = 0; i < missing_from_keys.length; i++) {
        remap[missing_from_keys[i]] = missing_from_values[i];
    }

    return remap
}


//function change_colors_of_sphere_new_cluster_(sphere: SphereData, )
export function set_cluster_color(sphere: SphereData, clusterId: number, color: string | number) {
    // Convert color string to hex number if needed
    let colorHex: number;
    if (typeof color === 'string') {
        // Remove # if present and convert to hex
        const cleanColor = color.replace('#', '');
        colorHex = parseInt(cleanColor, 16);
    } else {
        colorHex = color;
    }
    
    if (!sphere.customClusterColors) {
        sphere.customClusterColors = new Map<number, number>();
    }
    
    sphere.customClusterColors.set(clusterId, colorHex);
    
    // Apply color to all points in this cluster
    const activeClusterKey = get_active_cluster_count_key(sphere);
    if (activeClusterKey !== null && sphere.finalClusterResults?.[activeClusterKey]?.cluster_labels) {
        for (const [record_id, record] of sphere.pointRecordsByID.entries()) {
            const row_offset = record.featrix_meta?.__featrix_row_offset;
            if (row_offset !== undefined && row_offset < sphere.finalClusterResults[activeClusterKey].cluster_labels.length) {
                const clusterAssignment = sphere.finalClusterResults[activeClusterKey].cluster_labels[row_offset];
                if (clusterAssignment === clusterId) {
                    change_object_color(sphere, record_id, colorHex);
                }
            }
        }
        render_sphere(sphere);
    }
}

export function clear_cluster_colors(sphere: SphereData) {
    if (sphere.customClusterColors) {
        sphere.customClusterColors.clear();
    }
    // Reapply default colors
    change_cluster_count(sphere, sphere.jsonData, get_active_cluster_count_key(sphere)?.toString() || '12');
}

export function change_cluster_count(sphere: SphereData, jsonData: any, new_cluster_selection: any) {
    const new_cluster_labels_by_row_offset = jsonData?.entire_cluster_results[new_cluster_selection]?.cluster_labels;


    if (!new_cluster_labels_by_row_offset) {
        return;
    }

    for (const [record_id, record] of sphere.pointRecordsByID.entries()) {
        const row_offset = record.featrix_meta.__featrix_row_offset;
        if (row_offset === null) {
            continue;
        }

        const new_cluster_idx_for_record = new_cluster_labels_by_row_offset[row_offset];
        
        // Check for custom color first, then use default
        let new_color_for_object: number;
        if (sphere.customClusterColors && sphere.customClusterColors.has(new_cluster_idx_for_record)) {
            new_color_for_object = sphere.customClusterColors.get(new_cluster_idx_for_record)!;
        } else if (new_cluster_idx_for_record < kColorTable.length) {
            new_color_for_object = kColorTable[new_cluster_idx_for_record];
        } else {
            new_color_for_object = BLACK;
        }
        
        change_object_color(sphere, record_id, new_color_for_object);
    }
}

export function set_cluster_color_mode(sphere: SphereData, mode: 'final' | 'per-epoch') {
    sphere.clusterColorMode = mode;

    // Re-apply colors for the current frame using the new mode
    if (sphere.trainingMovieData) {
        const epochKeys = Object.keys(sphere.trainingMovieData).sort((a: string, b: string) => {
            const epochA = parseInt(a.replace('epoch_', ''));
            const epochB = parseInt(b.replace('epoch_', ''));
            return epochA - epochB;
        });
        const currentEpochKey = epochKeys[sphere.currentEpoch];
        if (currentEpochKey) {
            recolor_points_for_mode(sphere, currentEpochKey);
        }
    }

    // Update convex hulls if visible
    if (sphere.showConvexHulls) {
        compute_cluster_convex_hulls(sphere);
    }

    render_sphere(sphere);
}

function get_cluster_assignment_for_point(
    sphere: SphereData,
    record: SphereRecord,
    epochKey?: string
): number {
    const activeClusterKey = get_active_cluster_count_key(sphere);
    const rowOffset = record.featrix_meta?.__featrix_row_offset;

    if (rowOffset === null || rowOffset === undefined) {
        return -1;
    }

    const mode = sphere.clusterColorMode || 'final';

    if (mode === 'per-epoch' && epochKey) {
        // Use this epoch's own cluster_results
        const epochData = sphere.trainingMovieData?.[epochKey];
        if (epochData?.entire_cluster_results) {
            if (activeClusterKey !== null && epochData.entire_cluster_results[activeClusterKey]?.cluster_labels) {
                if (rowOffset < epochData.entire_cluster_results[activeClusterKey].cluster_labels.length) {
                    return epochData.entire_cluster_results[activeClusterKey].cluster_labels[rowOffset];
                }
            }
        }

        // Fallback to cluster_pre from epoch coord data
        if (epochData?.coords && rowOffset < epochData.coords.length) {
            const coord = epochData.coords[rowOffset];
            if (coord && coord.cluster_pre !== undefined && coord.cluster_pre !== null) {
                return coord.cluster_pre;
            }
        }
    }

    // 'final' mode or fallback: use session-level finalClusterResults
    if (activeClusterKey !== null && sphere.finalClusterResults?.[activeClusterKey]?.cluster_labels) {
        if (rowOffset < sphere.finalClusterResults[activeClusterKey].cluster_labels.length) {
            return sphere.finalClusterResults[activeClusterKey].cluster_labels[rowOffset];
        }
    }

    return -1;
}

const SPOTLIGHT_GRAY_COLOR = 0x555555;
const SPOTLIGHT_DIM_OPACITY = 0.25;

/**
 * Apply color to a point mesh, respecting spotlight state.
 * If spotlight is active and this point is NOT in the spotlight cluster, use gray + dim opacity.
 */
function apply_point_color_with_spotlight(sphere: SphereData, mesh: any, clusterAssignment: number, baseOpacity?: number) {
    if (!mesh.material || !('color' in mesh.material)) return;

    const spotlightCluster = sphere.spotlightCluster;
    const hasSpotlight = spotlightCluster !== undefined && spotlightCluster >= 0;
    const isSpotlightMember = !hasSpotlight || clusterAssignment === spotlightCluster;

    if (isSpotlightMember) {
        // Full color for spotlight members (or when no spotlight active)
        const newColor = get_cluster_color(sphere, clusterAssignment);
        mesh.material.color.setHex(newColor);
        // Store original color for later restoration
        if (!mesh.userData.originalColor) {
            mesh.userData.originalColor = new THREE.Color(newColor);
        }
        if ('opacity' in mesh.material) {
            mesh.material.opacity = baseOpacity ?? sphere.pointOpacity ?? 0.5;
        }
    } else {
        // Gray and dimmed for non-spotlight members
        // Store original color if not already stored
        if (!mesh.userData.originalColor) {
            const newColor = get_cluster_color(sphere, clusterAssignment);
            mesh.userData.originalColor = new THREE.Color(newColor);
        }
        mesh.material.color.setHex(SPOTLIGHT_GRAY_COLOR);
        if ('opacity' in mesh.material) {
            mesh.material.opacity = (baseOpacity ?? sphere.pointOpacity ?? 0.5) * SPOTLIGHT_DIM_OPACITY;
        }
    }
    mesh.material.needsUpdate = true;
}

function recolor_points_for_mode(sphere: SphereData, epochKey: string) {
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        // Skip manually selected records
        if (sphere.selectedRecords && sphere.selectedRecords.has(recordId)) {
            return;
        }

        if (sphere.isManifoldViz) {
            const rowOffset = parseInt(recordId);
            const probPositive = get_prob_positive_for_point(sphere, rowOffset, epochKey);
            if (probPositive !== null) {
                mesh.material.color.setHex(get_manifold_color(probPositive));
                mesh.material.opacity = sphere.pointOpacity ?? 0.5;
                mesh.material.needsUpdate = true;
            }
            return;
        }

        const record = sphere.pointRecordsByID.get(recordId);
        if (!record) return;

        const clusterAssignment = get_cluster_assignment_for_point(sphere, record, epochKey);

        // Only override color if we have a valid cluster assignment
        if (clusterAssignment >= 0) {
            apply_point_color_with_spotlight(sphere, mesh, clusterAssignment);
        }
    });
}


function zoom_sphere(sphere: SphereData, zoom_in: boolean, delta?: number) {
    // Mark that user has manually zoomed so auto-fit doesn't override
    sphere.userHasZoomed = true;

    // Use proportional zoom when delta is provided (pinch), otherwise fixed factor (wheel)
    const zoomFactor = delta ? (1 + Math.abs(delta) * 0.002) : 1.05;

    if (zoom_in) {
        sphere.orbitRadius /= zoomFactor;
    } else {
        sphere.orbitRadius *= zoomFactor;
    }

    // Clamp orbit radius to prevent going inside the sphere or too far out
    sphere.orbitRadius = Math.max(0.2, Math.min(sphere.orbitRadius, sphere.cubeSize * 5));
}


export function initialize_sphere(container: HTMLElement, recordList: SphereRecord[], batchSize: number = 100, onProgress?: (loaded: number, total: number) => void): SphereData {

    const sphere = create_new_sphere(container);

    fit_sphere_to_container(sphere);
    attach_sphere_to_container(sphere);

    // Prevent browser default touch gestures (pinch-to-zoom, scroll) on the canvas
    container.style.touchAction = 'none';

    add_floor_and_grid(sphere);
    add_points_to_sphere(sphere, recordList, batchSize, onProgress);
    
    // Always create unit sphere bounds (very light alpha, always visible)
    create_unit_sphere(sphere);

    container.addEventListener("mousedown", (event) => onMouseDown(sphere, event));
    container.addEventListener("mousemove", (event) => onMouseMove(sphere, event));
    container.addEventListener("mouseup", (event) => onMouseUp(sphere, event));
    container.addEventListener("mouseleave", (event) => onMouseUp(sphere, event));

    container.addEventListener("touchstart", (event) => onTouchStart(sphere, event), { passive: false });
    container.addEventListener("touchmove", (event) => onTouchMove(sphere, event), { passive: false });
    container.addEventListener("touchend", (event) => onTouchEnd(sphere, event), { passive: false });
    
    container.addEventListener("wheel", (event) => onScroll(sphere, event));
    window.addEventListener("resize", () => onResize(sphere));

    return sphere
}


export function start_animation(sphere: SphereData) {
    if (sphere.isAnimating) {
        return;
    }

    sphere.isAnimating = true;

    let old_t = 0;
    let dt = 0;

    function animate(t: number) {
        dt = t - old_t;
        old_t = t;

        // avoid very large jumps after the animation is restarted.
        // measured in ms
        if (dt > 50) {
            dt = 50;
        }

        // revolutions per second - configurable
        // Only auto-rotate if auto-rotation is enabled (separate from mouse controls)
        if (sphere.autoRotationEnabled) {
            sphere.angle += sphere.rotationSpeed * dt / 1000  * Math.PI;
        }
        render_sphere(sphere);

        sphere.cancelAnimationRef = requestAnimationFrame(animate);
    }

    animate(0);
}

function stop_animation(sphere: SphereData) {
    if (sphere.isAnimating && sphere.cancelAnimationRef) {
        cancelAnimationFrame(sphere.cancelAnimationRef);
        sphere.isAnimating = false;
    }
}

export function toggle_animation(sphere: SphereData) {
    if (sphere.isAnimating) {
        stop_animation(sphere);
    } else {
        start_animation(sphere);
    }
}

// New animation control functions
export function set_animation_options(sphere: SphereData, isRotating: boolean = true, rotationSpeed: number = 0.1, animateClusters: boolean = false, jsonData?: any) {
    sphere.rotationSpeed = rotationSpeed;
    // Mouse drag rotation should ALWAYS be enabled
    sphere.rotationControlsEnabled = true;
    // Auto-rotation is controlled separately by isRotating parameter
    sphere.autoRotationEnabled = isRotating;
    sphere.animateClusters = animateClusters;
    sphere.jsonData = jsonData;
    
    if (animateClusters && jsonData) {
        start_cluster_animation(sphere);
    } else {
        stop_cluster_animation(sphere);
    }
    
    if (isRotating && !sphere.isAnimating) {
        start_animation(sphere);
    } else if (!isRotating && sphere.isAnimating) {
        stop_animation(sphere);
    }
}

// Visual control functions
export function set_visual_options(sphere: SphereData, pointSize: number = 0.05, pointOpacity: number = 0.5) {
    sphere.pointSize = pointSize;
    sphere.pointOpacity = pointOpacity;

    // Update all existing points with new visual properties
    update_all_point_visuals(sphere);
}

export function set_wireframe_opacity(sphere: SphereData, opacity: number) {
    if (sphere.unitSphere && sphere.unitSphere.material) {
        const material = sphere.unitSphere.material as THREE.LineBasicMaterial;
        material.opacity = opacity;
        material.needsUpdate = true;
    }
}

export function update_all_point_visuals(sphere: SphereData) {
    // Update all existing point objects with new size and opacity
    sphere.pointObjectsByRecordID.forEach((mesh) => {
        // Update geometry for size change
        mesh.geometry.dispose(); // Clean up old geometry
        mesh.geometry = new THREE.SphereGeometry(sphere.pointSize, 12, 8);

        // CRITICAL: Reset scale to 1.0 - dynamic point sizing may have changed it
        mesh.scale.setScalar(1.0);

        // Update material for opacity change (works for both MeshBasicMaterial and MeshPhongMaterial)
        const mat = mesh.material as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial;
        if (mat && 'opacity' in mat) {
            mat.opacity = sphere.pointOpacity;
            mat.transparent = sphere.pointOpacity < 1.0;
            mat.needsUpdate = true;
        }
    });
}

// Orient camera to face the side of the sphere with the highest density of points.
// Computes the centroid of all point positions - on a unit sphere, this naturally
// points toward the densest region. Sets camera angles to face that direction.
function orient_camera_to_point_density(sphere: SphereData) {
    if (!sphere.pointObjectsByRecordID || sphere.pointObjectsByRecordID.size === 0) return;

    let cx = 0, cy = 0, cz = 0;
    sphere.pointObjectsByRecordID.forEach((mesh: any) => {
        cx += mesh.position.x;
        cy += mesh.position.y;
        cz += mesh.position.z;
    });
    const n = sphere.pointObjectsByRecordID.size;
    cx /= n; cy /= n; cz /= n;

    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (len < 0.01) return; // Points uniformly distributed, no dominant side

    sphere.angle = Math.atan2(cx, cz);
    sphere.verticalAngle = Math.asin(Math.max(-1, Math.min(1, cy / len)));
}

// Training Movie Functions
export function load_training_movie(sphere: SphereData, trainingMovieData: any, lossData?: any, fullSessionData?: any) {
    // CRITICAL: Clear all existing points to prevent accumulation when restarting
    clear_all_points(sphere);
    
    sphere.trainingMovieData = trainingMovieData;
    sphere.lossData = lossData;
    sphere.currentEpoch = 0;

    // Detect manifold visualization mode from epoch data
    const firstTrainingKey = Object.keys(trainingMovieData)[0];
    sphere.isManifoldViz = firstTrainingKey ? trainingMovieData[firstTrainingKey]?.is_manifold_viz === true : false;
    if (sphere.isManifoldViz) {
        console.log('🔬 Manifold visualization mode enabled - using prob_positive color scale');
    }

    // Note: Loss plot is now handled as 2D screen overlay, not 3D scene object

    // Initialize memory trails system
    create_memory_trails(sphere);

    // GET FINAL CLUSTER RESULTS from session data for convergence visualization
    sphere.finalClusterResults = null;

    if (sphere.isManifoldViz) {
        // Manifold mode doesn't use cluster coloring
        sphere.finalClusterResults = {};
    } else {
        // Use server-provided cluster results if available
        const serverResults = sphere.jsonData?.entire_cluster_results;
        if (serverResults && Object.keys(serverResults).length > 0) {
            sphere.finalClusterResults = serverResults;
            console.log('Using server cluster results:', Object.keys(serverResults));
        } else {
            // Server didn't provide cluster results — compute from final epoch positions
            console.log('No server cluster results, running client-side k-means on final epoch positions...');
            const clientResults = compute_client_side_clusters(trainingMovieData);
            if (Object.keys(clientResults).length > 0) {
                sphere.finalClusterResults = clientResults;
                // Also store back on jsonData so other code paths can find it
                if (sphere.jsonData) {
                    sphere.jsonData.entire_cluster_results = clientResults;
                }
                console.log('Client-side cluster results ready:', Object.keys(clientResults));
            } else {
                sphere.finalClusterResults = {};
                console.warn('Could not compute clusters (too few points?)');
            }
        }
    }
    
    // INITIALIZE SPHERE WITH FIRST EPOCH DATA
    const epochKeys = Object.keys(trainingMovieData).sort((a, b) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });
    
    if (epochKeys.length === 0) {
        return;
    }
    
    const firstEpochKey = epochKeys[0];
    const firstEpochData = trainingMovieData[firstEpochKey];
    
    if (!firstEpochData || !firstEpochData.coords) {
        return;
    }

    // Get original data from session projections (jsonData) if available
    // CRITICAL: Use fullSessionData if provided (contains all rows), otherwise fall back to sphere.jsonData?.coords (sampled)
    const sessionCoords = fullSessionData?.coords || sphere.jsonData?.coords || [];
    const originalDataByRowOffset = new Map<number, any>();

    // Check if we have a pre-built sourceDataByRowId map (from include_source_data=true fallback)
    const sourceDataByRowId: Map<number, any> = fullSessionData?.sourceDataByRowId || new Map();

    // Build a map of original data by row_offset AND row_id for quick lookup
    // Some datasets use row_offset, others use row_id, so we need to support both
    sessionCoords.forEach((coord: any) => {
        const rowOffset = coord.__featrix_row_offset;
        const rowId = coord.__featrix_row_id;

        // Priority: source_data (from include_source_data=true) > traditional columns
        const originalData = coord.source_data
            ? { ...coord.source_data }  // Use source_data if available
            : {
                ...(coord.set_columns || {}),
                ...(coord.scalar_columns || {}),
                ...(coord.string_columns || {})
            };

        // Map by row_offset if available
        if (rowOffset !== undefined && rowOffset !== null) {
            originalDataByRowOffset.set(rowOffset, originalData);
        }
        // Also map by row_id if different from rowOffset (for fallback lookup)
        if (rowId !== undefined && rowId !== null && rowId !== rowOffset) {
            originalDataByRowOffset.set(rowId, originalData);
        }
    });

    // Convert first epoch coords to sphere records
    const recordList: SphereRecord[] = firstEpochData.coords.map((entry: any, index: number) => {
        // Use helper function to extract coordinates from any format
        const extractedCoords = extractCoordinates(entry);
        if (!extractedCoords) {
            // Use default coords as fallback
            return {
                coords: { x: 0, y: 0, z: 0 },
                id: String(index),
                featrix_meta: {
                    cluster_pre: null,
                    webgl_id: null,
                    __featrix_row_id: null,
                    __featrix_row_offset: index,
                },
                original: {}
            };
        }
        const { x, y, z } = extractedCoords;

        const rowOffset = entry.__featrix_row_offset ?? index;
        const rowId = entry.__featrix_row_id;
        
        // Start with epoch entry data as primary source
        const epochEntryData = {
            ...(entry.set_columns || {}),
            ...(entry.scalar_columns || {}),
            ...(entry.string_columns || {})
        };
        
        // Try to get full dataset data to supplement missing fields
        // Try multiple lookup strategies since datasets may use different identifiers
        let fullDatasetData = originalDataByRowOffset.get(rowOffset);

        // If not found by rowOffset, try to find by __featrix_row_id
        if (!fullDatasetData && rowId !== undefined && rowId !== null) {
            fullDatasetData = originalDataByRowOffset.get(rowId);
        }

        // If still not found, try sourceDataByRowId (from include_source_data=true fallback)
        if (!fullDatasetData && sourceDataByRowId.size > 0 && rowId !== undefined && rowId !== null) {
            fullDatasetData = sourceDataByRowId.get(rowId);
        }

        // Also check for source_data directly on the entry (from enriched coords)
        if (!fullDatasetData && entry.source_data) {
            fullDatasetData = entry.source_data;
        }

        // Merge: epoch entry data takes priority (has important columns), full dataset supplements missing fields
        const originalData = {
            ...(fullDatasetData || {}),  // Full dataset as base
            ...epochEntryData            // Epoch entry OVERRIDES
        };

        // Create a deep copy of originalData to prevent it from being modified
        // This ensures the full 57 keys are preserved even if the source data changes
        const originalDataCopy = originalData ? JSON.parse(JSON.stringify(originalData)) : {};

        // Debug: Log first few records to see what data we have

        return {
            coords: { x, y, z },
            id: String(index),
            featrix_meta: {
                // Don't use deprecated cluster_pre - use direct lookup from finalClusterResults
                webgl_id: null,
                __featrix_row_id: entry.__featrix_row_id ?? index,
                __featrix_row_offset: rowOffset,
            },
            original: originalDataCopy
        };
    });
    
    // Add points to sphere
    add_points_to_sphere(sphere, recordList);

    // Seed trail history with initial positions so trails appear from the first animation
    // (trails need 2+ history entries; this provides the first, animation completion adds the second)
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        store_point_position_in_history(sphere, recordId, mesh.position);
    });

    // CRITICAL: Update first frame immediately to set correct colors
    // This prevents red dots from appearing at the start
    update_training_movie_frame(sphere, firstEpochKey);

    // Orient camera to face the side with the highest density of points
    orient_camera_to_point_density(sphere);

    // Force initial render
    render_sphere(sphere);
}

// Append additional points to a live training movie (for incremental loading).
// newEpochProjections must have the same epoch keys as the existing data, with
// coords arrays representing the NEW points (offset already applied server-side).
export function append_points_to_training_movie(sphere: SphereData, newEpochProjections: any) {
    if (!sphere.trainingMovieData || !newEpochProjections) return;

    const existingFirstKey = Object.keys(sphere.trainingMovieData)[0];
    const existingCount = sphere.trainingMovieData[existingFirstKey]?.coords?.length || 0;

    // Extend each epoch's coords array with the new points
    for (const epochKey of Object.keys(newEpochProjections)) {
        if (sphere.trainingMovieData[epochKey] && newEpochProjections[epochKey]?.coords) {
            sphere.trainingMovieData[epochKey].coords = [
                ...sphere.trainingMovieData[epochKey].coords,
                ...newEpochProjections[epochKey].coords
            ];
        }
    }

    // Get the current epoch so we can position new points correctly
    const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => {
        return parseInt(a.replace('epoch_', '')) - parseInt(b.replace('epoch_', ''));
    });
    const currentEpochKey = epochKeys[sphere.currentEpoch || 0] || epochKeys[0];
    const currentEpochData = sphere.trainingMovieData[currentEpochKey];

    // Create records for the new points using the current epoch's coordinates
    const newFirstEpoch = newEpochProjections[existingFirstKey];
    if (!newFirstEpoch?.coords) return;

    const newRecords: SphereRecord[] = newFirstEpoch.coords.map((entry: any, i: number) => {
        const index = existingCount + i;
        // Use current epoch coords for initial position (not first epoch)
        const currentCoords = currentEpochData?.coords?.[index];
        const extracted = extractCoordinates(currentCoords || entry);
        const { x, y, z } = extracted || { x: 0, y: 0, z: 0 };

        const rowOffset = entry.__featrix_row_offset ?? index;
        return {
            coords: { x, y, z },
            id: String(index),
            featrix_meta: {
                webgl_id: null,
                __featrix_row_id: entry.__featrix_row_id ?? index,
                __featrix_row_offset: rowOffset,
            },
            original: {
                ...(entry.set_columns || {}),
                ...(entry.scalar_columns || {}),
                ...(entry.string_columns || {})
            }
        };
    });

    // Add the new point meshes to the scene
    for (const record of newRecords) {
        add_point_to_sphere(sphere, record);
    }

    // Seed trail history for new points
    for (const record of newRecords) {
        const mesh = sphere.pointObjectsByRecordID.get(record.id);
        if (mesh) {
            store_point_position_in_history(sphere, record.id, mesh.position);
        }
    }

    // Update the new points to show correct colors/positions for the current frame
    update_training_movie_frame(sphere, currentEpochKey);
    render_sphere(sphere);
    console.log(`📊 Appended ${newRecords.length} points (total: ${existingCount + newRecords.length})`);
}

// Physics-based reset effect - points fall and bounce when movie loops
export function start_physics_reset_effect(sphere: SphereData, onComplete: () => void) {
    // Don't start if already running
    if (sphere.isPhysicsRunning) return;

    sphere.isPhysicsRunning = true;

    // Create physics world with strong gravity
    const world = new CANNON.World();
    world.gravity.set(0, -60, 0); // Very strong gravity for dramatic fall
    world.broadphase = new CANNON.NaiveBroadphase();
    sphere.physicsWorld = world;

    // Create materials for floor and balls
    const floorMaterial = new CANNON.Material('floor');
    const ballMaterial = new CANNON.Material('ball');

    // Contact material for ball-floor collisions (bouncy)
    const ballFloorContact = new CANNON.ContactMaterial(ballMaterial, floorMaterial, {
        friction: 0.4,
        restitution: 0.7, // Bouncy!
    });
    world.addContactMaterial(ballFloorContact);

    // Contact material for ball-ball collisions
    const ballBallContact = new CANNON.ContactMaterial(ballMaterial, ballMaterial, {
        friction: 0.2,
        restitution: 0.5, // Some bounce off each other
    });
    world.addContactMaterial(ballBallContact);

    // Create a floor plane at the bottom of the viewport
    const floorBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
        material: floorMaterial,
    });
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to be horizontal
    floorBody.position.set(0, -2.5, 0); // Floor further down for longer fall
    world.addBody(floorBody);

    // Store original positions and create physics bodies for each point
    sphere.originalPositions = new Map();
    sphere.physicsBodies = new Map();

    const pointRadius = sphere.pointSize || 0.02;
    const sphereShape = new CANNON.Sphere(pointRadius * 2); // Slightly larger collision radius

    sphere.pointObjectsByRecordID.forEach((mesh, recordId) => {
        // Store original position
        sphere.originalPositions!.set(recordId, mesh.position.clone());

        // Create physics body
        const body = new CANNON.Body({
            mass: 1,
            shape: sphereShape,
            position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
            material: ballMaterial,
            linearDamping: 0.1, // Slight air resistance to help settle
            angularDamping: 0.1,
        });

        // Add random initial velocity - push outward and down
        const outwardDir = mesh.position.clone().normalize();
        body.velocity.set(
            outwardDir.x * 3 + (Math.random() - 0.5) * 2,
            -2 + (Math.random() - 0.5) * 1, // Mostly downward
            outwardDir.z * 3 + (Math.random() - 0.5) * 2
        );

        // Add angular velocity for tumbling
        body.angularVelocity.set(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8
        );

        world.addBody(body);
        sphere.physicsBodies!.set(recordId, body);
    });

    // Create physics bodies for line objects (trails, hulls, wireframe, unit sphere)
    sphere.physicsLineBodies = [];
    const lineMaterial = new CANNON.Material('line');
    const lineFloorContact = new CANNON.ContactMaterial(lineMaterial, floorMaterial, {
        friction: 0.6,
        restitution: 0.4, // Lines bounce less than balls
    });
    world.addContactMaterial(lineFloorContact);
    const lineBallContact = new CANNON.ContactMaterial(lineMaterial, ballMaterial, {
        friction: 0.3,
        restitution: 0.3,
    });
    world.addContactMaterial(lineBallContact);

    // Helper: create a physics body for a THREE.Object3D with line geometry
    const addLineBody = (obj: THREE.Object3D, massMultiplier: number = 1) => {
        // Compute world-space bounding box
        const box = new THREE.Box3().setFromObject(obj);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Minimum thickness so thin lines still have a physical shape
        const minDim = 0.02;
        const hx = Math.max(size.x / 2, minDim);
        const hy = Math.max(size.y / 2, minDim);
        const hz = Math.max(size.z / 2, minDim);

        const shape = new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
        const body = new CANNON.Body({
            mass: massMultiplier * (hx * hy * hz * 200 + 0.5), // Mass proportional to volume
            shape,
            position: new CANNON.Vec3(center.x, center.y, center.z),
            material: lineMaterial,
            linearDamping: 0.15,
            angularDamping: 0.15,
        });

        // Copy current object rotation to physics body
        const worldQuat = new THREE.Quaternion();
        obj.getWorldQuaternion(worldQuat);
        body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);

        // Random initial velocity - mostly downward with some scatter
        const outward = center.clone().normalize();
        body.velocity.set(
            outward.x * 2 + (Math.random() - 0.5) * 1.5,
            -1.5 + (Math.random() - 0.5) * 1,
            outward.z * 2 + (Math.random() - 0.5) * 1.5
        );

        // Angular velocity for tumbling - this is what makes them land differently
        body.angularVelocity.set(
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6
        );

        world.addBody(body);
        sphere.physicsLineBodies!.push({
            body,
            object: obj,
            originalPos: obj.position.clone(),
            originalQuat: obj.quaternion.clone(),
        });
    };

    // Add trail lines - limit to max 50 to avoid O(n²) CANNON collision perf issues
    if (sphere.memoryTrailsGroup) {
        const trailChildren = sphere.memoryTrailsGroup.children;
        const maxTrailBodies = 50;
        if (trailChildren.length <= maxTrailBodies) {
            trailChildren.forEach(child => addLineBody(child));
        } else {
            // Sample evenly from trail children
            const step = trailChildren.length / maxTrailBodies;
            for (let i = 0; i < maxTrailBodies; i++) {
                addLineBody(trailChildren[Math.floor(i * step)]);
            }
        }
    }

    // Add convex hull lines/meshes
    if (sphere.convexHullsGroup) {
        sphere.convexHullsGroup.children.forEach(child => addLineBody(child, 2));
    }

    // Add unit sphere wireframe as a single heavy body
    if (sphere.unitSphere && sphere.unitSphere.visible) {
        addLineBody(sphere.unitSphere, 5);
    }

    // Add unit sphere cube if visible
    if ((sphere as any).unitSphereCube && (sphere as any).unitSphereCube.visible) {
        addLineBody((sphere as any).unitSphereCube, 5);
    }

    // Run physics simulation
    const startTime = Date.now();
    const minDuration = 6000; // Minimum 6 seconds of physics
    const maxDuration = 12000; // Maximum 12 seconds
    const timeStep = 1 / 60;

    const animatePhysics = () => {
        if (!sphere.isPhysicsRunning) return;

        const elapsed = Date.now() - startTime;

        // Step the physics world
        world.step(timeStep);

        // Update Three.js mesh positions from physics bodies
        let totalVelocity = 0;
        sphere.physicsBodies!.forEach((body, recordId) => {
            const mesh = sphere.pointObjectsByRecordID.get(recordId);
            if (mesh) {
                mesh.position.set(body.position.x, body.position.y, body.position.z);
            }
            // Track velocity to detect when things have settled
            totalVelocity += body.velocity.length();
        });

        // Update line object positions and rotations from physics bodies
        if (sphere.physicsLineBodies) {
            for (const entry of sphere.physicsLineBodies) {
                const { body, object } = entry;
                object.position.set(body.position.x, body.position.y, body.position.z);
                object.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
                totalVelocity += body.velocity.length();
            }
        }

        // Render
        render_sphere(sphere);

        // Calculate average velocity across all bodies (points + lines)
        const totalBodies = (sphere.physicsBodies?.size || 0) + (sphere.physicsLineBodies?.length || 0);
        const avgVelocity = totalVelocity / (totalBodies || 1);
        const hasSettled = avgVelocity < 0.1; // Very low movement

        // Check if simulation should end:
        // - Must run at least minDuration
        // - Can end early after minDuration if things have settled
        // - Must end at maxDuration regardless
        const shouldEnd = elapsed >= maxDuration ||
            (elapsed >= minDuration && hasSettled);

        if (!shouldEnd) {
            sphere.physicsAnimationRef = requestAnimationFrame(animatePhysics);
        } else {
            // Cleanup - don't restore positions so points animate from floor to epoch 0
            stop_physics_effect(sphere, false);
            onComplete();
        }
    };

    // Start the physics animation
    sphere.physicsAnimationRef = requestAnimationFrame(animatePhysics);
}

export function stop_physics_effect(sphere: SphereData, restorePositions: boolean = true) {
    sphere.isPhysicsRunning = false;

    if (sphere.physicsAnimationRef) {
        cancelAnimationFrame(sphere.physicsAnimationRef);
        sphere.physicsAnimationRef = undefined;
    }

    // Optionally restore original positions
    // When looping, we skip this so points animate from floor to epoch 0
    if (restorePositions && sphere.originalPositions) {
        sphere.originalPositions.forEach((pos, recordId) => {
            const mesh = sphere.pointObjectsByRecordID.get(recordId);
            if (mesh) {
                mesh.position.copy(pos);
            }
        });
    }

    // Always restore line objects to their original positions/rotations
    // (lines get rebuilt each epoch, so leaving them on the floor looks wrong)
    if (sphere.physicsLineBodies) {
        for (const entry of sphere.physicsLineBodies) {
            entry.object.position.copy(entry.originalPos);
            entry.object.quaternion.copy(entry.originalQuat);
        }
    }

    // Cleanup physics
    sphere.physicsWorld = undefined;
    sphere.physicsBodies = undefined;
    sphere.physicsLineBodies = undefined;
    sphere.originalPositions = undefined;
}

// Enable or disable auto-loop with physics effect between loops
export function set_movie_auto_loop(sphere: SphereData, enabled: boolean) {
    sphere.autoLoopMovie = enabled;
}

export function set_playback_speed(sphere: SphereData, speed: number) {
    // Clamp speed to reasonable range (0.25x to 8x)
    sphere.playbackSpeed = Math.max(0.25, Math.min(8, speed));
}

export function play_training_movie(sphere: SphereData, durationSeconds: number = 10, startFromCurrent: boolean = false) {
    if (!sphere.trainingMovieData || sphere.isPlayingMovie) return;

    sphere.isPlayingMovie = true;

    // Track movie start time and angle for loop delay logic
    const movieStartTime = Date.now();
    const movieStartAngle = sphere.angle || 0;

    // Let auto-rotation continue during training movie - this gives a nice visual effect
    // where the sphere slowly rotates while epochs are playing
    // The animation loop handles rotation, training movie just updates point positions

    const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });
    const totalFrames = epochKeys.length;

    // Fixed duration per frame (1 second per frame at 1x speed) - total duration scales with frame count
    // This ensures smooth animation regardless of how many epochs we have
    // Playback speed: 1.0 = normal, 2.0 = 2x faster, 0.5 = half speed
    const playbackSpeed = sphere.playbackSpeed || 1.0;
    const fixedFrameDuration = 1000 / playbackSpeed; // Adjusted for playback speed

    // Either start from current position (for resume) or from beginning
    if (!startFromCurrent || sphere.currentEpoch === undefined) {
        sphere.currentEpoch = 0;
    } else {
        // When resuming, ensure we don't start past the last frame
        // (which would immediately trigger completion logic)
        sphere.currentEpoch = Math.min(sphere.currentEpoch, totalFrames - 1);
    }

    // Use requestAnimationFrame with time accumulation for smooth playback
    // This eliminates pauses caused by setTimeout jitter and computation overhead
    let lastFrameTime = performance.now();
    let accumulatedTime = fixedFrameDuration; // Start with enough time to trigger first frame immediately
    let lastProcessedEpoch = -1;

    const animate = (currentTime: number) => {
        if (!sphere.isPlayingMovie) return;

        // Accumulate time since last frame
        const deltaTime = currentTime - lastFrameTime;
        lastFrameTime = currentTime;
        accumulatedTime += deltaTime;

        // Recalculate frame duration in case playback speed changed
        const currentPlaybackSpeed = sphere.playbackSpeed || 1.0;
        const currentFrameDuration = 1000 / currentPlaybackSpeed;

        // Process frames if enough time has accumulated
        while (accumulatedTime >= currentFrameDuration && sphere.currentEpoch < totalFrames) {
            // Only update if we haven't already processed this epoch
            if (sphere.currentEpoch !== lastProcessedEpoch) {
                const currentEpochKey = epochKeys[sphere.currentEpoch];
                const epochData = sphere.trainingMovieData?.[currentEpochKey];

                // Check if this epoch has valid data before updating
                if (epochData && epochData.coords && epochData.coords.length > 0) {
                    update_training_movie_frame(sphere, currentEpochKey);
                }

                lastProcessedEpoch = sphere.currentEpoch;
            }

            // Increment epoch
            sphere.currentEpoch++;
            accumulatedTime -= currentFrameDuration;
        }

        // Check for completion
        if (sphere.currentEpoch >= totalFrames) {
            // Training complete - set final state
            const finalEpochKey = epochKeys[epochKeys.length - 1];
            update_training_movie_frame(sphere, finalEpochKey, true); // Force final state

            // Notify final frame
            if (sphere.frameUpdateCallback) {
                sphere.frameUpdateCallback({
                    current: totalFrames,
                    total: totalFrames,
                    visible: 12,
                    phase: 'complete'
                });
            }

            // Check if we should loop with physics effect
            if (sphere.autoLoopMovie) {
                // Wait for minimum time AND some rotation before starting physics reset
                const minWaitTime = 8000; // 8 seconds minimum
                const minRotation = Math.PI / 6; // 30 degrees - achievable with slow rotation

                const checkConditionsAndStart = () => {
                    // If movie was paused/stopped by user, abort the loop check
                    if (!sphere.autoLoopMovie || sphere._pausedByUser) {
                        sphere._autoLoopCheckRef = undefined;
                        return;
                    }

                    const elapsed = Date.now() - movieStartTime;
                    const currentAngle = sphere.angle || 0;
                    const rotated = Math.abs(currentAngle - movieStartAngle);

                    // Both conditions must be met (whichever takes longer)
                    const timeConditionMet = elapsed >= minWaitTime;
                    const rotationConditionMet = rotated >= minRotation;

                    if (timeConditionMet && rotationConditionMet) {
                        // Both conditions met - start physics
                        sphere._autoLoopCheckRef = undefined;
                        sphere.isPlayingMovie = false;
                        start_physics_reset_effect(sphere, onPhysicsComplete);
                    } else {
                        // Check again in 100ms - store the ref so we can cancel on pause
                        sphere._autoLoopCheckRef = setTimeout(checkConditionsAndStart, 100);
                    }
                };

                const onPhysicsComplete = () => {
                    // If user paused or auto-loop was disabled, don't restart
                    if (!sphere.autoLoopMovie || sphere._pausedByUser) {
                        return;
                    }

                    // Physics complete - restart movie from beginning
                    sphere.currentEpoch = 0;
                    sphere.isPlayingMovie = true;

                    // Notify restart
                    if (sphere.frameUpdateCallback) {
                        sphere.frameUpdateCallback({
                            current: 1,
                            total: totalFrames,
                            visible: 0,
                            phase: 'restarting'
                        });
                    }

                    // Immediately update to epoch 0 positions (don't wait)
                    const firstEpochKey = epochKeys[0];
                    update_training_movie_frame(sphere, firstEpochKey);

                    // Reset timing and restart animation loop
                    sphere.currentEpoch = 1;
                    lastProcessedEpoch = 0;
                    lastFrameTime = performance.now();
                    accumulatedTime = 0;
                    sphere.movieAnimationRef = requestAnimationFrame(animate);
                };

                // Start checking conditions
                checkConditionsAndStart();
                return;
            }

            // No loop - stop the movie, auto-rotation continues
            sphere.isPlayingMovie = false;

            // Fade out trails after a pregnant pause
            setTimeout(() => {
                fade_out_trails(sphere);
            }, 2000);
            return;
        }

        // Schedule next frame using requestAnimationFrame for smooth 60fps timing
        if (sphere.isPlayingMovie) {
            sphere.movieAnimationRef = requestAnimationFrame(animate);
        }
    };

    // Start immediately with requestAnimationFrame
    sphere.movieAnimationRef = requestAnimationFrame(animate);
}

export function stop_training_movie(sphere: SphereData) {
    sphere.isPlayingMovie = false;
    if (sphere.movieAnimationRef) {
        cancelAnimationFrame(sphere.movieAnimationRef);
        sphere.movieAnimationRef = 0;
    }

    // Cancel pending auto-loop check
    if (sphere._autoLoopCheckRef) {
        clearTimeout(sphere._autoLoopCheckRef);
        sphere._autoLoopCheckRef = undefined;
    }

    // Stop physics animation if running
    if (sphere.isPhysicsRunning && sphere.physicsAnimationRef) {
        cancelAnimationFrame(sphere.physicsAnimationRef);
        sphere.physicsAnimationRef = undefined;
        sphere.isPhysicsRunning = false;
    }

    // Stop any ongoing interpolation
    stop_point_interpolation(sphere);
}

export function pause_training_movie(sphere: SphereData) {
    sphere.isPlayingMovie = false;
    sphere._pausedByUser = true; // Flag to prevent auto-restart

    if (sphere.movieAnimationRef) {
        cancelAnimationFrame(sphere.movieAnimationRef);
        sphere.movieAnimationRef = 0;
    }

    // Cancel pending auto-loop check (prevents restart after pause)
    if (sphere._autoLoopCheckRef) {
        clearTimeout(sphere._autoLoopCheckRef);
        sphere._autoLoopCheckRef = undefined;
    }

    // Stop physics animation if running (prevents restart when physics completes)
    if (sphere.isPhysicsRunning && sphere.physicsAnimationRef) {
        cancelAnimationFrame(sphere.physicsAnimationRef);
        sphere.physicsAnimationRef = undefined;
        sphere.isPhysicsRunning = false;
    }
}

export function resume_training_movie(sphere: SphereData) {
    if (!sphere.trainingMovieData) {
        return;
    }

    if (sphere.isPlayingMovie) {
        return;
    }

    sphere._pausedByUser = false; // Clear pause flag on explicit resume

    // Resume from current epoch (don't reset to 0)
    play_training_movie(sphere, 10, true);
}

export function step_training_movie_frame(sphere: SphereData, direction: 'forward' | 'backward') {
    if (!sphere.trainingMovieData) {
        return;
    }

    // Pause if currently playing
    if (sphere.isPlayingMovie) {
        pause_training_movie(sphere);
    }
    
    const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });
    const currentIndex = sphere.currentEpoch || 0;
    const maxIndex = epochKeys.length - 1;
    
    let newIndex;
    if (direction === 'forward') {
        newIndex = Math.min(currentIndex + 1, maxIndex); // Don't wrap around
    } else {
        newIndex = Math.max(currentIndex - 1, 0); // Don't go below 0
    }
    
    sphere.currentEpoch = newIndex;
    const epochKey = epochKeys[newIndex];

    update_training_movie_frame(sphere, epochKey);
}

export function goto_training_movie_frame(sphere: SphereData, frameNumber: number) {
    if (!sphere.trainingMovieData) {
        return;
    }

    // Pause if currently playing
    if (sphere.isPlayingMovie) {
        pause_training_movie(sphere);
    }
    
    const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });
    const targetIndex = Math.max(0, Math.min(frameNumber - 1, epochKeys.length - 1)); // Convert 1-based to 0-based
    
    sphere.currentEpoch = targetIndex;
    const epochKey = epochKeys[targetIndex];

    update_training_movie_frame(sphere, epochKey);
}

// Smooth interpolation functions with velocity continuity
function start_point_interpolation(sphere: SphereData, targetPositions: Map<string, THREE.Vector3>, duration: number = 300) {
    // Initialize interpolation state
    sphere.pointTargetPositions = targetPositions;
    sphere.pointStartPositions = new Map();
    sphere.pointStartVelocities = sphere.pointStartVelocities || new Map();
    sphere.interpolationStartTime = Date.now();
    sphere.interpolationDuration = duration;
    sphere.isInterpolating = true;

    // Store current positions and calculate incoming velocities
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        sphere.pointStartPositions?.set(recordId, mesh.position.clone());

        // Use previous velocity if available, otherwise zero
        if (!sphere.pointStartVelocities?.has(recordId)) {
            sphere.pointStartVelocities?.set(recordId, new THREE.Vector3(0, 0, 0));
        }
    });

    // Start interpolation animation loop
    animate_interpolation(sphere);
}

// Hermite interpolation for smooth velocity-continuous motion
function hermiteInterpolate(p0: THREE.Vector3, v0: THREE.Vector3, p1: THREE.Vector3, v1: THREE.Vector3, t: number): THREE.Vector3 {
    // Hermite basis functions
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2*t3 - 3*t2 + 1;  // position at p0
    const h10 = t3 - 2*t2 + t;     // tangent at p0
    const h01 = -2*t3 + 3*t2;      // position at p1
    const h11 = t3 - t2;           // tangent at p1

    return new THREE.Vector3(
        h00 * p0.x + h10 * v0.x + h01 * p1.x + h11 * v1.x,
        h00 * p0.y + h10 * v0.y + h01 * p1.y + h11 * v1.y,
        h00 * p0.z + h10 * v0.z + h01 * p1.z + h11 * v1.z
    );
}

function animate_interpolation(sphere: SphereData) {
    if (!sphere.isInterpolating || !sphere.interpolationStartTime || !sphere.interpolationDuration) {
        return;
    }

    const elapsed = Date.now() - sphere.interpolationStartTime;
    const progress = Math.min(elapsed / sphere.interpolationDuration, 1.0);

    // Store progress for trail rendering
    sphere.interpolationProgress = progress;

    // Use LINEAR progress - no ease-in/out that would cause "stop-start" at epoch boundaries
    // The Hermite interpolation handles path smoothness; linear timing keeps constant speed
    const easedProgress = progress;

    // Update all point positions using Hermite interpolation for velocity continuity
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        const startPos = sphere.pointStartPositions?.get(recordId);
        const targetPos = sphere.pointTargetPositions?.get(recordId);
        const startVel = sphere.pointStartVelocities?.get(recordId);

        if (startPos && targetPos) {
            // Calculate the displacement for tangent scaling
            const displacement = new THREE.Vector3().subVectors(targetPos, startPos);
            const distance = displacement.length();

            // Scale incoming velocity to match the displacement magnitude
            // This prevents overshooting while maintaining direction continuity
            const inVel = startVel ? startVel.clone().multiplyScalar(distance * 0.5) : new THREE.Vector3(0, 0, 0);

            // Outgoing velocity points toward next target (we'll calculate properly at end)
            // For now, use displacement direction scaled down for smooth arrival
            const outVel = displacement.clone().multiplyScalar(0.5);

            // Use Hermite interpolation for smooth velocity-continuous motion
            const newPos = hermiteInterpolate(startPos, inVel, targetPos, outVel, easedProgress);
            // Project onto sphere surface so the point matches the trail tip
            // (trail renderer also projects each Hermite sample via normalize+scale)
            newPos.normalize().multiplyScalar(startPos.length());
            mesh.position.copy(newPos);

            // Sport mode: vary point size based on movement speed
            if (sphere.sportMode) {
                // Fast movers get bigger and brighter, slow movers shrink
                const baseSize = sphere.pointSize || 0.05;
                const speedFactor = Math.min(distance / 0.3, 1.0); // normalize to 0..1
                const scale = 0.6 + speedFactor * 1.8; // 0.6x to 2.4x base size
                mesh.scale.setScalar(scale);
                // Brighter for fast movers
                const mat = mesh.material;
                if (mat && 'emissive' in mat) {
                    const warmth = speedFactor * 0.4;
                    mat.emissive.setRGB(warmth, warmth * 0.5, 0);
                }
            }
        }
    });

    // Update memory trails during interpolation so arcs chase the points
    update_memory_trails(sphere);

    // Update convex hulls every frame for smooth animation (Graham scan is fast)
    if (sphere.showEmbeddingHull) {
        compute_embedding_convex_hull(sphere);
    }
    if (sphere.showConvexHulls) {
        compute_cluster_convex_hulls(sphere);
    }

    // Throttle great circles and spotlight to every 3 frames (more expensive)
    if (!sphere._hullAnimationCounter) sphere._hullAnimationCounter = 0;
    sphere._hullAnimationCounter++;
    if (sphere._hullAnimationCounter % 3 === 0) {
        if (sphere.showGreatCircles) {
            update_great_circles(sphere);
        }
        if (sphere.spotlightCluster !== undefined && sphere.spotlightCluster >= 0) {
            update_cluster_spotlight(sphere);
        }
    }

    // Re-render the sphere
    render_sphere(sphere);

    // Continue animation or finish
    if (progress < 1.0) {
        sphere.interpolationAnimationRef = requestAnimationFrame(() => animate_interpolation(sphere));
    } else {
        // Interpolation complete - calculate and store final velocities for next frame
        sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
            const startPos = sphere.pointStartPositions?.get(recordId);
            const targetPos = sphere.pointTargetPositions?.get(recordId);

            if (startPos && targetPos) {
                // Store normalized velocity direction for next interpolation
                const velocity = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
                sphere.pointStartVelocities?.set(recordId, velocity);
            }

            store_point_position_in_history(sphere, recordId, mesh.position);
        });

        // Final update of memory trails with new positions
        update_memory_trails(sphere);

        sphere.isInterpolating = false;
        sphere.pointTargetPositions = undefined;
        sphere.pointStartPositions = undefined;
        // Keep pointStartVelocities for next frame's continuity
    }
}

function stop_point_interpolation(sphere: SphereData) {
    if (sphere.interpolationAnimationRef) {
        cancelAnimationFrame(sphere.interpolationAnimationRef);
        sphere.interpolationAnimationRef = undefined;
    }

    // CRITICAL: Snap points to their final target positions before clearing state
    // This prevents any micro-jumps when starting the next interpolation
    if (sphere.pointTargetPositions && sphere.isInterpolating) {
        sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
            const targetPos = sphere.pointTargetPositions?.get(recordId);
            if (targetPos) {
                mesh.position.copy(targetPos);

                // Also store final velocity for next interpolation's continuity
                const startPos = sphere.pointStartPositions?.get(recordId);
                if (startPos) {
                    const velocity = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
                    sphere.pointStartVelocities?.set(recordId, velocity);
                }

                // Record the snapped position in trail history — without this,
                // trails always draw back to the initial position because
                // history only updated when interpolation naturally completes
                store_point_position_in_history(sphere, recordId, mesh.position);
            }
        });
    }

    sphere.isInterpolating = false;
    sphere.pointTargetPositions = undefined;
    sphere.pointStartPositions = undefined;
}

// Helper function to get the active cluster count key from finalClusterResults
// Uses the "best" cluster count (lowest score) if available, otherwise falls back to highest
export function get_active_cluster_count_key(sphere: SphereData): number | null {
    if (!sphere.finalClusterResults || Object.keys(sphere.finalClusterResults).length === 0) {
        return null;
    }
    
    // Find the cluster count key that has cluster_labels
    const clusterKeys = Object.keys(sphere.finalClusterResults)
        .map(k => parseInt(k))
        .filter(k => !isNaN(k) && sphere.finalClusterResults[k]?.cluster_labels);
    
    if (clusterKeys.length === 0) {
        return null;
    }
    
    // Try to find the best cluster count (lowest score)
    let bestClusterKey: number | null = null;
    let bestScore = Infinity;
    
    clusterKeys.forEach(k => {
        const clusterData = sphere.finalClusterResults[k];
        if (clusterData && typeof clusterData.score === 'number' && clusterData.score < bestScore) {
            bestScore = clusterData.score;
            bestClusterKey = k;
        }
    });
    
    // If we found a best cluster (with score), use it; otherwise fall back to highest
    if (bestClusterKey !== null) {
        return bestClusterKey;
    }
    
    // Fallback: use highest cluster count
    return Math.max(...clusterKeys);
}

function update_training_movie_frame(sphere: SphereData, epochKey: string, forceFinalState: boolean = false) {
    const epochData = sphere.trainingMovieData?.[epochKey];
    
    if (!epochData || !epochData.coords) {
        return;
    }
    
    if (epochData.coords.length === 0) {
        return;
    }
    
    // Calculate progressive cluster reveal
    const epochKeys = Object.keys(sphere.trainingMovieData || {}).sort((a, b) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });
    const currentFrameIndex = epochKeys.indexOf(epochKey);
    const totalFrames = epochKeys.length;
    
    // Get actual cluster count from real server data
    let maxClusters = 12; // Default fallback
    if (sphere.finalClusterResults && Object.keys(sphere.finalClusterResults).length > 0) {
        const clusterKeys = Object.keys(sphere.finalClusterResults).map(k => parseInt(k)).filter(k => !isNaN(k));
        if (clusterKeys.length > 0) {
            maxClusters = Math.max(...clusterKeys);
        }
    }
    
    // Progressive reveal based on REAL cluster count, not fake 12
    const progressRatio = totalFrames > 1 ? currentFrameIndex / (totalFrames - 1) : 0;
    const visibleClusters = forceFinalState ? maxClusters : Math.ceil(2 + (progressRatio * (maxClusters - 2)));
    
    
    
    // Progressive cluster reveal calculation
    
    // Call frame update callback if available
    if (sphere.frameUpdateCallback) {
        // Extract validation loss for current epoch if available
        let validationLoss: number | undefined;
        if (sphere.lossData && sphere.lossData.validation_loss && epochKey) {
            const lossEntry = sphere.lossData.validation_loss.find((entry: any) => 
                entry.epoch === parseInt(epochKey) || entry.epoch === epochKey
            );
            if (lossEntry && typeof lossEntry.value === 'number') {
                validationLoss = lossEntry.value;
            }
        }
        
        sphere.frameUpdateCallback({
            current: currentFrameIndex + 1,
            total: totalFrames,
            visible: visibleClusters,
            epoch: epochKey,
            validationLoss: validationLoss,
            sphereCoverage: sphere.boundsBoxVolumeUtilization
        });
    }
    
    // Loss plot cursor now handled by 2D screen overlay
    
    // Collect target positions for smooth interpolation
    const targetPositions = new Map<string, THREE.Vector3>();
    
    // Track bad data statistics for this frame
    let totalPoints = 0;
    let validPoints = 0;
    let invalidPoints = 0;
    
    // DEBUG: Check point processing

    if (sphere.pointObjectsByRecordID.size === 0) {
        // No points to process
        return;
    }
    
    // Update positions and colors of existing points
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        totalPoints++;
        const rowOffset = parseInt(recordId); // We used index as record ID

        if (rowOffset < epochData.coords.length) {
            const newCoords = epochData.coords[rowOffset];

            // Use helper function to extract coordinates from any format
            const extractedCoords = extractCoordinates(newCoords);

            if (extractedCoords) {
                const { x, y, z } = extractedCoords;
                const targetPos = new THREE.Vector3(x, y, z);

                // Store target position for smooth interpolation instead of direct movement
                targetPositions.set(recordId, targetPos);
                validPoints++;

                // Alpha by movement: transparent for large moves, opaque for small moves
                if (sphere.alphaByMovement) {
                    const currentPos = mesh.position;
                    const moveDistance = currentPos.distanceTo(targetPos);

                    // Map distance to alpha:
                    // distance >= π/2 (1.57) -> alpha = 0.1 (very transparent)
                    // distance = 0 -> alpha = 1.0 (fully opaque)
                    const maxDistance = Math.PI / 2; // ~1.57
                    const minAlpha = 0.1;
                    const maxAlpha = sphere.pointOpacity || 1.0;

                    // Clamp distance to [0, maxDistance] and invert for alpha
                    const normalizedDistance = Math.min(moveDistance, maxDistance) / maxDistance;
                    const alpha = maxAlpha - (normalizedDistance * (maxAlpha - minAlpha));

                    const mat = mesh.material as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial;
                    if (mat && 'opacity' in mat) {
                        mat.opacity = alpha;
                        mat.transparent = true;
                        mat.needsUpdate = true;
                    }
                }

                // Color based on visualization mode
                const record = sphere.pointRecordsByID.get(recordId);

                // Check if this record is manually selected (e.g., by search) - preserve its color
                if (sphere.selectedRecords && sphere.selectedRecords.has(recordId)) {
                    // Skip color update for manually selected records - preserve search/selection colors
                } else if (sphere.isManifoldViz) {
                    // MANIFOLD MODE: Use diverging red↔green color based on prob_positive
                    const probPositive = get_prob_positive_for_point(sphere, rowOffset, epochKey);
                    if (probPositive !== null) {
                        const manifoldColor = get_manifold_color(probPositive);
                        mesh.material.color.setHex(manifoldColor);
                        mesh.material.opacity = sphere.pointOpacity ?? 0.5;
                        mesh.material.needsUpdate = true;
                    }
                } else if (record) {
                    const clusterAssignment = get_cluster_assignment_for_point(sphere, record, epochKey);

                    // Only override color if we have a valid cluster assignment.
                    // If no cluster data is available (returns -1), keep existing color.
                    if (clusterAssignment >= 0) {
                        // Use spotlight-aware color function (will gray out non-spotlight members)
                        apply_point_color_with_spotlight(sphere, mesh, clusterAssignment);
                    }
                }
            } else {
                     // Invalid coordinates detected - provide detailed diagnosis
                     if (rowOffset < 5) { // Show more examples
                         let issues = [];
                         if (!newCoords) {
                             issues.push("coords is null/undefined");
                         } else if (typeof newCoords !== 'object') {
                             issues.push(`coords is not an object (${typeof newCoords})`);
                         } else {
                             // Check both array and object formats
                             if (Array.isArray(newCoords)) {
                                 if (newCoords.length < 3) issues.push(`array too short (length ${newCoords.length})`);
                                 if (typeof newCoords[0] !== 'number') issues.push(`x[0] is ${typeof newCoords[0]} (${newCoords[0]})`);
                                 else if (isNaN(newCoords[0])) issues.push(`x[0] is NaN`);
                                 
                                 if (typeof newCoords[1] !== 'number') issues.push(`y[1] is ${typeof newCoords[1]} (${newCoords[1]})`);
                                 else if (isNaN(newCoords[1])) issues.push(`y[1] is NaN`);
                                 
                                 if (typeof newCoords[2] !== 'number') issues.push(`z[2] is ${typeof newCoords[2]} (${newCoords[2]})`);
                                 else if (isNaN(newCoords[2])) issues.push(`z[2] is NaN`);
                             } else {
                                 // Object format
                                 if (typeof newCoords.x !== 'number') issues.push(`x is ${typeof newCoords.x} (${newCoords.x})`);
                                 else if (isNaN(newCoords.x)) issues.push(`x is NaN`);
                                 
                                 if (typeof newCoords.y !== 'number') issues.push(`y is ${typeof newCoords.y} (${newCoords.y})`);
                                 else if (isNaN(newCoords.y)) issues.push(`y is NaN`);
                                 
                                 if (typeof newCoords.z !== 'number') issues.push(`z is ${typeof newCoords.z} (${newCoords.z})`);
                                 else if (isNaN(newCoords.z)) issues.push(`z is NaN`);
                             }
                         }
                      }
                      invalidPoints++;
                  }
             }
         });
    
    // Report frame data quality statistics (removed verbose logging)
    
    // Update positions with smooth interpolation for fluid movement
    if (targetPositions.size > 0) {
        // Stop any current interpolation before starting new one
        stop_point_interpolation(sphere);
        
        // Start smooth interpolation to target positions
        // Calculate optimal interpolation duration based on frame timing
        // Fixed 1 second per frame at 1x speed (matches play_training_movie)
        const playbackSpeed = sphere.playbackSpeed || 1.0;
        const fixedFrameDuration = 1000 / playbackSpeed; // Adjusted for playback speed
        // Use full frame duration - the next interpolation will start when the timer fires,
        // and will smoothly continue from wherever this one ends
        const interpolationDuration = fixedFrameDuration;
        
        start_point_interpolation(sphere, targetPositions, interpolationDuration);
        
        // Smooth interpolation started
        // const epochKeys = Object.keys(sphere.trainingMovieData || {});
        // const frameDelay = (10 * 1000) / epochKeys.length;
        // const interpolationDuration = Math.max(50, frameDelay * 0.3);
        // start_point_interpolation(sphere, targetPositions, interpolationDuration);
    }
    
    // Update convex hulls if they are enabled
    if (sphere.showConvexHulls) {
        compute_cluster_convex_hulls(sphere);
    }

    // Update embedding hull if visible (per-cluster convex hulls with cluster colors)
    if (sphere.showEmbeddingHull) {
        compute_embedding_convex_hull(sphere);
    }

    // Update great circles if enabled
    if (sphere.showGreatCircles) {
        update_great_circles(sphere);
    }

    // Update bounds box if visible
    if (sphere.showBoundsBox) {
        update_bounds_box(sphere);
    }

    // Always calculate sphere coverage for UI display (even if bounds box hidden)
    calculate_sphere_coverage(sphere);

    // Always re-render to show the updates
    render_sphere(sphere);
}

function start_cluster_animation(sphere: SphereData) {
    if (!sphere.jsonData?.entire_cluster_results) {
        return;
    }

    const clusters = Object.keys(sphere.jsonData.entire_cluster_results).map(k => Number(k));
    const minCluster = Math.min(...clusters);
    const maxCluster = Math.max(...clusters);
    
    // Ensure we start with a valid cluster
    if (sphere.currentCluster < minCluster || sphere.currentCluster > maxCluster) {
        sphere.currentCluster = minCluster;
    }

    function animateClusters() {
        // Change cluster every 2 seconds
        change_cluster_count(sphere, sphere.jsonData, sphere.currentCluster.toString());
        notify_highlights_changed(sphere);
        render_sphere(sphere);
        
        // Move to next cluster
        sphere.currentCluster++;
        if (sphere.currentCluster > maxCluster) {
            sphere.currentCluster = minCluster;
        }
        
        sphere.clusterAnimationRef = window.setTimeout(animateClusters, 2000);
    }
    
    // Start immediately
    animateClusters();
}

function stop_cluster_animation(sphere: SphereData) {
    if (sphere.clusterAnimationRef) {
        clearTimeout(sphere.clusterAnimationRef);
        sphere.clusterAnimationRef = 0;
    }
}


// This is a very common event, so it's worth having a separate function for it
// that we can easily call from the UI components.
export function notify_highlights_changed(sphere: SphereData) {
    send_event(sphere, 'highlightedObjectChanged', {"detail": sphere.selectedRecords});
}


export function clear_colors(sphere: SphereData) {
    for (const record_id of sphere.pointRecordsByID.keys()) {
        change_object_color(sphere, record_id, GRAY);
    }
}

function createGreatCircleArc(start: THREE.Vector3, end: THREE.Vector3, segmentsHint: number = 16): THREE.Vector3[] {
    // Calculate great circle arc between two points on a sphere
    const points: THREE.Vector3[] = [];

    // Get the average radius to scale the arc
    const avgRadius = (start.length() + end.length()) / 2;

    // Normalize vectors to ensure they're on unit sphere
    const startNorm = start.clone().normalize();
    const endNorm = end.clone().normalize();

    // Calculate the angle between the vectors
    const angle = startNorm.angleTo(endNorm);

    // Calculate segments based on arc proportion: ~1 segment per 15 degrees (π/12 radians)
    // This ensures smooth curves proportional to the arc length
    const arcProportionalSegments = Math.max(2, Math.ceil(angle / (Math.PI / 12)));
    const segments = Math.min(arcProportionalSegments, 24); // Cap at 24 for performance

    // If points are very close, interpolate and project onto sphere surface
    if (angle < 0.01) {
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const point = new THREE.Vector3().lerpVectors(start, end, t);
            point.normalize().multiplyScalar(avgRadius);
            points.push(point);
        }
        return points;
    }
    
    // Use spherical linear interpolation (slerp) for smooth great circle arcs
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        
        // Spherical linear interpolation
        const point = new THREE.Vector3();
        if (Math.abs(angle) < 0.001) {
            // Linear interpolation for very small angles
            point.lerpVectors(startNorm, endNorm, t);
        } else {
            // Slerp for proper great circle
            const sinAngle = Math.sin(angle);
            const a = Math.sin((1 - t) * angle) / sinAngle;
            const b = Math.sin(t * angle) / sinAngle;
            
            point.copy(startNorm).multiplyScalar(a).addScaledVector(endNorm, b);
        }
        
        // Scale to average radius and add to points
        point.multiplyScalar(avgRadius);
        points.push(point);
    }
    
    return points;
}

export function create_memory_trails(sphere: SphereData) {
    // Remove existing trails if any
    if (sphere.memoryTrailsGroup) {
        sphere.scene.remove(sphere.memoryTrailsGroup);
        sphere.memoryTrailsGroup = undefined;
    }
    
    // Create group for memory trails
    sphere.memoryTrailsGroup = new THREE.Group();
    sphere.scene.add(sphere.memoryTrailsGroup);
    
    // Initialize position history map
    sphere.pointPositionHistory = new Map();
}

export function update_memory_trails(sphere: SphereData) {
    if (!sphere.memoryTrailsGroup || !sphere.pointPositionHistory) {
        return;
    }

    // Hide trails if trail length is 0
    if (sphere.memoryTrailLength === 0) {
        if (sphere.memoryTrailsGroup.visible) {
            sphere.memoryTrailsGroup.visible = false;
        }
        return;
    }

    // PERFORMANCE: Skip trail updates if disabled or if we have too many points
    const pointCount = sphere.pointObjectsByRecordID.size;
    if (pointCount > 1000) {
        // Too many points - trails will kill performance
        if (sphere.memoryTrailsGroup.visible) {
            sphere.memoryTrailsGroup.visible = false;
        }
        return;
    }

    // Ensure trails are visible
    if (!sphere.memoryTrailsGroup.visible) {
        sphere.memoryTrailsGroup.visible = true;
    }

    // Clear existing trail lines and sprites - dispose geometries and materials properly
    // Note: sprite textures (fire/smoke/glow) are cached singletons, do NOT dispose them here
    while (sphere.memoryTrailsGroup.children.length > 0) {
        const child = sphere.memoryTrailsGroup.children[0] as any;
        sphere.memoryTrailsGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach((m: any) => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    }

    // PERFORMANCE: Limit trail rendering - only show trails for subset of points
    const maxTrailPoints = Math.min(200, pointCount); // Max 200 points with trails
    let trailPointsRendered = 0;

    // Check if spotlight is active - get cluster assignment function
    const spotlightCluster = sphere.spotlightCluster;
    const hasSpotlight = spotlightCluster !== undefined && spotlightCluster >= 0;
    const activeClusterCountKey = hasSpotlight ? get_active_cluster_count_key(sphere) : null;

    // Create trails for each point
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        if (trailPointsRendered >= maxTrailPoints) return; // Skip excess points

        const history = sphere.pointPositionHistory?.get(recordId);
        if (!history || history.length < 2) return;

        trailPointsRendered++;

        // Check if this point is in the spotlight cluster
        let isSpotlightMember = !hasSpotlight; // If no spotlight, treat all as members
        if (hasSpotlight) {
            const record = sphere.pointRecordsByID.get(recordId);
            if (record) {
                let clusterAssignment = -1;
                if (activeClusterCountKey !== null && sphere.finalClusterResults?.[activeClusterCountKey]?.cluster_labels) {
                    const rowOffset = record.featrix_meta?.__featrix_row_offset;
                    if (rowOffset !== undefined && rowOffset < sphere.finalClusterResults[activeClusterCountKey].cluster_labels.length) {
                        clusterAssignment = sphere.finalClusterResults[activeClusterCountKey].cluster_labels[rowOffset];
                    }
                }
                isSpotlightMember = clusterAssignment === spotlightCluster;
            }
        }

        // Opacity multiplier and color for non-spotlight members (grayed out and heavily dimmed)
        const spotlightDimFactor = isSpotlightMember ? 1.0 : 0.25;
        const GRAY_COLOR = new THREE.Color(0x555555);

        // Get point color - use gray for non-spotlight members
        const pointColor = isSpotlightMember ? pointMesh.material.color : GRAY_COLOR;
        
        // Create trail segments based on configured trail length
        const trailLen = sphere.memoryTrailLength || 5;
        const maxSegments = Math.min(trailLen, history.length - 1);

        const livePos = pointMesh.position.clone();
        const startPos = history[0].clone();
        const currentMoveDistance = livePos.distanceTo(startPos);

        // Get interpolation progress (0 = just started, 1 = complete)
        const progress = sphere.interpolationProgress || 0;

        // Build trail waypoints: livePos → history[0] → history[1] → ...
        // All points are projected onto the sphere surface so arcs don't cut through the interior.
        const sphereRadius = startPos.length() || 1.0; // Use history[0]'s radius as reference
        const waypoints: THREE.Vector3[] = [];
        if (currentMoveDistance > 0.001) {
            waypoints.push(livePos.clone().normalize().multiplyScalar(sphereRadius));
        }
        for (let i = 0; i <= maxSegments; i++) {
            waypoints.push(history[i].clone().normalize().multiplyScalar(sphereRadius));
        }

        // Pre-compute distances for normalization
        const segDistances: number[] = [];
        for (let i = 0; i < waypoints.length - 1; i++) {
            segDistances.push(waypoints[i].distanceTo(waypoints[i + 1]));
        }
        const maxDistance = segDistances.length > 0 ? Math.max(...segDistances) : 0;
        const minDistance = segDistances.length > 0 ? Math.min(...segDistances) : 0;
        const distanceRange = maxDistance - minDistance;

        // Draw each segment between consecutive waypoints
        for (let i = 0; i < waypoints.length - 1; i++) {
            const segStart = waypoints[i];
            const segEnd = waypoints[i + 1];
            const distance = segDistances[i];
            if (distance < 0.0005) continue;

            // Age-based fade: segment 0 is newest (brightest), older segments fade
            const ageFactor = 0.8 - (i / Math.max(1, waypoints.length - 1)) * 0.7;

            // Distance-based alpha: longer segments are lighter
            let distanceAlpha;
            if (distanceRange > 0.001) {
                const normalizedDistance = Math.min(1, (distance - minDistance) / distanceRange);
                const exponentialFactor = Math.pow(normalizedDistance, 1.5);
                distanceAlpha = 0.5 - (exponentialFactor * 0.4);
            } else {
                distanceAlpha = 0.5;
            }

            let alpha = distanceAlpha * ageFactor * spotlightDimFactor;
            let segmentColor = pointColor.clone();

            // Bloom effect for newest segment: bright/oversaturated, ramping down
            // DISABLED: too distracting visually — keeping code for future use
            // if (i === 0) {
            //     const bloomIntensity = Math.pow(1.0 - progress, 2);
            //     alpha = Math.min(1.0, alpha + bloomIntensity * 0.5);
            //     segmentColor.lerp(new THREE.Color(1, 1, 1), bloomIntensity * 0.5);
            // }

            // Farewell bloom for oldest segment: briefly brightens before fading out
            // DISABLED: too distracting visually — keeping code for future use
            if (false && i === waypoints.length - 2 && waypoints.length > 2) {
                const farewellBloom = Math.pow(Math.sin(progress * Math.PI * 0.8), 2) * 0.5;
                alpha = Math.min(1.0, alpha + farewellBloom);
                segmentColor.lerp(new THREE.Color(1, 1, 1), farewellBloom * 0.3);
            }

            // For the active segment (i=0 with live position), trace the actual Hermite
            // interpolation path so the trail hugs the point's real trajectory.
            // For historical segments, use great circle arcs.
            // Generate arc points on the sphere surface.
            // For the active segment, sample the Hermite path then project onto the sphere.
            // For historical segments, use SLERP (great circle arcs stay on surface by construction).
            let segPoints: THREE.Vector3[];
            const isActiveSegment = i === 0 && currentMoveDistance > 0.001;
            if (isActiveSegment && sphere.isInterpolating && progress > 0.01) {
                const interpStart = sphere.pointStartPositions?.get(recordId);
                const interpTarget = sphere.pointTargetPositions?.get(recordId);
                const interpVel = sphere.pointStartVelocities?.get(recordId);
                if (interpStart && interpTarget) {
                    const displacement = new THREE.Vector3().subVectors(interpTarget, interpStart);
                    const dist = displacement.length();
                    const inVel = interpVel ? interpVel.clone().multiplyScalar(dist * 0.5) : new THREE.Vector3(0, 0, 0);
                    const outVel = displacement.clone().multiplyScalar(0.5);
                    // Sample the Hermite curve, project each point onto the sphere surface
                    const samples = Math.max(4, Math.ceil(progress * 12));
                    segPoints = [];
                    for (let s = samples; s >= 0; s--) {
                        const t = (s / samples) * progress;
                        const pt = hermiteInterpolate(interpStart, inVel, interpTarget, outVel, t);
                        // Project onto sphere surface
                        pt.normalize().multiplyScalar(sphereRadius);
                        segPoints.push(pt);
                    }
                } else {
                    segPoints = createGreatCircleArc(segStart, segEnd, 8);
                }
            } else {
                segPoints = createGreatCircleArc(segStart, segEnd, 8);
            }
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(segPoints);

            if (sphere.rocketMode) {
                // Rocket mode: dense smoke plume along arc — no guide line
                const smokeTex = getSmokeTexture();
                // More puffs for denser smoke, especially on newer segments
                const basePuffCount = Math.max(3, segPoints.length);
                // Newer segments (closer to rocket) get more puffs
                const densityBoost = i === 0 ? 2.0 : (i === 1 ? 1.5 : 1.0);
                const puffCount = Math.ceil(basePuffCount * densityBoost);

                for (let p = 0; p < puffCount; p++) {
                    // t=0 is near the rocket (start of segment), t=1 is the tail end
                    const t = p / Math.max(1, puffCount - 1);
                    // Interpolate position along arc segment
                    const idx = Math.min(Math.floor(t * (segPoints.length - 1)), segPoints.length - 1);
                    const nextIdx = Math.min(idx + 1, segPoints.length - 1);
                    const localT = (t * (segPoints.length - 1)) - idx;
                    const puffPos = segPoints[idx].clone().lerp(segPoints[nextIdx], localT);

                    // Jitter increases with distance from rocket (smoke disperses)
                    const dispersal = 0.003 + t * 0.012 + (1.0 - ageFactor) * 0.008;
                    puffPos.x += (Math.random() - 0.5) * dispersal;
                    puffPos.y += (Math.random() - 0.5) * dispersal;
                    puffPos.z += (Math.random() - 0.5) * dispersal;
                    puffPos.normalize().multiplyScalar(sphereRadius);

                    // Size: small near rocket, bigger further away (expanding plume)
                    const puffSize = 0.015 + t * 0.025 + (1.0 - ageFactor) * 0.015 + Math.random() * 0.01;
                    // Opacity: dense near rocket, fading toward tail
                    const proximityOpacity = 1.0 - t * 0.5;
                    const puffOpacity = Math.min(0.55, alpha * 1.5 * ageFactor * proximityOpacity) * spotlightDimFactor;
                    // Color: warmer near rocket (from flame), cooler gray further away
                    const warmth = Math.max(0, 1.0 - t * 1.5 - i * 0.3);
                    const r = 0.65 + warmth * 0.25 + Math.random() * 0.08;
                    const g = 0.62 + warmth * 0.1 + Math.random() * 0.06;
                    const b = 0.58 - warmth * 0.05 + Math.random() * 0.05;

                    const puffMat = new THREE.SpriteMaterial({
                        map: smokeTex,
                        transparent: true,
                        opacity: puffOpacity,
                        depthWrite: false,
                        blending: THREE.NormalBlending,
                        color: new THREE.Color(r, g, b),
                    });
                    const puffSprite = new THREE.Sprite(puffMat);
                    puffSprite.position.copy(puffPos);
                    puffSprite.scale.set(puffSize, puffSize, 1);
                    sphere.memoryTrailsGroup.add(puffSprite);
                }
            } else {
                // Normal mode: colored trail line
                const lineMaterial = new THREE.LineBasicMaterial({
                    color: segmentColor,
                    transparent: true,
                    opacity: alpha,
                    linewidth: 1
                });
                const line = new THREE.Line(lineGeometry, lineMaterial);
                sphere.memoryTrailsGroup.add(line);
            }
        }

        // Rocket mode: add sprite-based flame effects behind each moving point
        if (sphere.rocketMode && currentMoveDistance > 0.002) {
            const moveDir = new THREE.Vector3().subVectors(livePos, startPos).normalize();
            const fireTex = getFireTexture();
            const glowTex = getGlowTexture();

            // Main flame sprite (right behind the point)
            const flameOffset = 0.025 + Math.random() * 0.008;
            const flamePos = livePos.clone().addScaledVector(moveDir, -flameOffset);
            flamePos.normalize().multiplyScalar(sphereRadius);

            const flameMat = new THREE.SpriteMaterial({
                map: fireTex,
                transparent: true,
                opacity: 0.85,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                color: new THREE.Color(1.0, 0.95, 0.7),
            });
            const flameSprite = new THREE.Sprite(flameMat);
            flameSprite.position.copy(flamePos);
            const flameSize = 0.04 + Math.random() * 0.01;
            flameSprite.scale.set(flameSize, flameSize * 1.3, 1); // taller than wide
            sphere.memoryTrailsGroup.add(flameSprite);

            // Secondary flame (slightly further back, larger, more orange)
            const flame2Pos = livePos.clone().addScaledVector(moveDir, -(flameOffset + 0.015));
            flame2Pos.normalize().multiplyScalar(sphereRadius);
            const flame2Mat = new THREE.SpriteMaterial({
                map: fireTex,
                transparent: true,
                opacity: 0.6 + Math.random() * 0.15,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                color: new THREE.Color(1.0, 0.5 + Math.random() * 0.2, 0.1),
            });
            const flame2Sprite = new THREE.Sprite(flame2Mat);
            flame2Sprite.position.copy(flame2Pos);
            const flame2Size = 0.03 + Math.random() * 0.015;
            flame2Sprite.scale.set(flame2Size, flame2Size * 1.2, 1);
            sphere.memoryTrailsGroup.add(flame2Sprite);

            // Glow halo around the flame
            const glowPos = livePos.clone().addScaledVector(moveDir, -flameOffset * 0.5);
            glowPos.normalize().multiplyScalar(sphereRadius);
            const glowMat = new THREE.SpriteMaterial({
                map: glowTex,
                transparent: true,
                opacity: 0.35,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                color: new THREE.Color(1.0, 0.7, 0.2),
            });
            const glowSprite = new THREE.Sprite(glowMat);
            glowSprite.position.copy(glowPos);
            const glowSize = 0.06 + Math.random() * 0.02;
            glowSprite.scale.set(glowSize, glowSize, 1);
            sphere.memoryTrailsGroup.add(glowSprite);
        }
    });
}

export function store_point_position_in_history(sphere: SphereData, recordId: string, position: THREE.Vector3) {
    if (!sphere.pointPositionHistory) {
        sphere.pointPositionHistory = new Map();
    }

    let history = sphere.pointPositionHistory.get(recordId);
    if (!history) {
        history = [];
        sphere.pointPositionHistory.set(recordId, history);
    }

    // Add current position to front of history
    history.unshift(position.clone());

    // Keep only last N positions (current + configurable previous)
    const maxLength = (sphere.memoryTrailLength || 5) + 1; // +1 for current position
    if (history.length > maxLength) {
        history.splice(maxLength);
    }
}

// Trim all existing trail history to match current memoryTrailLength setting
// Call this when the user changes the trail length setting to immediately apply it
export function trim_trail_history(sphere: SphereData) {
    if (!sphere.pointPositionHistory) return;

    const maxLength = (sphere.memoryTrailLength || 5) + 1;
    sphere.pointPositionHistory.forEach((history) => {
        if (history.length > maxLength) {
            history.splice(maxLength);
        }
    });

    // Update trails immediately to reflect the change
    update_memory_trails(sphere);
}

// Fade out trails over ~1 second, then clear them
function fade_out_trails(sphere: SphereData) {
    if (!sphere.memoryTrailsGroup || sphere.memoryTrailsGroup.children.length === 0) return;

    const duration = 1000;
    const startTime = Date.now();

    const animateFade = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1.0);

        // Fade all trail children
        sphere.memoryTrailsGroup?.children.forEach((child: any) => {
            if (child.material) {
                child.material.opacity = child.material.opacity * (1.0 - t * 0.15);
            }
        });

        render_sphere(sphere);

        if (t < 1.0) {
            requestAnimationFrame(animateFade);
        } else {
            // Clear all trails and history
            if (sphere.memoryTrailsGroup) {
                while (sphere.memoryTrailsGroup.children.length > 0) {
                    const child = sphere.memoryTrailsGroup.children[0];
                    sphere.memoryTrailsGroup.remove(child);
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach((m: any) => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            }
            // Clear position history so trails don't reappear
            sphere.pointPositionHistory?.clear();
            render_sphere(sphere);
        }
    };

    requestAnimationFrame(animateFade);
}

export function create_3d_loss_plot(sphere: SphereData, lossData: any) {
    if (!lossData || !lossData.validation_loss || !Array.isArray(lossData.validation_loss)) {
        return;
    }
    
    // Loss plot is now 2D screen overlay - no 3D cleanup needed
    
    const lossArray = lossData.validation_loss;
    if (lossArray.length === 0) return;
    
    // Find min/max values for scaling
    const epochs = lossArray.map((d: any) => typeof d.epoch === 'string' ? parseInt(d.epoch) : d.epoch);
    const losses = lossArray.map((d: any) => d.value);
    const minEpoch = Math.min(...epochs);
    const maxEpoch = Math.max(...epochs);
    const minLoss = Math.min(...losses);
    const maxLoss = Math.max(...losses);
    
    // Create group for loss plot elements
    sphere.lossPlotGroup = new THREE.Group();
    
    // Position the plot above the sphere
    sphere.lossPlotGroup.position.set(0, 2.0, 0);
    sphere.lossPlotGroup.scale.set(1.2, 1.2, 1.2);
    
    // Create loss curve line
    const points: THREE.Vector3[] = [];
    const plotWidth = 3; // 3D world units
    const plotHeight = 1; // 3D world units
    
    lossArray.forEach((point: any) => {
        const epoch = typeof point.epoch === 'string' ? parseInt(point.epoch) : point.epoch;
        const x = -plotWidth/2 + ((epoch - minEpoch) / (maxEpoch - minEpoch)) * plotWidth;
        const y = ((point.value - minLoss) / (maxLoss - minLoss)) * plotHeight;
        const z = 0;
        points.push(new THREE.Vector3(x, y, z));
    });
    
    // Create line geometry and material
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ff88,
        linewidth: 2
    });
    
    sphere.lossPlotLine = new THREE.Line(lineGeometry, lineMaterial);
    sphere.lossPlotGroup.add(sphere.lossPlotLine);
    
    // Create vertical cursor line (will be positioned by update function)
    const cursorPoints = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, plotHeight, 0)
    ];
    const cursorGeometry = new THREE.BufferGeometry().setFromPoints(cursorPoints);
    const cursorMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff4444,
        linewidth: 3
    });
    sphere.lossPlotCursor = new THREE.Line(cursorGeometry, cursorMaterial);
    sphere.lossPlotGroup.add(sphere.lossPlotCursor);
    
    // Add the group to the scene
    sphere.scene.add(sphere.lossPlotGroup);
}

export function update_3d_loss_plot_cursor(sphere: SphereData, currentEpoch?: string) {
    if (!sphere.lossPlotCursor || !sphere.lossData || !currentEpoch) {
        return;
    }
    
    const lossArray = sphere.lossData.validation_loss;
    if (!lossArray || !Array.isArray(lossArray)) return;
    
    // Find current epoch data for positioning cursor
    const currentEpochNum = parseInt(currentEpoch);
    
    // Find min/max epochs for scaling (same as when creating)
    const epochs = lossArray.map((d: any) => typeof d.epoch === 'string' ? parseInt(d.epoch) : d.epoch);
    const minEpoch = Math.min(...epochs);
    const maxEpoch = Math.max(...epochs);
    
    const plotWidth = 3;
    const plotHeight = 1;
    
    // Calculate x position for cursor based on current epoch
    const x = -plotWidth/2 + ((currentEpochNum - minEpoch) / (maxEpoch - minEpoch)) * plotWidth;
    
    // Update cursor line position (vertical line from bottom to top of plot)
    const cursorPoints = [
        new THREE.Vector3(x, 0, 0),
        new THREE.Vector3(x, plotHeight, 0)
    ];
    
    sphere.lossPlotCursor.geometry.setFromPoints(cursorPoints);
}

export function clear_all_points(sphere: SphereData) {
 
    
    // Remove all point meshes from the scene
    sphere.pointObjectsByRecordID.forEach((mesh, recordId) => {
        sphere.scene.remove(mesh);
        // Also dispose of the geometry and material to free memory
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material && typeof mesh.material.dispose === 'function') {
            mesh.material.dispose();
        }
    });
    
    // Clear the tracking maps
    sphere.pointObjectsByRecordID.clear();
    sphere.pointRecordsByID.clear();
    sphere.selectedRecords.clear();
    
    // Loss plot is now 2D screen overlay - no 3D cleanup needed
    
    // Remove memory trails if they exist
    if (sphere.memoryTrailsGroup) {
        sphere.scene.remove(sphere.memoryTrailsGroup);
        sphere.memoryTrailsGroup = undefined;
    }
    
    // Clear position history
    if (sphere.pointPositionHistory) {
        sphere.pointPositionHistory.clear();
    }
    

}

export function add_new_embedding(sphere: SphereData, new_record: SphereRecord) {

    // const record_id = String(uuid4());
    // const new_record: SphereRecord = {
    //     coords: {
    //         x: new_coord[0],
    //         y: new_coord[1],
    //         z: new_coord[2],
    //     },
    //     id: record_id,
    //     featrix_meta: {
    //         cluster_pre: null,
    //         webgl_id: null,
    //         __featrix_row_id: null,
    //         __featrix_row_offset: null,
    //     },
    //     original: query,
    // }

    add_point_to_sphere(sphere, new_record);
    add_selected_record(sphere, new_record.id);
}



export function change_object_color(sphere: SphereData, record_id: string, color: string | number) {

    const object = sphere.pointObjectsByRecordID.get(record_id);
    if (object === undefined) {
        return;
    }

    // The object can have multiple materials. We don't deal with multiple materials.
    const has_multiple_materials = Array.isArray(object.material);
    if (has_multiple_materials) {
        return;
    }

    // Handle both MeshBasicMaterial and MeshPhongMaterial
    const mat = object.material as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial;
    if (mat && 'color' in mat) {
        mat.color.set(color);
        mat.needsUpdate = true;
    }
}

export function show_search_results(sphere: SphereData, searchResultRecords: SphereRecord[]) {

    clear_colors(sphere);
    clear_selected_objects(sphere);

    for (const record of searchResultRecords) {
        add_selected_record(sphere, record.id);
        change_object_color(sphere, record.id, RED);
    }
}


// ###########################################################################
// 
// MOUSE Events
// 
// ###########################################################################

const onMouseDown = (sphere: SphereData, event: MouseEvent) => {
    sphere.prevPos = { x: event.clientX, y: event.clientY };
    sphere.isDragging = true;
    sphere.firstPos = { x: event.clientX, y: event.clientY };

    // Pause animations while dragging
    sphere.wasPlayingMovieBeforeDrag = sphere.isPlayingMovie || false;
    sphere.wasAutoRotatingBeforeDrag = sphere.autoRotationEnabled || false;
    if (sphere.isPlayingMovie) {
        pause_training_movie(sphere);
    }
    sphere.autoRotationEnabled = false;
};


const onMouseMove = (sphere: SphereData, event: MouseEvent) => {
    const { left, top, width, height } = sphere.renderer.domElement.getBoundingClientRect();
    sphere.mouse.x = ((event.clientX - left) / width) * 2 - 1;
    sphere.mouse.y = -((event.clientY - top) / height) * 2 + 1;

    // Only allow drag rotation if rotation controls are enabled
    if (sphere.isDragging && sphere.rotationControlsEnabled) {

        const deltaX = event.clientX - sphere.prevPos.x;
        const deltaY = event.clientY - sphere.prevPos.y;
        sphere.angle -= deltaX * 0.005;
        sphere.verticalAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, sphere.verticalAngle + deltaY * 0.005));
        
        render_sphere(sphere);
    }
    
    sphere.prevPos = { x: event.clientX, y: event.clientY };
};


const onMouseUp = (sphere: SphereData, event: MouseEvent) => {
    sphere.isDragging = false;

    // Resume animations that were playing before drag
    if (sphere.wasPlayingMovieBeforeDrag) {
        resume_training_movie(sphere);
    }
    if (sphere.wasAutoRotatingBeforeDrag) {
        sphere.autoRotationEnabled = true;
    }
    sphere.wasPlayingMovieBeforeDrag = false;
    sphere.wasAutoRotatingBeforeDrag = false;

    const eventX = event.clientX;
    const eventY = event.clientY;
    const { left, top, width, height } = sphere.renderer.domElement.getBoundingClientRect();

    sphere.mouse.x = ((eventX - left) / width) * 2 - 1;
    sphere.mouse.y = -((eventY - top) / height) * 2 + 1;

    // The value of 5 is arbitrary, but it seems to work well in practice. There's some
    // slippage allowed when clicking but th down and up events have to be very
    // close together to trigger a selection.
    const distance = Math.hypot(eventX - sphere.firstPos.x, eventY - sphere.firstPos.y);
    if (distance < 5) {
        handle_mouse_highlight(sphere)
        notify_highlights_changed(sphere);
    }

    render_sphere(sphere)
};


// ###########################################################################
// 
// TOUCH Events
// 
// ###########################################################################

const onTouchStart = (sphere: SphereData, event: TouchEvent) => {
    event.preventDefault();

    // Pause animations while touching/dragging
    sphere.wasPlayingMovieBeforeDrag = sphere.isPlayingMovie || false;
    sphere.wasAutoRotatingBeforeDrag = sphere.autoRotationEnabled || false;
    if (sphere.isPlayingMovie) {
        pause_training_movie(sphere);
    }
    sphere.autoRotationEnabled = false;

    if (event.touches.length === 1) {
        const eventX = event.touches[0].clientX;
        const eventY = event.touches[0].clientY;

        sphere.isDragging = true;
        sphere.prevPos = { x: eventX, y: eventY };
        sphere.firstPos = { x: eventX, y: eventY };
    } else if (event.touches.length === 2) {
        sphere.prevPinchDistance = Math.hypot(
            event.touches[0].clientX - event.touches[1].clientX,
            event.touches[0].clientY - event.touches[1].clientY
        );
    }
};


const onTouchMove = (sphere: SphereData, event: TouchEvent) => {
    event.preventDefault();

    if (event.touches.length === 1 && sphere.isDragging) {
        const eventX = event.touches[0].clientX;
        const eventY = event.touches[0].clientY;

        const deltaX = eventX - sphere.prevPos.x;
        const deltaY = eventY - sphere.prevPos.y;

        sphere.angle -= deltaX * 0.005;
        sphere.verticalAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, sphere.verticalAngle + deltaY * 0.005));

        sphere.prevPos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    } else if (event.touches.length === 2 && sphere.prevPinchDistance !== null) {
        const pinchDistance = Math.hypot(
            event.touches[0].clientX - event.touches[1].clientX,
            event.touches[0].clientY - event.touches[1].clientY
        );

        const pinchDelta = pinchDistance - sphere.prevPinchDistance;
        if (Math.abs(pinchDelta) > 1) { // Dead zone to prevent jitter
            zoom_sphere(sphere, pinchDelta > 0, Math.abs(pinchDelta));
        }

        sphere.prevPinchDistance = pinchDistance;
    }

    render_sphere(sphere)
};


const onTouchEnd = (sphere: SphereData, event: TouchEvent) => {
    sphere.isDragging = false;
    sphere.prevPinchDistance = null;

    // Resume animations that were playing before touch
    if (sphere.wasPlayingMovieBeforeDrag) {
        resume_training_movie(sphere);
    }
    if (sphere.wasAutoRotatingBeforeDrag) {
        sphere.autoRotationEnabled = true;
    }
    sphere.wasPlayingMovieBeforeDrag = false;
    sphere.wasAutoRotatingBeforeDrag = false;

    if (event.changedTouches.length === 1 && event.touches.length === 0) {
        const eventX = event.changedTouches[0].clientX;
        const eventY = event.changedTouches[0].clientY;

        const { left, top, width, height } = sphere.renderer.domElement.getBoundingClientRect();
        sphere.mouse.x = ((eventX - left) / width) * 2 - 1;
        sphere.mouse.y = -((eventY - top) / height) * 2 + 1;

        const distance = Math.hypot(eventX - sphere.firstPos.x, eventY - sphere.firstPos.y);
        if (distance < 5) {
            handle_mouse_highlight(sphere)
            notify_highlights_changed(sphere);
            // Notify React layer so mobile tap can toggle playback controls
            send_event(sphere, 'backgroundTap', {});
        }

        render_sphere(sphere)
    }
};


// ###########################################################################
// 
// OTHER Events
// 
// ###########################################################################

const onScroll = (sphere: SphereData, event: WheelEvent) => {
    event.preventDefault();

    if (event.deltaY < 0) {
        zoom_sphere(sphere, true);
    } else {
        zoom_sphere(sphere, false);
    }

    render_sphere(sphere);
};


const onResize = (sphere: SphereData) => {
    fit_sphere_to_container(sphere);
    render_sphere(sphere);
}


// ###########################################################################
// 
// EVENT system
// 
// ###########################################################################

  
export function register_event_listener(sphere: SphereData, event_name: string, callback: any): () => void {
    // If no listeners for the event have been registered yet, create a new Map.
    if (!sphere.event_listeners[event_name]) {
        sphere.event_listeners[event_name] = new Map<string, any>();
    }

    const listener_id = uuid4();
    sphere.event_listeners[event_name].set(listener_id, callback);

    return () => {
        remove_event_listener(sphere, event_name, listener_id);
    };
}


export function remove_event_listener(sphere: SphereData, event_name: string, listener_id: string) {
    if (sphere.event_listeners[event_name]) {
        sphere.event_listeners[event_name].delete(listener_id);

        // If there are no more listeners for the event, delete the event key.
        if (sphere.event_listeners[event_name].size === 0) {
            delete sphere.event_listeners[event_name];
        }
    }
}


export function send_event(sphere: SphereData, event_name: string, event: any) {
    if (sphere.event_listeners[event_name]) {
        for (const callback of sphere.event_listeners[event_name].values()) {
            callback(event);
        }
    }
}


// ###########################################################################
// 
// OBJECT selection
// 
// ###########################################################################

function get_object_color(object: THREE.Mesh): THREE.Color | null {
    const mat = object.material as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial;
    if (mat && 'color' in mat) {
        return mat.color;
    }
    return null;
}

export function get_object_color_string(object: THREE.Mesh): string | null {
    const color = get_object_color(object);
    
    return color !== null ? `#${color.getHexString()}` : null;
}

export function add_selected_record(sphere: SphereData, record_id: string) {
    const object = sphere.pointObjectsByRecordID.get(record_id)
    if (object === undefined) {
        return;
    }
    
    sphere.selectedRecords.add(record_id);

    // Save the object's original color
    object.userData.originalColor = get_object_color(object)?.getHex();
    
    // Change the color of the object to the selected color
    change_object_color(sphere, record_id, BLACK)
    object.scale.set(1.5, 1.5, 1.5);
}


export function remove_selected_record(sphere: SphereData, record_id: string ) {

    const object = sphere.pointObjectsByRecordID.get(record_id)
    if (object === undefined) {
        return;
    }
   
    sphere.selectedRecords.delete(record_id);
    
    // Change the color of the object back to the original color
    change_object_color(sphere, record_id, object.userData.originalColor);
    object.scale.set(1, 1, 1);
}


export function clear_selected_objects(sphere: SphereData) {
    // Use a copy of the set to avoid modifying the set while iterating over it.
    for (const record_id of [...sphere.selectedRecords]) {
        remove_selected_record(sphere, record_id);
    }
}


function handle_mouse_highlight(sphere: SphereData) {

    sphere.raycaster.setFromCamera(sphere.mouse, sphere.camera);

    const intersects = sphere.raycaster.intersectObjects(sphere.scene.children, true)
        .filter((obj: any) => obj.object.geometry instanceof THREE.SphereGeometry);
   
    if (intersects.length > 0) {
        const closestObject = intersects[0].object;

        // Check if the object corresponds to a data record.
        const record_id = closestObject.userData.record_id;
        if (record_id === undefined) {
            return;
        }

        // Send point inspection event with detailed info
        const record = sphere.pointRecordsByID.get(record_id);
        const pointInfo: any = {
            recordId: record_id,
            rowOffset: record?.featrix_meta?.__featrix_row_offset || 'unknown',
            clusterId: 'unknown',
            color: `#${closestObject.material?.color?.getHex()?.toString(16).padStart(6, '0') || '000000'}`,
            position: `(${closestObject.position.x.toFixed(2)}, ${closestObject.position.y.toFixed(2)}, ${closestObject.position.z.toFixed(2)})`
        };

        // Get cluster assignment from final results if available
        const activeClusterKey = get_active_cluster_count_key(sphere);
        if (activeClusterKey !== null && sphere.finalClusterResults[activeClusterKey]?.cluster_labels) {
            const rowOffset = record?.featrix_meta?.__featrix_row_offset;
            if (rowOffset !== undefined && rowOffset < sphere.finalClusterResults[activeClusterKey].cluster_labels.length) {
                pointInfo.clusterId = sphere.finalClusterResults[activeClusterKey].cluster_labels[rowOffset];
            }
        }

        // Include the actual original data for this point
        if (record?.original) {
            pointInfo.data = record.original;
        }

        send_event(sphere, 'pointInspected', { detail: pointInfo });

        const object_is_selected = sphere.selectedRecords.has(record_id);
        if (object_is_selected) {
            // If the closest object is already selected, then unselect it.
            remove_selected_record(sphere, record_id);
        } else {
            // If the closest object is not already selected, then select it.
            add_selected_record(sphere, record_id);
        }
    }
}

// ============================================================================
// CONVEX HULL FUNCTIONS
// ============================================================================

/**
 * Normalize a point to the unit sphere surface (r=1)
 */
function normalize_to_sphere_surface(point: THREE.Vector3): THREE.Vector3 {
    return point.clone().normalize();
}

/**
 * Normalize an array of points to the unit sphere surface
 */
function normalize_points_to_sphere_surface(points: THREE.Vector3[]): THREE.Vector3[] {
    return points.map(p => normalize_to_sphere_surface(p));
}

/**
 * Compute spherical convex hull on the unit sphere surface
 * Projects points to 2D tangent plane, computes 2D convex hull, returns ordered boundary points
 */
function compute_spherical_convex_hull(points: THREE.Vector3[]): THREE.Vector3[] {
    if (points.length < 3) return points;

    // Normalize all points to sphere surface
    const normalizedPoints = normalize_points_to_sphere_surface(points);

    if (normalizedPoints.length < 4) {
        return normalizedPoints;
    }

    // Compute centroid on sphere (average direction)
    const centroid = new THREE.Vector3();
    normalizedPoints.forEach(p => centroid.add(p));
    centroid.normalize();

    // Create orthonormal basis for tangent plane at centroid
    // Find a vector not parallel to centroid
    const up = Math.abs(centroid.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangentU = new THREE.Vector3().crossVectors(centroid, up).normalize();
    const tangentV = new THREE.Vector3().crossVectors(centroid, tangentU).normalize();

    // Project all points to 2D tangent plane coordinates
    const points2D: { x: number, y: number, point3D: THREE.Vector3, index: number }[] = [];
    normalizedPoints.forEach((p, index) => {
        // Project onto tangent plane (relative to centroid)
        const diff = new THREE.Vector3().subVectors(p, centroid);
        const x = diff.dot(tangentU);
        const y = diff.dot(tangentV);
        points2D.push({ x, y, point3D: p, index });
    });

    // Compute 2D convex hull using Graham scan algorithm
    const hull2D = grahamScan2D(points2D);

    // Return the 3D points in hull order (already sorted counterclockwise)
    return hull2D.map(p => p.point3D);
}

/**
 * Graham scan algorithm for 2D convex hull
 * Returns points in counterclockwise order
 */
function grahamScan2D(points: { x: number, y: number, point3D: THREE.Vector3, index: number }[]): typeof points {
    if (points.length < 3) return points;

    // Find the bottom-most point (lowest y, then lowest x as tiebreaker)
    let pivot = points[0];
    for (const p of points) {
        if (p.y < pivot.y || (p.y === pivot.y && p.x < pivot.x)) {
            pivot = p;
        }
    }

    // Sort points by polar angle with respect to pivot
    const sorted = points
        .filter(p => p !== pivot)
        .map(p => ({
            ...p,
            angle: Math.atan2(p.y - pivot.y, p.x - pivot.x),
            dist: Math.hypot(p.x - pivot.x, p.y - pivot.y)
        }))
        .sort((a, b) => {
            if (Math.abs(a.angle - b.angle) < 1e-10) {
                return a.dist - b.dist; // Same angle: closer point first
            }
            return a.angle - b.angle;
        });

    // Graham scan: build hull
    const hull: typeof points = [pivot];

    for (const p of sorted) {
        // Remove points that make clockwise turn
        while (hull.length >= 2 && crossProduct2D(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
            hull.pop();
        }
        hull.push(p);
    }

    return hull;
}

/**
 * 2D cross product for determining turn direction
 * Returns positive for counterclockwise, negative for clockwise, 0 for collinear
 */
function crossProduct2D(
    o: { x: number, y: number },
    a: { x: number, y: number },
    b: { x: number, y: number }
): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Subdivide a triangle on the sphere surface by creating intermediate points along edges
 * This ensures the triangle follows the sphere curvature instead of cutting through it
 */
function subdivide_spherical_triangle(v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3, subdivisions: number = 2): THREE.Vector3[] {
    const vertices: THREE.Vector3[] = [];
    
    // Normalize all vertices to sphere surface
    const p0 = normalize_to_sphere_surface(v0);
    const p1 = normalize_to_sphere_surface(v1);
    const p2 = normalize_to_sphere_surface(v2);
    
    // Create subdivided triangle using spherical interpolation
    for (let i = 0; i <= subdivisions; i++) {
        for (let j = 0; j <= subdivisions - i; j++) {
            const k = subdivisions - i - j;
            
            // Barycentric coordinates
            const u = i / subdivisions;
            const v = j / subdivisions;
            const w = k / subdivisions;
            
            // Spherical interpolation (slerp) to stay on sphere surface
            // Interpolate along edges first, then across
            let point = new THREE.Vector3();
            
            if (u === 0) {
                // On edge v1-v2
                const t = v / (v + w);
                const angle = p1.angleTo(p2);
                if (angle > 0.001) {
                    const sinAngle = Math.sin(angle);
                    const a = Math.sin((1 - t) * angle) / sinAngle;
                    const b = Math.sin(t * angle) / sinAngle;
                    point.copy(p1).multiplyScalar(a).addScaledVector(p2, b);
                } else {
                    point.lerpVectors(p1, p2, t);
                }
            } else if (v === 0) {
                // On edge v0-v2
                const t = u / (u + w);
                const angle = p0.angleTo(p2);
                if (angle > 0.001) {
                    const sinAngle = Math.sin(angle);
                    const a = Math.sin((1 - t) * angle) / sinAngle;
                    const b = Math.sin(t * angle) / sinAngle;
                    point.copy(p0).multiplyScalar(a).addScaledVector(p2, b);
                } else {
                    point.lerpVectors(p0, p2, t);
                }
            } else if (w === 0) {
                // On edge v0-v1
                const t = u / (u + v);
                const angle = p0.angleTo(p1);
                if (angle > 0.001) {
                    const sinAngle = Math.sin(angle);
                    const a = Math.sin((1 - t) * angle) / sinAngle;
                    const b = Math.sin(t * angle) / sinAngle;
                    point.copy(p0).multiplyScalar(a).addScaledVector(p1, b);
                } else {
                    point.lerpVectors(p0, p1, t);
                }
            } else {
                // Interior point - interpolate across triangle
                // First interpolate along v0-v1 edge
                const t01 = u / (u + v);
                const angle01 = p0.angleTo(p1);
                let edge01: THREE.Vector3;
                if (angle01 > 0.001) {
                    const sinAngle01 = Math.sin(angle01);
                    const a01 = Math.sin((1 - t01) * angle01) / sinAngle01;
                    const b01 = Math.sin(t01 * angle01) / sinAngle01;
                    edge01 = new THREE.Vector3().copy(p0).multiplyScalar(a01).addScaledVector(p1, b01);
                } else {
                    edge01 = new THREE.Vector3().lerpVectors(p0, p1, t01);
                }
                edge01.normalize();
                
                // Then interpolate from edge01 to v2
                const t02 = (u + v) / subdivisions;
                const angle02 = edge01.angleTo(p2);
                if (angle02 > 0.001) {
                    const sinAngle02 = Math.sin(angle02);
                    const a02 = Math.sin((1 - t02) * angle02) / sinAngle02;
                    const b02 = Math.sin(t02 * angle02) / sinAngle02;
                    point.copy(edge01).multiplyScalar(a02).addScaledVector(p2, b02);
                } else {
                    point.lerpVectors(edge01, p2, t02);
                }
            }
            
            // Ensure point is on sphere surface
            point.normalize();
            vertices.push(point);
        }
    }
    
    return vertices;
}

/**
 * Create a surface mesh geometry on the unit sphere from hull points
 * This creates a triangulated surface that follows the sphere surface by subdividing triangles
 */
// Calculate adaptive subdivision level based on the longest edge arc length
function calculate_adaptive_subdivisions(v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3): number {
    // Calculate arc lengths (angles in radians) for each edge
    const arc01 = v0.angleTo(v1);
    const arc12 = v1.angleTo(v2);
    const arc20 = v2.angleTo(v0);
    const maxArc = Math.max(arc01, arc12, arc20);

    // Target: roughly 0.15 radians (~8.5 degrees) per segment for smooth curves
    // Min 2 subdivisions, max 12 to prevent excessive vertices
    const targetRadiansPerSegment = 0.15;
    const subdivisions = Math.min(12, Math.max(2, Math.ceil(maxArc / targetRadiansPerSegment)));

    return subdivisions;
}

function create_spherical_hull_geometry(hullPoints: THREE.Vector3[]): THREE.BufferGeometry | null {
    if (hullPoints.length < 3) return null;

    // Normalize all points to sphere surface
    const normalizedPoints = normalize_points_to_sphere_surface(hullPoints);

    try {
        const numPoints = normalizedPoints.length;

        // Compute centroid of hull points (on sphere surface)
        const centroid = new THREE.Vector3();
        normalizedPoints.forEach(p => centroid.add(p));
        centroid.divideScalar(numPoints);
        centroid.normalize(); // Project back to sphere surface

        // Start with fan triangles from centroid to hull edges
        // Each triangle is [centroid, hullPoint[i], hullPoint[i+1]]
        let triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
        for (let i = 0; i < numPoints; i++) {
            const curr = normalizedPoints[i];
            const next = normalizedPoints[(i + 1) % numPoints];
            triangles.push([centroid.clone(), curr.clone(), next.clone()]);
        }

        // Subdivide triangles to conform to sphere surface
        // Each subdivision: split each triangle into 4 smaller ones, normalize midpoints
        const subdivisions = 3; // More subdivisions = smoother sphere conformance
        for (let s = 0; s < subdivisions; s++) {
            const newTriangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
            for (const [a, b, c] of triangles) {
                // Compute midpoints and normalize to sphere surface
                const ab = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).normalize();
                const bc = new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5).normalize();
                const ca = new THREE.Vector3().addVectors(c, a).multiplyScalar(0.5).normalize();

                // Split into 4 triangles
                newTriangles.push([a.clone(), ab.clone(), ca.clone()]);
                newTriangles.push([ab.clone(), b.clone(), bc.clone()]);
                newTriangles.push([ca.clone(), bc.clone(), c.clone()]);
                newTriangles.push([ab.clone(), bc.clone(), ca.clone()]);
            }
            triangles = newTriangles;
        }

        // Build geometry from triangles
        const geometry = new THREE.BufferGeometry();
        const vertices: number[] = [];
        const indices: number[] = [];
        const vertexMap = new Map<string, number>(); // Deduplicate vertices

        const getVertexIndex = (v: THREE.Vector3): number => {
            // Round to avoid floating point key issues
            const key = `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
            if (vertexMap.has(key)) {
                return vertexMap.get(key)!;
            }
            const idx = vertices.length / 3;
            vertices.push(v.x, v.y, v.z);
            vertexMap.set(key, idx);
            return idx;
        };

        for (const [a, b, c] of triangles) {
            const ia = getVertexIndex(a);
            const ib = getVertexIndex(b);
            const ic = getVertexIndex(c);
            indices.push(ia, ib, ic);
        }

        // Set geometry data
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        return geometry;
    } catch (error) {
        // Spherical hull geometry creation failed
        return null;
    }
}

export function show_convex_hulls(sphere: SphereData) {
    if (!sphere) {
        // No sphere provided
        return;
    }
    
    // Create convex hulls group if it doesn't exist
    if (!sphere.convexHullsGroup) {
        sphere.convexHullsGroup = new THREE.Group();
        sphere.scene.add(sphere.convexHullsGroup);
    }
    
    // Set flag and compute hulls
    sphere.showConvexHulls = true;
    compute_cluster_convex_hulls(sphere);
}

export function hide_convex_hulls(sphere: SphereData) {
    if (!sphere) return;
    
    sphere.showConvexHulls = false;
    
    // Clear existing convex hulls
    if (sphere.convexHullsGroup) {
        while (sphere.convexHullsGroup.children.length > 0) {
            const child = sphere.convexHullsGroup.children[0];
            sphere.convexHullsGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
    }
}

// Calculate sphere coverage from current point positions (can be called even without bounds box visible)
function calculate_sphere_coverage(sphere: SphereData): number {
    if (!sphere || sphere.pointObjectsByRecordID.size === 0) {
        return 0;
    }

    // Calculate bounding box from all current point positions
    const box = new THREE.Box3();
    sphere.pointObjectsByRecordID.forEach((mesh) => {
        box.expandByPoint(mesh.position);
    });

    const boxSize = box.getSize(new THREE.Vector3());

    // Calculate percentage of unit sphere covered by bounding box
    const unitSphereRadius = 1.0;
    const boundingBoxRadius = Math.max(boxSize.x, boxSize.y, boxSize.z) / 2.0;
    const sphereCoveragePercent = boundingBoxRadius > 0
        ? (boundingBoxRadius / unitSphereRadius) * 100
        : 0;

    sphere.boundsBoxVolumeUtilization = sphereCoveragePercent;
    return sphereCoveragePercent;
}

function update_bounds_box(sphere: SphereData) {
    if (!sphere || !sphere.showBoundsBox || !sphere.boundsBox) return;

    // Calculate bounding box from all current point positions
    const points: THREE.Vector3[] = [];
    sphere.pointObjectsByRecordID.forEach((mesh) => {
        points.push(mesh.position);
    });

    if (points.length === 0) {
        return;
    }

    // Create a bounding box from points
    const box = new THREE.Box3();
    points.forEach(point => box.expandByPoint(point));

    const boxSize = box.getSize(new THREE.Vector3());
    const boxCenter = box.getCenter(new THREE.Vector3());

    // Calculate coverage (also updates sphere.boundsBoxVolumeUtilization)
    calculate_sphere_coverage(sphere);

    // Update existing bounds box geometry and position
    if (sphere.boundsBox.geometry) {
        sphere.boundsBox.geometry.dispose();
    }

    const boxGeometry = new THREE.BoxGeometry(boxSize.x, boxSize.y, boxSize.z);
    const boxEdges = new THREE.EdgesGeometry(boxGeometry);
    sphere.boundsBox.geometry = boxEdges;
    sphere.boundsBox.position.copy(boxCenter);
}

export function toggle_bounds_box(sphere: SphereData, show: boolean) {
    if (!sphere) return;
    
    sphere.showBoundsBox = show;
    
    if (show) {
        // Create or show bounds box
        if (!sphere.boundsBox) {
            // Calculate bounding box from all points
            const points: THREE.Vector3[] = [];
            sphere.pointObjectsByRecordID.forEach((mesh) => {
                points.push(mesh.position);
            });
            
            if (points.length === 0) {
                return;
            }
            
            // Create a bounding box from points
            const box = new THREE.Box3();
            points.forEach(point => box.expandByPoint(point));
            
            // Create a group to hold the box helper
            const boxSize = box.getSize(new THREE.Vector3());
            const boxCenter = box.getCenter(new THREE.Vector3());
            
            // Create a box geometry at the center
            const boxGeometry = new THREE.BoxGeometry(boxSize.x, boxSize.y, boxSize.z);
            const boxMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
            const boxEdges = new THREE.EdgesGeometry(boxGeometry);
            const boxLines = new THREE.LineSegments(boxEdges, boxMaterial);
            boxLines.position.copy(boxCenter);
            
            sphere.boundsBox = boxLines;
            sphere.scene.add(boxLines);
        } else {
            // Show existing bounds box
            if (sphere.boundsBox.parent === null) {
                sphere.scene.add(sphere.boundsBox);
            }
            sphere.boundsBox.visible = true;
            // Update bounds box to current point positions
            update_bounds_box(sphere);
        }
        
        // Create or show unit sphere cube (2x2x2 cube representing unit sphere bounds)
        if (!sphere.unitSphereCube) {
            // Unit sphere has radius 1, so cube should be 2x2x2 (diameter = 2)
            const cubeSize = 2.0;
            const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
            const cubeMaterial = new THREE.LineBasicMaterial({ 
                color: 0x00ffff, 
                linewidth: 1,
                transparent: true,
                opacity: 0.5
            });
            const cubeEdges = new THREE.EdgesGeometry(cubeGeometry);
            const cubeLines = new THREE.LineSegments(cubeEdges, cubeMaterial);
            cubeLines.position.set(0, 0, 0); // Center at origin
            
            sphere.unitSphereCube = cubeLines;
            sphere.scene.add(cubeLines);
        } else {
            // Show existing unit sphere cube
            if (sphere.unitSphereCube.parent === null) {
                sphere.scene.add(sphere.unitSphereCube);
            }
            sphere.unitSphereCube.visible = true;
        }
    } else {
        // Hide bounds box
        if (sphere.boundsBox) {
            sphere.boundsBox.visible = false;
        }
        // Hide unit sphere cube
        if (sphere.unitSphereCube) {
            sphere.unitSphereCube.visible = false;
        }
    }
    
    render_sphere(sphere);
}

export function create_unit_sphere(sphere: SphereData) {
    if (!sphere || sphere.unitSphere) return; // Already created
    
    // Create a wireframe sphere at radius 1.0 (unit sphere) with very light alpha
    const sphereGeometry = new THREE.SphereGeometry(1.0, 32, 32);
    const sphereMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ffff, 
        linewidth: 1,
        transparent: true,
        opacity: 0.05 // Very light alpha
    });
    const sphereEdges = new THREE.EdgesGeometry(sphereGeometry);
    const sphereLines = new THREE.LineSegments(sphereEdges, sphereMaterial);
    sphereLines.position.set(0, 0, 0); // Center at origin
    
    sphere.unitSphere = sphereLines;
    sphere.scene.add(sphereLines);
}

export function compute_cluster_convex_hulls(sphere: SphereData) {
    const hasPointFeature = sphere.showDynamicPoints;
    const hasHullFeature = sphere.showDynamicHulls;

    // Always handle cleanup even when both features are off
    if (!hasPointFeature) {
        reset_point_sizes_to_default(sphere);
    }
    if (!hasHullFeature) {
        hide_convex_hulls(sphere);
    }

    if (!hasPointFeature && !hasHullFeature) {
        return;
    }

    if (!sphere.pointPositionHistory) {
        return;
    }

    // Update individual point sizes if enabled
    if (hasPointFeature) {
        update_dynamic_point_sizes(sphere);
    }

    // Create dynamic cluster hulls if enabled
    if (hasHullFeature) {
        create_dynamic_cluster_hulls(sphere);
    }
}

function update_dynamic_point_sizes(sphere: SphereData) {
    let pointsResized = 0;
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        const history = sphere.pointPositionHistory?.get(recordId);
        if (!history || history.length < 2) return;
        
        // Calculate bounding sphere radius for recent positions
        const boundingRadius = calculateBoundingSphereRadius(history);
        
        // Scale to reasonable visual range
        const minRadius = 0.015; // Minimum point size
        const maxRadius = 0.08;  // Maximum point size  
        const scaleFactor = 2.0; // Amplify movement for visibility
        
        const newRadius = Math.min(maxRadius, Math.max(minRadius, boundingRadius * scaleFactor));
        
        // Calculate opacity inversely proportional to size
        const normalizedSize = (newRadius - minRadius) / (maxRadius - minRadius);
        const minOpacity = 0.3;  // Most transparent for biggest points
        const maxOpacity = 1.0;  // Solid for smallest points
        const opacity = maxOpacity - (normalizedSize * (maxOpacity - minOpacity));
        
        // Update point geometry scale and opacity
        pointMesh.scale.setScalar(newRadius / 0.025);
        const mat = pointMesh.material as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial;
        if (mat && 'opacity' in mat) {
            mat.transparent = true;
            mat.opacity = opacity;
            mat.needsUpdate = true;
        }

        pointsResized++;
    });
}

function reset_point_sizes_to_default(sphere: SphereData) {
    let pointsReset = 0;
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        // Reset scale to 1.0 (geometry already has user's pointSize)
        pointMesh.scale.setScalar(1.0);
        // Restore user's opacity setting, not hardcoded 1.0
        const mat = pointMesh.material as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial;
        if (mat && 'opacity' in mat) {
            mat.opacity = sphere.pointOpacity;
            mat.transparent = sphere.pointOpacity < 1.0;
            mat.needsUpdate = true;
        }
        pointsReset++;
    });
}

function create_dynamic_cluster_hulls(sphere: SphereData) {
    // Clear existing hulls
    hide_convex_hulls(sphere);
    sphere.showConvexHulls = true;
    
    if (!sphere.convexHullsGroup) {
        sphere.convexHullsGroup = new THREE.Group();
        sphere.scene.add(sphere.convexHullsGroup);
    }
    
    // Group points by cluster and calculate cluster movement
    const clusterData: Map<number, {
        points: THREE.Vector3[],
        color: THREE.Color,
        movementEnvelope: number
    }> = new Map();
    
    let pointsWithoutClusters = 0;
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        const record = sphere.pointRecordsByID.get(recordId);
        if (!record) return;

        // Get cluster assignment - try finalClusterResults first, then fall back to color inference
        let cluster = -1;
        const activeClusterKey = get_active_cluster_count_key(sphere);
        if (activeClusterKey !== null && sphere.finalClusterResults?.[activeClusterKey]?.cluster_labels) {
            const rowOffset = record.featrix_meta?.__featrix_row_offset;
            if (rowOffset !== undefined && rowOffset < sphere.finalClusterResults[activeClusterKey].cluster_labels.length) {
                cluster = sphere.finalClusterResults[activeClusterKey].cluster_labels[rowOffset];
            }
        }

        // Fallback: infer cluster from point color by finding closest color in color table
        if (cluster === -1) {
            const pointColor = pointMesh.material.color.getHex();
            // Find which color table entry this is closest to
            let minDist = Infinity;
            let bestCluster = 0;
            kColorTable.forEach((tableColor, idx) => {
                const dist = Math.abs(pointColor - tableColor);
                if (dist < minDist) {
                    minDist = dist;
                    bestCluster = idx;
                }
            });
            cluster = bestCluster;
        }

        if (cluster === -1) {
            pointsWithoutClusters++;
            return;
        }
        // Normalize point to sphere surface BEFORE adding to cluster
        const currentPos = normalize_to_sphere_surface(pointMesh.position);
        const color = pointMesh.material.color.clone();
        
        // Calculate this point's movement envelope for cluster-level calculation
        const history = sphere.pointPositionHistory?.get(recordId);
        const pointMovement = history ? calculateBoundingSphereRadius(history) : 0;
        
        if (!clusterData.has(cluster)) {
            clusterData.set(cluster, {
                points: [],
                color: color,
                movementEnvelope: 0
            });
        }
        
        const clusterInfo = clusterData.get(cluster)!;
        clusterInfo.points.push(currentPos);
        // Use average movement of points in cluster
        clusterInfo.movementEnvelope = Math.max(clusterInfo.movementEnvelope, pointMovement);
    });

    
    // Create translucent spheres around each cluster
    let hullsCreated = 0;
    clusterData.forEach((clusterInfo, cluster) => {
        if (clusterInfo.points.length >= 3) {
            create_dynamic_sphere_hull(sphere, clusterInfo.points, clusterInfo.color, cluster, 1.0, 0.12);
            hullsCreated++;
        }
    });
    
}

function create_dynamic_sphere_hull(sphere: SphereData, hullPoints: THREE.Vector3[], clusterColor: THREE.Color, cluster: number, scale: number, opacity: number) {
    if (!sphere.convexHullsGroup || hullPoints.length < 3) return;
    
    try {
        // Calculate bounding sphere for the cluster points
        const boundingSphere = calculateClusterBoundingSphere(hullPoints);
        
        if (boundingSphere.radius > 0) {
            // Create sphere geometry with good detail
            const sphereGeometry = new THREE.SphereGeometry(
                boundingSphere.radius * scale, // Apply movement-based scaling
                32, // widthSegments - good detail
                16  // heightSegments
            );
            
            // Create translucent material
            const sphereMaterial = new THREE.MeshBasicMaterial({
                color: clusterColor,
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide,
                wireframe: false
            });
            
            // Create mesh and position at cluster center
            const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphereMesh.position.copy(boundingSphere.center);
            // Store cluster info and original color for spotlight dimming
            sphereMesh.userData.cluster = cluster;
            sphereMesh.userData.originalColor = clusterColor.clone();
            sphereMesh.userData.originalOpacity = opacity;

            sphere.convexHullsGroup.add(sphereMesh);
        }
    } catch (error) {
        // Dynamic sphere creation failed for cluster
    }
}

function calculateClusterBoundingSphere(points: THREE.Vector3[]): { center: THREE.Vector3, radius: number } {
    if (points.length === 0) {
        return { center: new THREE.Vector3(), radius: 0 };
    }

    // Calculate centroid
    const center = new THREE.Vector3();
    points.forEach(point => center.add(point));
    center.divideScalar(points.length);

    // Use 80th percentile distance instead of max to avoid outlier blowup
    const distances = points.map(point => center.distanceTo(point));
    distances.sort((a, b) => a - b);
    const p80Index = Math.floor(distances.length * 0.8);
    const radius = distances[p80Index];

    return { center, radius };
}

export function update_cluster_spotlight(sphere: SphereData, updateOpacity: boolean = false) {
    // Clear existing spotlight lines
    if (sphere.clusterSpotlightGroup) {
        sphere.scene.remove(sphere.clusterSpotlightGroup);
        sphere.clusterSpotlightGroup = undefined;
    }

    const spotlightCluster = sphere.spotlightCluster;
    const GRAY_COLOR = new THREE.Color(0x555555);
    const DIM_OPACITY_FACTOR = 0.25;

    // If spotlight is off (-1) or no cluster selected
    if (spotlightCluster === undefined || spotlightCluster < 0) {
        // Only restore when explicitly requested (when user changes setting)
        if (updateOpacity) {
            // Restore point colors and opacity
            sphere.pointObjectsByRecordID.forEach((pointMesh) => {
                const mat = pointMesh.material as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial;
                if (mat) {
                    // Restore original color if stored
                    if (pointMesh.userData.originalColor) {
                        mat.color.copy(pointMesh.userData.originalColor);
                    }
                    if ('opacity' in mat) {
                        mat.opacity = sphere.pointOpacity || 0.5;
                    }
                    mat.needsUpdate = true;
                }
            });
            // Restore convex hull colors and opacity
            if (sphere.convexHullsGroup) {
                sphere.convexHullsGroup.children.forEach((child: any) => {
                    const mat = child.material as THREE.MeshBasicMaterial;
                    if (mat && child.userData.originalColor) {
                        mat.color.copy(child.userData.originalColor);
                        mat.opacity = child.userData.originalOpacity || 0.15;
                        mat.needsUpdate = true;
                    }
                });
            }
        }
        return;
    }

    // Find the active cluster count key from finalClusterResults
    const activeClusterCountKey = get_active_cluster_count_key(sphere);
    
    // Create spotlight group
    sphere.clusterSpotlightGroup = new THREE.Group();
    sphere.scene.add(sphere.clusterSpotlightGroup);
    
    // Get current epoch data for training movie (if playing)
    let currentEpochData: any = null;
    if (sphere.trainingMovieData && sphere.currentEpoch !== undefined) {
        const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => {
            const epochA = parseInt(a.replace('epoch_', ''));
            const epochB = parseInt(b.replace('epoch_', ''));
            return epochA - epochB;
        });
        if (epochKeys.length > 0 && sphere.currentEpoch < epochKeys.length) {
            const currentEpochKey = epochKeys[sphere.currentEpoch];
            currentEpochData = sphere.trainingMovieData[currentEpochKey];
        }
    }
    
    // Find all points in the selected cluster
    const clusterPoints: { position: THREE.Vector3, color: THREE.Color }[] = [];
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        const record = sphere.pointRecordsByID.get(recordId);
        if (record) {
            let clusterAssignment = -1;
            
            // First try to use finalClusterResults if available
            if (activeClusterCountKey !== null && sphere.finalClusterResults?.[activeClusterCountKey]?.cluster_labels) {
                const rowOffset = record.featrix_meta?.__featrix_row_offset;
                if (rowOffset !== undefined && rowOffset < sphere.finalClusterResults[activeClusterCountKey].cluster_labels.length) {
                    clusterAssignment = sphere.finalClusterResults[activeClusterCountKey].cluster_labels[rowOffset];
                }
            }
            
            // Fallback: Use cluster_pre from current epoch's coord data (for training movie)
            if (clusterAssignment === -1 && currentEpochData?.coords) {
                const rowOffset = record.featrix_meta?.__featrix_row_offset;
                if (rowOffset !== undefined) {
                    const coord = currentEpochData.coords.find((c: any) => 
                        c.__featrix_row_offset === rowOffset
                    );
                    if (coord && coord.cluster_pre !== undefined) {
                        clusterAssignment = coord.cluster_pre;
                    }
                }
            }
            
            // Last fallback: Use cluster_pre from record metadata
            if (clusterAssignment === -1 && record.featrix_meta.cluster_pre !== undefined) {
                clusterAssignment = record.featrix_meta.cluster_pre;
            }
            
            // Collect spotlight members for line drawing
            const mat = pointMesh.material as THREE.MeshPhongMaterial | THREE.MeshBasicMaterial;
            if (clusterAssignment === spotlightCluster) {
                clusterPoints.push({
                    position: pointMesh.position.clone(),
                    color: mat && 'color' in mat ? mat.color.clone() : new THREE.Color(0xffffff)
                });
                // Restore original color and full opacity for spotlight members
                if (updateOpacity && mat) {
                    if (pointMesh.userData.originalColor) {
                        mat.color.copy(pointMesh.userData.originalColor);
                    }
                    if ('opacity' in mat) {
                        mat.opacity = sphere.pointOpacity || 0.5;
                    }
                    mat.needsUpdate = true;
                }
            } else {
                // Gray out and reduce opacity for non-members
                if (updateOpacity && mat) {
                    // Store original color if not already stored
                    if (!pointMesh.userData.originalColor) {
                        pointMesh.userData.originalColor = mat.color.clone();
                    }
                    mat.color.copy(GRAY_COLOR);
                    if ('opacity' in mat) {
                        mat.opacity = (sphere.pointOpacity || 0.5) * DIM_OPACITY_FACTOR;
                    }
                    mat.needsUpdate = true;
                }
            }
        }
    });

    // Gray out non-spotlight convex hulls
    if (updateOpacity && sphere.convexHullsGroup) {
        sphere.convexHullsGroup.children.forEach((child: any) => {
            const mat = child.material as THREE.MeshBasicMaterial;
            const hullCluster = child.userData.cluster;
            if (mat) {
                if (hullCluster === spotlightCluster) {
                    // Restore original color and opacity for spotlight cluster
                    if (child.userData.originalColor) {
                        mat.color.copy(child.userData.originalColor);
                    }
                    mat.opacity = child.userData.originalOpacity || 0.15;
                } else {
                    // Gray out and reduce opacity for non-spotlight clusters
                    mat.color.copy(GRAY_COLOR);
                    mat.opacity = (child.userData.originalOpacity || 0.15) * DIM_OPACITY_FACTOR;
                }
                mat.needsUpdate = true;
            }
        });
    }

    if (clusterPoints.length === 0) {
        return;
    }
    
    // Calculate cluster centroid
    const centroid = new THREE.Vector3();
    clusterPoints.forEach(point => centroid.add(point.position));
    centroid.divideScalar(clusterPoints.length);
    
    // Create thick lines from center of sphere to each point in the cluster
    const sphereCenter = new THREE.Vector3(0, 0, 0);
    const clusterColor = clusterPoints[0].color; // Use cluster color
    
    clusterPoints.forEach(point => {
        // Create line from sphere center to point
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            sphereCenter,
            point.position
        ]);
        
        const lineMaterial = new THREE.LineBasicMaterial({
            color: clusterColor,
            transparent: true,
            opacity: 0.6,
            linewidth: 3 // Note: linewidth may not work in WebGL, but we'll try
        });
        
        const line = new THREE.Line(lineGeometry, lineMaterial);
        sphere.clusterSpotlightGroup.add(line);
    });
    
    // Also create a thicker line to the centroid for reference
    const centroidLineGeometry = new THREE.BufferGeometry().setFromPoints([
        sphereCenter,
        centroid
    ]);
    
    const centroidLineMaterial = new THREE.LineBasicMaterial({
        color: clusterColor,
        transparent: true,
        opacity: 0.9,
        linewidth: 5
    });
    
    const centroidLine = new THREE.Line(centroidLineGeometry, centroidLineMaterial);
    sphere.clusterSpotlightGroup.add(centroidLine);
}

function calculateBoundingSphereRadius(positions: THREE.Vector3[]): number {
    if (positions.length < 2) return 0.025; // Default size
    
    // Calculate centroid of recent positions
    const centroid = new THREE.Vector3();
    positions.forEach(pos => centroid.add(pos));
    centroid.divideScalar(positions.length);
    
    // Find maximum distance from centroid to any position
    let maxDistance = 0;
    positions.forEach(pos => {
        const distance = centroid.distanceTo(pos);
        maxDistance = Math.max(maxDistance, distance);
    });
    
    return maxDistance;
}

function compute_3d_convex_hull(points: THREE.Vector3[]): THREE.Vector3[] | null {
    if (points.length < 4) return null;
    
    // Use simple hull approach since ConvexGeometry is not in core Three.js
    return compute_simple_convex_hull(points);
}

function compute_simple_convex_hull(points: THREE.Vector3[]): THREE.Vector3[] {
    // For convex hulls on sphere surface, use spherical convex hull computation
    return compute_spherical_convex_hull(points);
}

/**
 * Create a spherical convex hull mesh on the unit sphere surface
 */
function create_spherical_convex_hull_mesh(sphere: SphereData, hullPoints: THREE.Vector3[], clusterColor: THREE.Color, cluster: number) {
    if (!sphere.convexHullsGroup || hullPoints.length < 3) return;
    
    try {
        // Create spherical hull geometry (on sphere surface)
        const sphericalGeometry = create_spherical_hull_geometry(hullPoints);
        
        if (sphericalGeometry) {
            // Create semi-transparent filled material
            const filledMaterial = new THREE.MeshBasicMaterial({
                color: clusterColor,
                transparent: true,
                opacity: 0.15,
                side: THREE.DoubleSide,
                wireframe: false
            });
            
            // Create wireframe overlay for edges
            const wireframeMaterial = new THREE.MeshBasicMaterial({
                color: clusterColor,
                transparent: true,
                opacity: 0.6,
                wireframe: true
            });
            
            // Create both filled and wireframe meshes
            const filledMesh = new THREE.Mesh(sphericalGeometry, filledMaterial);
            const wireframeMesh = new THREE.Mesh(sphericalGeometry.clone(), wireframeMaterial);

            // Store cluster info and original colors for spotlight dimming
            filledMesh.userData.cluster = cluster;
            filledMesh.userData.originalColor = clusterColor.clone();
            filledMesh.userData.originalOpacity = 0.15;
            wireframeMesh.userData.cluster = cluster;
            wireframeMesh.userData.originalColor = clusterColor.clone();
            wireframeMesh.userData.originalOpacity = 0.6;

            // Add both to convex hulls group
            sphere.convexHullsGroup.add(filledMesh);
            sphere.convexHullsGroup.add(wireframeMesh);
            
        }
        
    } catch (error) {
        // Spherical convex hull creation failed for cluster
    }
}

function create_convex_hull_mesh(sphere: SphereData, hullPoints: THREE.Vector3[], clusterColor: THREE.Color, cluster: number) {
    // Use spherical convex hull mesh instead
    create_spherical_convex_hull_mesh(sphere, hullPoints, clusterColor, cluster);
}

function create_filled_hull_geometry(hullPoints: THREE.Vector3[]): THREE.BufferGeometry | null {
    if (hullPoints.length < 4) return null;
    
    try {
        // Create a simple convex polyhedron from extremal points
        // For 6 extremal points (min/max X,Y,Z), create triangulated faces
        
        const geometry = new THREE.BufferGeometry();
        const vertices: number[] = [];
        const indices: number[] = [];
        
        // Add all hull points as vertices
        hullPoints.forEach(point => {
            vertices.push(point.x, point.y, point.z);
        });
        
        // Create triangular faces connecting the points
        // This creates a rough convex polyhedron
        const numPoints = hullPoints.length;
        
        if (numPoints === 4) {
            // Tetrahedron - 4 triangular faces
            indices.push(
                0, 1, 2,  // Face 1
                0, 1, 3,  // Face 2  
                0, 2, 3,  // Face 3
                1, 2, 3   // Face 4
            );
        } else if (numPoints === 6) {
            // Octahedron-like shape from 6 extremal points
            // Connect points to form triangular faces
            indices.push(
                // Top pyramid (using first 3 points as base, 4th as apex)
                0, 1, 2,  0, 2, 3,  0, 3, 1,
                // Bottom pyramid (using last 3 points)
                3, 4, 5,  3, 5, 2,  2, 5, 4,
                // Side faces connecting top and bottom
                0, 1, 4,  1, 2, 5,  2, 3, 4,
                4, 0, 3,  5, 1, 0,  4, 5, 2
            );
        } else {
            // For other counts, create a fan-like triangulation
            // Connect first point to all other adjacent pairs
            for (let i = 1; i < numPoints - 1; i++) {
                indices.push(0, i, i + 1);
            }
            // Close the fan
            indices.push(0, numPoints - 1, 1);
            
            // Add bottom faces if we have enough points
            if (numPoints > 4) {
                const center = numPoints - 1;
                for (let i = 1; i < center - 1; i++) {
                    indices.push(center, i + 1, i);
                }
                indices.push(center, 1, center - 1);
            }
        }
        
        // Set geometry data
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        
        // Compute normals for proper lighting
        geometry.computeVertexNormals();
        
        return geometry;
        
    } catch (error) {
        // Filled hull geometry creation failed
        return null;
    }
}

// ============================================================================
// EMBEDDING CONVEX HULL FUNCTIONS
// ============================================================================

function calculateSurfaceArea(geometry: THREE.BufferGeometry): number {
    const positions = geometry.attributes.position;
    const index = geometry.index;
    
    if (!positions || !index) return 0;
    
    let totalArea = 0;
    const posArray = positions.array as Float32Array;
    const indexArray = index.array as Uint16Array | Uint32Array;
    
    // Calculate area of each triangle
    for (let i = 0; i < indexArray.length; i += 3) {
        const i0 = indexArray[i] * 3;
        const i1 = indexArray[i + 1] * 3;
        const i2 = indexArray[i + 2] * 3;
        
        const v0 = new THREE.Vector3(posArray[i0], posArray[i0 + 1], posArray[i0 + 2]);
        const v1 = new THREE.Vector3(posArray[i1], posArray[i1 + 1], posArray[i1 + 2]);
        const v2 = new THREE.Vector3(posArray[i2], posArray[i2 + 1], posArray[i2 + 2]);
        
        // Calculate triangle area using cross product
        const edge1 = new THREE.Vector3().subVectors(v1, v0);
        const edge2 = new THREE.Vector3().subVectors(v2, v0);
        const cross = new THREE.Vector3().crossVectors(edge1, edge2);
        const area = cross.length() / 2;
        
        totalArea += area;
    }
    
    return totalArea;
}

/**
 * Compute per-epoch movement statistics for all points.
 * For each pair of consecutive epochs, computes the Euclidean distance
 * each point moved and returns summary statistics (mean, median, p90, max).
 * Used for the movement histogram overlay to evaluate convergence.
 */
// Compute per-point movement with cluster assignments for histogram visualization
export function compute_movement_histogram_data(
    sphere: SphereData,
    trainingMovieData: any,
    epochKey: string
): { buckets: Array<{ range: string, min: number, max: number, counts: Record<number, number>, total: number }>, clusterColors: Record<number, string> } | null {
    if (!trainingMovieData || !sphere?.finalClusterResults) return null;

    const epochKeys = Object.keys(trainingMovieData).sort((a, b) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });

    const epochIndex = epochKeys.indexOf(epochKey);
    if (epochIndex < 1) return null; // Need previous epoch

    const prevKey = epochKeys[epochIndex - 1];
    const prevData = trainingMovieData[prevKey];
    const currData = trainingMovieData[epochKey];

    if (!prevData?.coords || !currData?.coords) return null;

    // Get cluster labels from finalClusterResults
    const activeClusterKey = get_active_cluster_count_key(sphere);
    const clusterLabels = activeClusterKey ? sphere.finalClusterResults[activeClusterKey]?.cluster_labels : null;

    // Calculate movement for each point
    const movements: Array<{ distance: number, clusterId: number }> = [];
    const numPoints = Math.min(prevData.coords.length, currData.coords.length);

    for (let p = 0; p < numPoints; p++) {
        const prevCoords = extractCoordinates(prevData.coords[p]);
        const currCoords = extractCoordinates(currData.coords[p]);
        if (!prevCoords || !currCoords) continue;

        const dx = currCoords.x - prevCoords.x;
        const dy = currCoords.y - prevCoords.y;
        const dz = currCoords.z - prevCoords.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const clusterId = clusterLabels ? clusterLabels[p] : 0;
        movements.push({ distance: dist, clusterId });
    }

    if (movements.length === 0) return null;

    // Find max movement to set bucket ranges
    const maxMovement = Math.max(...movements.map(m => m.distance));
    const bucketCount = 10;
    const bucketSize = maxMovement / bucketCount;
    if (bucketSize <= 0 || !isFinite(bucketSize)) return null; // All points stationary or degenerate

    // Initialize buckets
    const buckets: Array<{ range: string, min: number, max: number, counts: Record<number, number>, total: number }> = [];
    for (let i = 0; i < bucketCount; i++) {
        const min = i * bucketSize;
        const max = (i + 1) * bucketSize;
        buckets.push({
            range: `${min.toFixed(2)}-${max.toFixed(2)}`,
            min,
            max,
            counts: {},
            total: 0
        });
    }

    // Count movements per bucket per cluster
    const allClusterIds = new Set<number>();
    movements.forEach(({ distance, clusterId }) => {
        allClusterIds.add(clusterId);
        const bucketIndex = Math.min(Math.floor(distance / bucketSize), bucketCount - 1);
        if (!buckets[bucketIndex].counts[clusterId]) {
            buckets[bucketIndex].counts[clusterId] = 0;
        }
        buckets[bucketIndex].counts[clusterId]++;
        buckets[bucketIndex].total++;
    });

    // Get cluster colors
    const clusterColors: Record<number, string> = {};
    allClusterIds.forEach(clusterId => {
        const color = get_cluster_color(sphere, clusterId);
        clusterColors[clusterId] = `#${color.toString(16).padStart(6, '0')}`;
    });

    return { buckets, clusterColors };
}

export function compute_epoch_movement_stats(trainingMovieData: any): Array<{ epoch: string, mean: number, median: number, p90: number, max: number }> {
    if (!trainingMovieData) return [];

    const epochKeys = Object.keys(trainingMovieData).sort((a, b) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });

    if (epochKeys.length < 2) return [];

    const results: Array<{ epoch: string, mean: number, median: number, p90: number, max: number }> = [];

    for (let i = 1; i < epochKeys.length; i++) {
        const prevKey = epochKeys[i - 1];
        const currKey = epochKeys[i];
        const prevData = trainingMovieData[prevKey];
        const currData = trainingMovieData[currKey];

        if (!prevData?.coords || !currData?.coords) continue;

        const numPoints = Math.min(prevData.coords.length, currData.coords.length);
        const distances: number[] = [];

        for (let p = 0; p < numPoints; p++) {
            const prevCoords = extractCoordinates(prevData.coords[p]);
            const currCoords = extractCoordinates(currData.coords[p]);
            if (!prevCoords || !currCoords) continue;

            const dx = currCoords.x - prevCoords.x;
            const dy = currCoords.y - prevCoords.y;
            const dz = currCoords.z - prevCoords.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            distances.push(dist);
        }

        if (distances.length === 0) continue;

        distances.sort((a, b) => a - b);
        const mean = distances.reduce((s, d) => s + d, 0) / distances.length;
        const median = distances[Math.floor(distances.length / 2)];
        const p90 = distances[Math.floor(distances.length * 0.9)];
        const max = distances[distances.length - 1];

        results.push({ epoch: currKey, mean, median, p90, max });
    }

    return results;
}

export function compute_embedding_convex_hull(sphere: SphereData) {
    if (!sphere || !sphere.pointObjectsByRecordID || sphere.pointObjectsByRecordID.size === 0) {
        return;
    }

    // Remove old hull if exists
    if (sphere.embeddingHull) {
        sphere.scene.remove(sphere.embeddingHull as any);
        // Dispose all children
        (sphere.embeddingHull as THREE.Group).traverse((child: any) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((m: THREE.Material) => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }

    // Group points by cluster (same logic as create_dynamic_cluster_hulls)
    const clusterData: Map<number, {
        points: THREE.Vector3[],
        color: number
    }> = new Map();

    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        const record = sphere.pointRecordsByID.get(recordId);
        if (!record) return;

        // Get cluster assignment
        let cluster = -1;
        const activeClusterKey = get_active_cluster_count_key(sphere);
        if (activeClusterKey !== null && sphere.finalClusterResults?.[activeClusterKey]?.cluster_labels) {
            const rowOffset = record.featrix_meta?.__featrix_row_offset;
            if (rowOffset !== undefined && rowOffset < sphere.finalClusterResults[activeClusterKey].cluster_labels.length) {
                cluster = sphere.finalClusterResults[activeClusterKey].cluster_labels[rowOffset];
            }
        }

        // Fallback: infer cluster from point color
        if (cluster === -1) {
            const pointColor = pointMesh.material.color.getHex();
            let minDist = Infinity;
            let bestCluster = 0;
            kColorTable.forEach((tableColor, idx) => {
                const dist = Math.abs(pointColor - tableColor);
                if (dist < minDist) {
                    minDist = dist;
                    bestCluster = idx;
                }
            });
            cluster = bestCluster;
        }

        if (cluster === -1) return;

        const currentPos = normalize_to_sphere_surface(pointMesh.position);
        const color = pointMesh.material.color.getHex();

        if (!clusterData.has(cluster)) {
            clusterData.set(cluster, { points: [], color: color });
        }

        clusterData.get(cluster)!.points.push(currentPos);
    });

    // Create hull group for all clusters
    const hullGroup = new THREE.Group();
    let totalArea = 0;

    clusterData.forEach((clusterInfo, cluster) => {
        if (clusterInfo.points.length < 3) return;

        // Compute convex hull for this cluster
        const hullPoints = compute_spherical_convex_hull(clusterInfo.points);
        const geometry = create_spherical_hull_geometry(hullPoints);

        if (!geometry) return;

        totalArea += calculateSurfaceArea(geometry);

        // Create mesh with cluster color
        const material = new THREE.MeshBasicMaterial({
            color: clusterInfo.color,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            wireframe: false
        });

        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: clusterInfo.color,
            transparent: true,
            opacity: 0.5,
            wireframe: true
        });

        const hullMesh = new THREE.Mesh(geometry, material);
        const wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMaterial);

        hullGroup.add(hullMesh);
        hullGroup.add(wireframeMesh);
    });

    sphere.embeddingHullArea = totalArea;
    const unitSphereArea = 4 * Math.PI;
    const coveragePercent = (totalArea / unitSphereArea) * 100;
    (sphere as any).embeddingHullCoverage = coveragePercent;

    // Apply hull expansion factor if set (moves hulls outward for better visibility of overlap)
    const expansionFactor = sphere.hullExpansionFactor || 1.0;
    hullGroup.scale.setScalar(expansionFactor);

    sphere.embeddingHull = hullGroup as any;
    sphere.scene.add(hullGroup);
}

/**
 * Toggle great circles mode - shows great circles through each point for coverage visualization
 * When enabled: reduces point size to 0.01, hides trails, hides unit sphere wireframe
 */
// Update great circles to match current point positions (called during animation)
export function update_great_circles(sphere: SphereData) {
    if (!sphere || !sphere.showGreatCircles || !sphere.greatCirclesGroup) {
        return;
    }

    // Clear existing great circles
    while (sphere.greatCirclesGroup.children.length > 0) {
        const child = sphere.greatCirclesGroup.children[0];
        sphere.greatCirclesGroup.remove(child);
        if (child instanceof THREE.Line) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
                child.material.dispose();
            }
        }
    }

    // Regenerate great circles at current positions
    const circleSegments = 64;
    const circleRadius = 1.0;

    sphere.pointObjectsByRecordID.forEach((pointMesh) => {
        const pointPos = pointMesh.position.clone().normalize();

        const up = new THREE.Vector3(0, 1, 0);
        let tangent1: THREE.Vector3;
        let tangent2: THREE.Vector3;

        if (Math.abs(pointPos.dot(up)) > 0.99) {
            const right = new THREE.Vector3(1, 0, 0);
            tangent1 = new THREE.Vector3().crossVectors(pointPos, right).normalize();
        } else {
            tangent1 = new THREE.Vector3().crossVectors(pointPos, up).normalize();
        }
        tangent2 = new THREE.Vector3().crossVectors(pointPos, tangent1).normalize();

        const circlePoints: THREE.Vector3[] = [];
        for (let i = 0; i <= circleSegments; i++) {
            const angle = (i / circleSegments) * Math.PI * 2;
            const x = Math.cos(angle);
            const y = Math.sin(angle);
            const circlePoint = new THREE.Vector3()
                .addScaledVector(tangent1, x)
                .addScaledVector(tangent2, y)
                .normalize()
                .multiplyScalar(circleRadius);
            circlePoints.push(circlePoint);
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            linewidth: 1,
            transparent: true,
            opacity: 0.3
        });
        const circleLine = new THREE.Line(geometry, material);
        sphere.greatCirclesGroup.add(circleLine);
    });
}

export function toggle_great_circles(sphere: SphereData, show: boolean) {
    if (!sphere) {
        return;
    }

    sphere.showGreatCircles = show;

    if (show) {
        // Create great circles group if it doesn't exist
        if (!sphere.greatCirclesGroup) {
            sphere.greatCirclesGroup = new THREE.Group();
            sphere.scene.add(sphere.greatCirclesGroup);
        }

        sphere.greatCirclesGroup.visible = true;
        update_great_circles(sphere);

    } else {
        // Hide great circles
        if (sphere.greatCirclesGroup) {
            sphere.greatCirclesGroup.visible = false;
        }
    }

    render_sphere(sphere);
}

export function toggle_embedding_hull(sphere: SphereData, show: boolean) {
    if (!sphere) return;
    
    sphere.showEmbeddingHull = show;
    
    if (show) {
        if (!sphere.embeddingHull) {
            compute_embedding_convex_hull(sphere);
        } else {
            sphere.scene.add(sphere.embeddingHull as any);
            (sphere.embeddingHull as any).visible = true;
        }
    } else {
        if (sphere.embeddingHull) {
            (sphere.embeddingHull as any).visible = false;
            sphere.scene.remove(sphere.embeddingHull as any);
        }
    }
    
    render_sphere(sphere);
}
