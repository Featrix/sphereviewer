import { TRACE_OUTPUT_VERSION } from "next/dist/shared/lib/constants";
import * as THREE from "three";
import { v4 as uuid4 } from "uuid";


const RED = "#ff0000";
const BLACK = "#000000";
const GRAY = "#dddddd";

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
    event_listeners: Record<string, Map<string, CallableFunction>>;

    pointRecordsByID: Map<string, SphereRecord>;
    pointObjectsByRecordID: Map<string, THREE.Mesh>;

    similaritySearchResults: Map<string, Array<string>>

    recordFields: string[];
    hasLoggedSizeIssue?: boolean;
    
    // Animation controls
    rotationSpeed: number;
    rotationControlsEnabled: boolean; // Controls both auto-rotation and mouse dragging
    animateClusters: boolean;
    clusterAnimationRef: number;
    currentCluster: number;
    jsonData?: any;
    
    // Visual controls
    pointSize: number;
    pointOpacity: number;

    finalClusterResults?: any;
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

    const init_height = 500;
    const init_width = 500;
    const init_aspect_ratio = init_width / init_height;
    const camera = new THREE.PerspectiveCamera(75, init_aspect_ratio, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true});

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let angle = 0;
    let verticalAngle = 0;

    // All points lay on the unit sphere, so the sphere has diameter 2.
    const dataRange = 2;
    const cubeSize = dataRange * 1;
    const sceneCenter = new THREE.Vector3(0, 0, 0);

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
        event_listeners: {},

        pointRecordsByID: new Map<string, SphereRecord>(),
        pointObjectsByRecordID: new Map<string, THREE.Mesh>(),

        recordFields: [],

        similaritySearchResults: new Map<string, Array<string>>(),
        
        // Animation controls
        rotationSpeed: 0.1,
        rotationControlsEnabled: true, // Default enabled
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

    sphere.camera.aspect = width / effectiveHeight;
    sphere.camera.updateProjectionMatrix();
    sphere.renderer.setSize(width, effectiveHeight);
    
    // Force canvas style if it still has zero height
    if (sphere.renderer.domElement.style.height === '0px' && effectiveHeight > 0) {
        sphere.renderer.domElement.style.height = `${effectiveHeight}px`;
    }
}

function attach_sphere_to_container(sphere: SphereData) {
    sphere.container.appendChild(sphere.renderer.domElement);
}

export function render_sphere(sphere: SphereData) {
    const beforeWidth = sphere.container.clientWidth;
    const beforeHeight = sphere.container.clientHeight;
    
    fit_sphere_to_container(sphere);

    const afterCanvasWidth = sphere.renderer.domElement.width;
    const afterCanvasHeight = sphere.renderer.domElement.height;
    
    // Log size issues only once to avoid spam
    if (afterCanvasHeight === 0 || beforeHeight === 0) {
        if (!sphere.hasLoggedSizeIssue) {
            console.log('🔧 Render sphere sizing issue:', {
                containerBefore: { width: beforeWidth, height: beforeHeight },
                canvasAfter: { width: afterCanvasWidth, height: afterCanvasHeight },
                rendererSize: sphere.renderer.getSize(new THREE.Vector2())
            });
            sphere.hasLoggedSizeIssue = true;
        }
    }

    sphere.camera.position.x = sphere.orbitRadius * Math.sin(sphere.angle) * Math.cos(sphere.verticalAngle);
    sphere.camera.position.y = sphere.orbitRadius * Math.sin(sphere.verticalAngle);
    sphere.camera.position.z = sphere.orbitRadius * Math.cos(sphere.angle) * Math.cos(sphere.verticalAngle);
    sphere.camera.lookAt(sphere.sceneCenter);

    sphere.renderer.render(sphere.scene, sphere.camera);
}


function add_floor_and_grid(sphere: SphereData) {
    // Add floor
    const floorGeometry = new THREE.PlaneGeometry(sphere.cubeSize, sphere.cubeSize, 32);
    const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x303030, opacity: 0.2, transparent: true, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    const minY = -1.0;  // sphere radius is 1
    floor.position.y = minY - 1;
    sphere.scene.add(floor);

    // Add grid
    const grid = new THREE.GridHelper(sphere.cubeSize, 10, 0x666666, 0x666666);
    grid.position.y = floor.position.y;
    sphere.scene.add(grid);
}

const kColorTable = [
    0xe6194b,
    0x3cb44b,
    0xffe119,
    0x4363d8,
    0xf58231,
    0x911eb4,
    0x46f0f0,
    0xf032e6,
    0xbcf60c,
    0xfabebe,
    0x008080,
    0xe6beff,
    0x9a6324,
    0xfffac8,
    0x800000,
    0xaaffc3,
    0x808000,
    0xffd8b1,
    0x999999,
    0x0000ff,
    0x00ff00,
    0xffcccc,
];

const getColor = (record: SphereRecord) => {
    try {
        const idx = record.featrix_meta?.cluster_pre;
        if (idx) {
            if (idx < kColorTable.length) {
                return kColorTable[idx];
            }
            return 0xff0000;
        } else {
        }
    } catch (ex) {
        // console.error(ex);
    }

    // Default color is red.
    return 0xff0000;
}

function add_point_to_sphere(sphere: SphereData, record: SphereRecord) {
    
    const record_id = record.id;
    
    const pointSize = sphere.pointSize;
    const opacity = sphere.pointOpacity;
    

    const geometry = new THREE.SphereGeometry(pointSize, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: getColor(record), opacity: opacity, transparent: true });
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

function add_points_to_sphere(sphere: SphereData, recordList: SphereRecord[]) {
    
    console.log("recordIndex:", recordList);

    // Figure out the set of all fields in the records.
    const fieldsSet = new Set<string>();
    for (const record of recordList) {
        Object.keys(record.original).forEach(field => fieldsSet.add(field));
    };
    // Order fields alphabetically.
    sphere.recordFields = Array.from(fieldsSet).sort((a, b) => a.localeCompare(b));
    
    // Create spheres for each point
    for (const record of recordList) {    
        add_point_to_sphere(sphere, record)
    }
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
export function change_cluster_count(sphere: SphereData, jsonData: any, new_cluster_selection: any) {
    const new_cluster_labels_by_row_offset = jsonData?.entire_cluster_results[new_cluster_selection]?.cluster_labels;

    console.log("new cluster_selection:", new_cluster_selection)
    console.log("new_cluster_labels_by_row_offset:", new_cluster_labels_by_row_offset)

    if (!new_cluster_labels_by_row_offset) {
        return;
    }

    for (const [record_id, record] of sphere.pointRecordsByID.entries()) {
        const row_offset = record.featrix_meta.__featrix_row_offset;
        if (row_offset === null) {
            console.error("Row offset not found for record with id", record_id);
            continue;
        }

        const new_cluster_idx_for_record = new_cluster_labels_by_row_offset[row_offset];

        if (new_cluster_idx_for_record < kColorTable.length) {
            const new_color_for_object = kColorTable[new_cluster_idx_for_record]
            change_object_color(sphere, record_id, new_color_for_object);
        } else {
            change_object_color(sphere, record_id, BLACK);
        }
    }
}


function zoom_sphere(sphere: SphereData, zoom_in: boolean) {
    
    // Adjust zoom speed and prevent excessive zoom
    const zoomFactor = 1.01;

    if (zoom_in) {
        sphere.orbitRadius /= zoomFactor;
    } else {
        sphere.orbitRadius *= zoomFactor;
    }
}


export function initialize_sphere(container: HTMLElement, recordList: SphereRecord[]): SphereData {

    const sphere = create_new_sphere(container);

    fit_sphere_to_container(sphere);
    attach_sphere_to_container(sphere);

    add_floor_and_grid(sphere);
    add_points_to_sphere(sphere, recordList);

    container.addEventListener("mousedown", (event) => onMouseDown(sphere, event));
    container.addEventListener("mousemove", (event) => onMouseMove(sphere, event));
    container.addEventListener("mouseup", (event) => onMouseUp(sphere, event));
    container.addEventListener("mouseleave", (event) => onMouseUp(sphere, event));

    container.addEventListener("touchstart", (event) => onTouchStart(sphere, event));
    container.addEventListener("touchmove", (event) => onTouchMove(sphere, event));
    container.addEventListener("touchend", (event) => onTouchEnd(sphere, event));
    
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
        // Only auto-rotate if rotation controls are enabled
    if (sphere.rotationControlsEnabled) {
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
    sphere.rotationControlsEnabled = isRotating; // Control both auto-rotation and mouse dragging
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

export function update_all_point_visuals(sphere: SphereData) {
    // Update all existing point objects with new size and opacity
    sphere.pointObjectsByRecordID.forEach((mesh) => {
        // Update geometry for size change
        mesh.geometry.dispose(); // Clean up old geometry
        mesh.geometry = new THREE.SphereGeometry(sphere.pointSize, 16, 16);
        
        // Update material for opacity change
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
            mesh.material.opacity = sphere.pointOpacity;
            mesh.material.needsUpdate = true;
        }
    });
}

// Training Movie Functions
export function load_training_movie(sphere: SphereData, trainingMovieData: any, lossData?: any) {
    // CRITICAL: Clear all existing points to prevent accumulation when restarting
    clear_all_points(sphere);
    
    sphere.trainingMovieData = trainingMovieData;
    sphere.lossData = lossData;
    sphere.currentEpoch = 0;
    
    // Note: Loss plot is now handled as 2D screen overlay, not 3D scene object
    
    // Initialize memory trails system
    create_memory_trails(sphere);
    
    // Store initial positions for any existing points
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        store_point_position_in_history(sphere, recordId, mesh.position);
    });
    
    // NO FAKE DATA - Use only real session cluster results
    
    // GET FINAL CLUSTER RESULTS from session data for convergence visualization
    sphere.finalClusterResults = null;
    try {
        console.log('🔍 Looking for final cluster results in session data...');
        console.log('🔍 sphere.jsonData type:', typeof sphere.jsonData);
        console.log('🔍 sphere.jsonData keys:', sphere.jsonData ? Object.keys(sphere.jsonData) : 'NULL');
        
        if (sphere.jsonData) {
            console.log('🔍 sphere.jsonData structure:');
            console.log('  - coords:', sphere.jsonData.coords ? `${sphere.jsonData.coords.length} items` : 'MISSING');
            console.log('  - entire_cluster_results:', sphere.jsonData.entire_cluster_results ? Object.keys(sphere.jsonData.entire_cluster_results) : 'MISSING');
            console.log('  - metadata:', sphere.jsonData.metadata ? 'present' : 'MISSING');
            console.log('  - session:', sphere.jsonData.session ? 'present' : 'MISSING');
            console.log('  - all keys:', Object.keys(sphere.jsonData));
            
            // DEEP INSPECTION: What's actually in sphere.jsonData?
            console.log('🔍 DEEP INSPECT sphere.jsonData:', JSON.stringify(sphere.jsonData, null, 2).substring(0, 500) + '...');
        } else {
            console.error('❌ sphere.jsonData is completely NULL/undefined');
            console.log('🔍 sphere object keys:', Object.keys(sphere));
            console.log('🔍 sphere object sample:', { 
                pointObjectsByRecordID: sphere.pointObjectsByRecordID?.size || 'undefined',
                trainingMovieData: sphere.trainingMovieData ? 'present' : 'missing',
                jsonData: sphere.jsonData
            });
        }
        
        // Check if we have completed session data with clustering results
        if (sphere.jsonData && sphere.jsonData.entire_cluster_results) {
            sphere.finalClusterResults = sphere.jsonData.entire_cluster_results;
            console.log('✅ Found final cluster results:', Object.keys(sphere.finalClusterResults));
        } else {
            console.error('❌ CRITICAL: No final cluster results available in session data');
            console.error('❌ Cannot show cluster convergence without real cluster data');
            console.error('❌ Training movie requires session with entire_cluster_results field');
            throw new Error('Missing entire_cluster_results - cannot proceed with training movie');
        }
    } catch (error) {
        console.error('❌ Error loading final cluster results:', error);
        throw error; // Don't continue with broken data
    }
    
    // INITIALIZE SPHERE WITH FIRST EPOCH DATA
    const epochKeys = Object.keys(trainingMovieData).sort((a, b) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });
    
    if (epochKeys.length === 0) {
        console.error('❌ No epochs found in training movie data');
        return;
    }
    
    const firstEpochKey = epochKeys[0];
    const firstEpochData = trainingMovieData[firstEpochKey];
    
    if (!firstEpochData || !firstEpochData.coords) {
        console.error('❌ No coords found in first epoch data');
        return;
    }
    
    console.log(`🎬 Initializing sphere with ${firstEpochData.coords.length} points from ${firstEpochKey}`);
    
    // Convert first epoch coords to sphere records
    const recordList: SphereRecord[] = firstEpochData.coords.map((entry: any, index: number) => {
        // Handle both object format {x, y, z} and array format [x, y, z]
        let x, y, z;
        if (entry && typeof entry === 'object') {
            if (Array.isArray(entry)) {
                // Array format: [x, y, z]
                x = entry[0];
                y = entry[1]; 
                z = entry[2];
            } else {
                // Object format: {x, y, z}
                x = entry.x;
                y = entry.y;
                z = entry.z;
            }
        }

        return {
            coords: { x, y, z },
            id: String(index),
            featrix_meta: {
                // Don't use deprecated cluster_pre - use direct lookup from finalClusterResults
                webgl_id: null,
                __featrix_row_id: index,
                __featrix_row_offset: index,
            },
            original: {}
        };
    });
    
    // Add points to sphere
    add_points_to_sphere(sphere, recordList);
    
    // Force initial render
    render_sphere(sphere);
    
    console.log(`✅ Sphere initialized with ${recordList.length} points`);
}

export function play_training_movie(sphere: SphereData, durationSeconds: number = 10) {
    if (!sphere.trainingMovieData || sphere.isPlayingMovie) return;
    
    sphere.isPlayingMovie = true;
    
    const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => {
        const epochA = parseInt(a.replace('epoch_', ''));
        const epochB = parseInt(b.replace('epoch_', ''));
        return epochA - epochB;
    });
    const totalFrames = epochKeys.length;
    const frameDelay = (durationSeconds * 1000) / totalFrames;
    

    
    sphere.currentEpoch = 0;
    sphere.isInRotationPhase = false;
    sphere.rotationStartTime = undefined;
    sphere.rotationStartAngle = undefined;
    
    const animate = () => {
        if (!sphere.isPlayingMovie) return;
        
        if (!sphere.isInRotationPhase) {
            // Training phase
            const currentEpochKey = epochKeys[sphere.currentEpoch];
            const epochData = sphere.trainingMovieData?.[currentEpochKey];
            
            // Check if this epoch has valid data before updating
            if (epochData && epochData.coords && epochData.coords.length > 0) {
                // Update frame
                update_training_movie_frame(sphere, currentEpochKey);
            } else {
                console.warn(`⚠️ Skipping problematic epoch ${currentEpochKey} (frame ${sphere.currentEpoch})`);
            }
        } else {
            // Rotation phase - 0.5 degrees per frame at 30fps
            const frameRate = 30; // 30 fps
            const degreesPerFrame = 0.5; // 0.5 degrees per frame
            const elapsed = Date.now() - (sphere.rotationStartTime || 0);
            
            // Calculate how many frames should have passed
            const expectedFrames = Math.floor((elapsed / 1000) * frameRate);
            const currentAngle = expectedFrames * (degreesPerFrame * Math.PI / 180); // Convert degrees to radians
            
            // Update camera angle smoothly
            sphere.angle = (sphere.rotationStartAngle || 0) + currentAngle;
            
            // Minimal rotation logging every 10 seconds
            if (Math.floor(elapsed / 10000) !== Math.floor((elapsed - 33) / 10000)) {
                console.log(`🔄 ROTATION: ${(currentAngle * 180 / Math.PI).toFixed(0)}°`);
            }
            
            render_sphere(sphere);
            
            // Update frame counter for rotation
            if (sphere.frameUpdateCallback) {
                sphere.frameUpdateCallback({
                    current: totalFrames,
                    total: totalFrames,
                    visible: 12, // Show all clusters during rotation
                    phase: `rotating (${(currentAngle * 180 / Math.PI).toFixed(0)}°)`
                });
            }
            
            // Continue rotation indefinitely at 30fps
        }
        
        // Only increment epoch during training phase, not during rotation
        if (!sphere.isInRotationPhase) {
            sphere.currentEpoch++;
            
            if (sphere.currentEpoch >= totalFrames) {
                // Training complete, start rotation phase
                
                // Set final converged state before rotation
                const finalEpochKey = epochKeys[epochKeys.length - 1];
                update_training_movie_frame(sphere, finalEpochKey, true); // Force final state
                
                sphere.isInRotationPhase = true;
                sphere.rotationStartTime = Date.now();
                sphere.rotationStartAngle = sphere.angle; // Current camera angle
            }
        }
        
        // Schedule next frame or rotation update
        if (sphere.isPlayingMovie) {
            if (sphere.isInRotationPhase) {
                // 30fps for smooth rotation (33.33ms per frame)
                sphere.movieAnimationRef = setTimeout(animate, 1000 / 30);
            } else {
                // Normal training frame rate
                sphere.movieAnimationRef = setTimeout(animate, frameDelay);
            }
        }
    };
    
    // Start immediately
    animate();
}

export function stop_training_movie(sphere: SphereData) {
    sphere.isPlayingMovie = false;
    if (sphere.movieAnimationRef) {
        clearTimeout(sphere.movieAnimationRef);
        sphere.movieAnimationRef = 0;
    }
    
    // Stop any ongoing interpolation
    stop_point_interpolation(sphere);
}

export function pause_training_movie(sphere: SphereData) {
    sphere.isPlayingMovie = false;
    if (sphere.movieAnimationRef) {
        clearTimeout(sphere.movieAnimationRef);
        sphere.movieAnimationRef = 0;
    }

}

export function resume_training_movie(sphere: SphereData) {
    if (!sphere.trainingMovieData) {
        console.warn('No training data to resume');
        return;
    }
    
    if (sphere.isPlayingMovie) {
        return;
    }
    
    // Resume from current epoch
    play_training_movie(sphere, 10);
}

export function step_training_movie_frame(sphere: SphereData, direction: 'forward' | 'backward') {
    if (!sphere.trainingMovieData) {
        console.warn('No training data for frame stepping');
        return;
    }
    
    // Pause rotation and allow scrubbing
    if (sphere.isInRotationPhase) {
        pause_training_movie(sphere);
        sphere.isInRotationPhase = false;
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
    
    console.log(`🎮 Step ${direction}: frame ${currentIndex} → ${newIndex} (epoch ${epochKey})`);
    
    update_training_movie_frame(sphere, epochKey);
}

export function goto_training_movie_frame(sphere: SphereData, frameNumber: number) {
    if (!sphere.trainingMovieData) {
        console.warn('No training data for frame navigation');
        return;
    }
    
    // Pause rotation and allow scrubbing
    if (sphere.isInRotationPhase) {
        pause_training_movie(sphere);
        sphere.isInRotationPhase = false;
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
    
    console.log(`🎯 Goto frame: ${frameNumber} → index ${targetIndex} (epoch ${epochKey})`);
    
    update_training_movie_frame(sphere, epochKey);
}

// Smooth interpolation functions
function start_point_interpolation(sphere: SphereData, targetPositions: Map<string, THREE.Vector3>, duration: number = 300) {
    // Starting smooth interpolation
    
    // Initialize interpolation state
    sphere.pointTargetPositions = targetPositions;
    sphere.pointStartPositions = new Map();
    sphere.interpolationStartTime = Date.now();
    sphere.interpolationDuration = duration;
    sphere.isInterpolating = true;
    
    // Store current positions as start positions
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        sphere.pointStartPositions?.set(recordId, mesh.position.clone());
    });
    
    // Start interpolation animation loop
    animate_interpolation(sphere);
}

function animate_interpolation(sphere: SphereData) {
    if (!sphere.isInterpolating || !sphere.interpolationStartTime || !sphere.interpolationDuration) {
        return;
    }
    
    const elapsed = Date.now() - sphere.interpolationStartTime;
    const progress = Math.min(elapsed / sphere.interpolationDuration, 1.0);
    
    // Ease-out interpolation for smoother movement
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    
    // Update all point positions
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        const startPos = sphere.pointStartPositions?.get(recordId);
        const targetPos = sphere.pointTargetPositions?.get(recordId);
        
        if (startPos && targetPos) {
            // Interpolate between start and target positions
            mesh.position.lerpVectors(startPos, targetPos, easedProgress);
        }
    });
    
    // Re-render the sphere
    render_sphere(sphere);
    
    // Continue animation or finish
    if (progress < 1.0) {
        sphere.interpolationAnimationRef = requestAnimationFrame(() => animate_interpolation(sphere));
    } else {
        // Interpolation complete - store final positions in memory trail history
        sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
            store_point_position_in_history(sphere, recordId, mesh.position);
        });
        
        // Update memory trails with new positions
        update_memory_trails(sphere);
        
        sphere.isInterpolating = false;
        sphere.pointTargetPositions = undefined;
        sphere.pointStartPositions = undefined;
    
    }
}

function stop_point_interpolation(sphere: SphereData) {
    if (sphere.interpolationAnimationRef) {
        cancelAnimationFrame(sphere.interpolationAnimationRef);
        sphere.interpolationAnimationRef = undefined;
    }
    sphere.isInterpolating = false;
    sphere.pointTargetPositions = undefined;
    sphere.pointStartPositions = undefined;
}

// Helper function to get the active cluster count key from finalClusterResults
function get_active_cluster_count_key(sphere: SphereData): number | null {
    if (!sphere.finalClusterResults || Object.keys(sphere.finalClusterResults).length === 0) {
        return null;
    }
    
    // Find the cluster count key that has cluster_labels
    const clusterKeys = Object.keys(sphere.finalClusterResults)
        .map(k => parseInt(k))
        .filter(k => !isNaN(k) && sphere.finalClusterResults[k]?.cluster_labels)
        .sort((a, b) => b - a); // Sort descending to get highest first
    
    return clusterKeys.length > 0 ? clusterKeys[0] : null;
}

function update_training_movie_frame(sphere: SphereData, epochKey: string, forceFinalState: boolean = false) {
    const epochData = sphere.trainingMovieData?.[epochKey];
    
    if (!epochData || !epochData.coords) {
        console.warn(`⚠️ Missing epoch data for ${epochKey}, skipping frame`);
        return;
    }
    
    if (epochData.coords.length === 0) {
        console.warn(`⚠️ Empty coords for epoch ${epochKey}, skipping frame`);
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
    
    // DEBUG: Log cluster calculation for debugging
    console.log(`📊 Frame ${currentFrameIndex}/${totalFrames-1}: progress ${progressRatio.toFixed(3)} -> ${visibleClusters} visible clusters (maxClusters: ${maxClusters})`);
    
    // Sample a few cluster assignments to verify they're being read correctly
    if (sphere.pointObjectsByRecordID.size > 0) {
        const sampleSize = Math.min(5, sphere.pointObjectsByRecordID.size);
        let sampleCount = 0;
        const activeClusterKey = get_active_cluster_count_key(sphere);
        if (activeClusterKey !== null && sphere.finalClusterResults[activeClusterKey]?.cluster_labels) {
            sphere.pointObjectsByRecordID.forEach((mesh, recordId) => {
                if (sampleCount < sampleSize) {
                    const record = sphere.pointRecordsByID.get(recordId);
                    if (record) {
                        const rowOffset = record.featrix_meta?.__featrix_row_offset;
                        if (rowOffset !== undefined && rowOffset < sphere.finalClusterResults[activeClusterKey].cluster_labels.length) {
                            const clusterAssignment = sphere.finalClusterResults[activeClusterKey].cluster_labels[rowOffset];
                            console.log(`  Sample point ${sampleCount}: rowOffset=${rowOffset}, cluster=${clusterAssignment}`);
                            sampleCount++;
                        }
                    }
                }
            });
        }
    }
    
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
            validationLoss: validationLoss
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
        console.error('❌ NO POINTS TO PROCESS - sphere.pointObjectsByRecordID is empty!');
        return;
    }
    
    // Update positions and colors of existing points
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        totalPoints++;
        const rowOffset = parseInt(recordId); // We used index as record ID
        
        // DEBUG: Show rowOffset calculation for first few points
        if (totalPoints <= 10) {
            console.log(`🔢 Point ${totalPoints-1}: recordId="${recordId}" -> rowOffset=${rowOffset} (type: ${typeof rowOffset})`);
        }
        
        if (rowOffset < epochData.coords.length) {
            const newCoords = epochData.coords[rowOffset];
            
            // Handle both object format {x, y, z} and array format [x, y, z]
            let x, y, z;
            if (newCoords && typeof newCoords === 'object') {
                if (Array.isArray(newCoords)) {
                    // Array format: [x, y, z]
                    x = newCoords[0];
                    y = newCoords[1]; 
                    z = newCoords[2];
                } else {
                    // Object format: {x, y, z}
                    x = newCoords.x;
                    y = newCoords.y;
                    z = newCoords.z;
                }
            }
            
            if (typeof x === 'number' && !isNaN(x) &&
                typeof y === 'number' && !isNaN(y) &&
                typeof z === 'number' && !isNaN(z)) {
                    
                // Store target position for smooth interpolation instead of direct movement
                targetPositions.set(recordId, new THREE.Vector3(x, y, z));
                validPoints++;
                
                // TRAINING MOVIE: Use direct lookup from finalClusterResults, fallback to cluster_pre from epoch data
                const record = sphere.pointRecordsByID.get(recordId);
                let clusterAssignment = -1;
                
                // First try to use finalClusterResults if available
                const activeClusterKey = get_active_cluster_count_key(sphere);
                if (activeClusterKey !== null && sphere.finalClusterResults[activeClusterKey]?.cluster_labels) {
                    const rowOffset = record?.featrix_meta?.__featrix_row_offset;
                    if (rowOffset !== undefined && rowOffset < sphere.finalClusterResults[activeClusterKey].cluster_labels.length) {
                        clusterAssignment = sphere.finalClusterResults[activeClusterKey].cluster_labels[rowOffset];
                    }
                }
                
                // Fallback: Use cluster_pre from the current epoch's coord data if finalClusterResults not available
                if (clusterAssignment === -1 && epochData.coords) {
                    const coordIndex = epochData.coords.findIndex((c: any) => {
                        const coordRowOffset = c.__featrix_row_offset;
                        const recordRowOffset = record?.featrix_meta?.__featrix_row_offset;
                        return coordRowOffset !== undefined && coordRowOffset === recordRowOffset;
                    });
                    if (coordIndex >= 0 && epochData.coords[coordIndex].cluster_pre !== undefined) {
                        clusterAssignment = epochData.coords[coordIndex].cluster_pre;
                    }
                }
                
                // Use direct color mapping - cluster assignments are 0-based
                let newColor;
                if (clusterAssignment >= 0 && clusterAssignment < visibleClusters && clusterAssignment < kColorTable.length) {
                    // Direct mapping - cluster 0 -> color 0, cluster 1 -> color 1, etc.
                    newColor = kColorTable[clusterAssignment];
                } else if (clusterAssignment >= 0 && clusterAssignment >= visibleClusters) {
                    // Cluster exists but not yet revealed in this frame
                    newColor = 0x999999; // Gray for unrevealed clusters
                } else {
                    // Invalid or missing cluster assignment
                    newColor = 0x999999; // Gray for invalid
                }
                
                // Apply the color to the mesh
                if (mesh.material instanceof THREE.MeshBasicMaterial) {
                    mesh.material.color.set(newColor);
                    mesh.material.needsUpdate = true;
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
                         console.warn(`⚠️ BAD FRAME DATA - Point ${rowOffset} in epoch ${epochKey}: ${issues.join(', ')}. Full object:`, newCoords);
                      }
                      invalidPoints++;
                  }
             }
         });
    
    // Report frame data quality statistics
    const invalidPercentage = ((invalidPoints / totalPoints) * 100).toFixed(1);
    if (invalidPoints > 0) {
        console.warn(`📊 Frame ${epochKey} DATA QUALITY: ${validPoints}/${totalPoints} valid points (${invalidPercentage}% invalid)`);
    } else {
    
    }
    
    // Update positions with smooth interpolation for fluid movement
    if (targetPositions.size > 0) {
        // Stop any current interpolation before starting new one
        stop_point_interpolation(sphere);
        
        // Start smooth interpolation to target positions
        // Calculate optimal interpolation duration based on frame timing
        const epochKeys = Object.keys(sphere.trainingMovieData || {});
        const frameDelay = (10 * 1000) / epochKeys.length; // Same calc as play_training_movie
        const interpolationDuration = Math.max(50, frameDelay * 0.8); // 80% of frame delay to finish before next frame
        
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
    console.log("got here! clearing colors...")   

    for (const record_id of sphere.pointRecordsByID.keys()) {
        change_object_color(sphere, record_id, GRAY);
    }
}

function createGreatCircleArc(start: THREE.Vector3, end: THREE.Vector3, segments: number = 16): THREE.Vector3[] {
    // Calculate great circle arc between two points on a sphere
    const points: THREE.Vector3[] = [];
    
    // Get the average radius to scale the arc
    const avgRadius = (start.length() + end.length()) / 2;
    
    // Normalize vectors to ensure they're on unit sphere
    const startNorm = start.clone().normalize();
    const endNorm = end.clone().normalize();
    
    // Calculate the angle between the vectors
    const angle = startNorm.angleTo(endNorm);
    
    // If points are very close, just return interpolated line
    if (angle < 0.01) {
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const point = new THREE.Vector3().lerpVectors(start, end, t);
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
    
    // Clear existing trail lines
    while (sphere.memoryTrailsGroup.children.length > 0) {
        const child = sphere.memoryTrailsGroup.children[0];
        sphere.memoryTrailsGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }
    
    // Create trails for each point
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        const history = sphere.pointPositionHistory?.get(recordId);
        if (!history || history.length < 2) return;
        
        // Get point color
        const pointColor = pointMesh.material.color;
        
        // Create trail segments (up to 5 segments)
        const maxSegments = Math.min(5, history.length - 1);
        
        // First pass: calculate all distances to determine max distance for normalization
        const distances: number[] = [];
        for (let i = 0; i < maxSegments; i++) {
            const currentPos = history[0].clone();
            const previousPos = history[i + 1].clone();
            const distance = currentPos.distanceTo(previousPos);
            distances.push(distance);
        }
        const maxDistance = Math.max(...distances);
        const minDistance = Math.min(...distances);
        const distanceRange = maxDistance - minDistance;
        
        for (let i = 0; i < maxSegments; i++) {
            // Create great circle arc from current position to previous position
            const currentPos = history[0].clone();
            const previousPos = history[i + 1].clone();
            const distance = distances[i];
            
            // Alpha decreases as distance increases (longer segments are lighter)
            // Keep big jumps very translucent even for current epoch
            // Shorter segments: alpha = 0.4 (reduced from 0.9)
            // Longer segments: alpha = 0.05 (reduced from 0.2)
            let alpha;
            if (distanceRange > 0.001) {
                const normalizedDistance = (distance - minDistance) / distanceRange;
                // More aggressive curve - big jumps stay very faint
                const exponentialFactor = Math.pow(normalizedDistance, 1.5); // Make big jumps even fainter
                alpha = 0.4 - (exponentialFactor * 0.35); // 0.4 to 0.05
            } else {
                alpha = 0.4; // All segments same distance - keep moderate
            }
            
            // Generate great circle arc points
            // Adjust segments based on arc length for efficiency
            const segments = Math.max(4, Math.min(16, Math.floor(distance * 8))); // 4-16 segments based on distance
            const arcPoints = createGreatCircleArc(currentPos, previousPos, segments);
            
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(arcPoints);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: pointColor.clone(),
                transparent: true,
                opacity: alpha,
                linewidth: 1
            });
            
            const line = new THREE.Line(lineGeometry, lineMaterial);
            sphere.memoryTrailsGroup.add(line);
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
        console.error("record not found for record_id: ", record_id);
        return;
    }

    // The object can have multiple materials. We don't deal with mutliple materials.
    // Not all materials have a simple "color" property - only MeshBasicMaterial does.
    const has_multiple_materials = Array.isArray(object.material);
    if ( has_multiple_materials || !(object.material instanceof THREE.MeshBasicMaterial)) {
        console.error("Attempted to change the color of an object with multiple materials or a non-MeshBasicMaterial material.");
        return
    }

    object.material.color.set(color);
    object.material.needsUpdate = true;
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

        if (pinchDistance > sphere.prevPinchDistance) {
            zoom_sphere(sphere, true);
        } else {
            zoom_sphere(sphere, false);
        }
        
        sphere.prevPinchDistance = pinchDistance;
    }

    render_sphere(sphere)
};


const onTouchEnd = (sphere: SphereData, event: TouchEvent) => {
    sphere.isDragging = false;
    sphere.prevPinchDistance = null;

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
    if (object.material instanceof THREE.MeshBasicMaterial) {
        return object.material.color;
    } else {
        console.error("Object material is not a MeshBasicMaterial. Cannot retrieve color.");
        return null;
    }
}

export function get_object_color_string(object: THREE.Mesh): string | null {
    const color = get_object_color(object);
    
    return color !== null ? `#${color.getHexString()}` : null;
}

export function add_selected_record(sphere: SphereData, record_id: string) {
    const object = sphere.pointObjectsByRecordID.get(record_id)
    if (object === undefined) {
        console.error("record not found for record_id: ", record_id);
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
        console.error("record not found for record_id: ", record_id);
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
            console.log("Selected object has no record_id.");
            return;
        }

        // Send point inspection event with detailed info
        const record = sphere.pointRecordsByID.get(record_id);
        const pointInfo = {
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

export function show_convex_hulls(sphere: SphereData) {
    if (!sphere) {
        console.warn('🔗 show_convex_hulls: No sphere provided');
        return;
    }
    
    console.log('🔗 show_convex_hulls called - points:', sphere.pointObjectsByRecordID?.size || 0);
    
    // Create convex hulls group if it doesn't exist
    if (!sphere.convexHullsGroup) {
        sphere.convexHullsGroup = new THREE.Group();
        sphere.scene.add(sphere.convexHullsGroup);
        console.log('🔗 Created convex hulls group');
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
                console.warn('📦 No points available for bounds box');
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
            
            console.log('📦 Bounds box created:', { size: boxSize, center: boxCenter });
        } else {
            // Show existing bounds box
            if (sphere.boundsBox.parent === null) {
                sphere.scene.add(sphere.boundsBox);
            }
            sphere.boundsBox.visible = true;
        }
    } else {
        // Hide bounds box
        if (sphere.boundsBox) {
            sphere.boundsBox.visible = false;
        }
    }
    
    render_sphere(sphere);
}

export function compute_cluster_convex_hulls(sphere: SphereData) {
    const hasPointFeature = sphere.showDynamicPoints;
    const hasHullFeature = sphere.showDynamicHulls;
    
    if (!hasPointFeature && !hasHullFeature) {
        console.log('🔗 Dynamic features: Both disabled');
        return;
    }
    
    if (!sphere.pointPositionHistory) {
        console.log('🔗 No position history available for dynamic features');
        return;
    }
    
    console.log(`🔗 Computing dynamic features: Points=${hasPointFeature}, Hulls=${hasHullFeature}`);
    
    // Update individual point sizes if enabled, otherwise reset to default
    if (hasPointFeature) {
        update_dynamic_point_sizes(sphere);
    } else {
        reset_point_sizes_to_default(sphere);
    }
    
    // Create dynamic cluster hulls if enabled
    if (hasHullFeature) {
        create_dynamic_cluster_hulls(sphere);
    } else {
        // Hide hulls if disabled
        hide_convex_hulls(sphere);
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
        if (pointMesh.material instanceof THREE.MeshBasicMaterial) {
            pointMesh.material.transparent = true;
            pointMesh.material.opacity = opacity;
            pointMesh.material.needsUpdate = true;
        }
        
        pointsResized++;
    });
    
    console.log('🔹 Resized', pointsResized, 'points with dynamic size + opacity');
}

function reset_point_sizes_to_default(sphere: SphereData) {
    let pointsReset = 0;
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        // Reset to default scale and opacity
        pointMesh.scale.setScalar(1.0); // Default scale
        if (pointMesh.material instanceof THREE.MeshBasicMaterial) {
            pointMesh.material.transparent = false;
            pointMesh.material.opacity = 1.0; // Fully opaque
            pointMesh.material.needsUpdate = true;
        }
        pointsReset++;
    });
    
    console.log('🔹 Reset', pointsReset, 'points to default size + opacity');
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
    
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        const record = sphere.pointRecordsByID.get(recordId);
        if (!record || record.featrix_meta.cluster_pre === null) return;
        
        const cluster = record.featrix_meta.cluster_pre;
        const currentPos = pointMesh.position.clone();
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
    
    console.log('🔷 Found', clusterData.size, 'clusters for dynamic hulls');
    
    // Create dynamic sphere hulls for each cluster
    let hullsCreated = 0;
    clusterData.forEach((clusterInfo, cluster) => {
        if (clusterInfo.points.length >= 3) { // Need at least 3 points for a meaningful sphere
            // Calculate sphere scale and opacity based on cluster movement
            const movementScale = Math.max(1.0, Math.min(3.0, 1.0 + clusterInfo.movementEnvelope * 5.0));
            const sphereOpacity = Math.max(0.05, Math.min(0.2, 0.2 - clusterInfo.movementEnvelope * 0.3));
            
            create_dynamic_sphere_hull(sphere, clusterInfo.points, clusterInfo.color, cluster, movementScale, sphereOpacity);
            hullsCreated++;
        }
    });
    
    console.log('🔷 Created', hullsCreated, 'DYNAMIC cluster hulls with movement-based sizing');
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
            
            sphere.convexHullsGroup.add(sphereMesh);
            
            console.log(`🔮 Created DYNAMIC sphere for cluster ${cluster}: radius=${(boundingSphere.radius * scale).toFixed(3)}, opacity=${opacity.toFixed(2)}`);
        }
    } catch (error) {
        console.warn(`Failed to create dynamic sphere for cluster ${cluster}:`, error);
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
    
    // Find maximum distance from center to any point
    let maxDistance = 0;
    points.forEach(point => {
        const distance = center.distanceTo(point);
        maxDistance = Math.max(maxDistance, distance);
    });
    
    // Add a small padding to ensure all points are inside
    const radius = maxDistance * 1.1;
    
    return { center, radius };
}

export function update_cluster_spotlight(sphere: SphereData) {
    // Clear existing spotlight
    if (sphere.clusterSpotlightGroup) {
        sphere.scene.remove(sphere.clusterSpotlightGroup);
        sphere.clusterSpotlightGroup = undefined;
    }
    
    const spotlightCluster = sphere.spotlightCluster;
    
    // If spotlight is off (-1) or no cluster selected, return
    if (spotlightCluster === undefined || spotlightCluster < 0) {
        console.log('🎯 Cluster spotlight: OFF');
        return;
    }
    
    console.log('🎯 Creating cluster spotlight for cluster:', spotlightCluster);
    
    // Find the active cluster count key from finalClusterResults
    const activeClusterCountKey = get_active_cluster_count_key(sphere);
    if (activeClusterCountKey !== null) {
        console.log(`🎯 Using cluster count key: ${activeClusterCountKey}`);
    }
    
    // Create spotlight group
    sphere.clusterSpotlightGroup = new THREE.Group();
    sphere.scene.add(sphere.clusterSpotlightGroup);
    
    // Find all points in the selected cluster
    const clusterPoints: { position: THREE.Vector3, color: THREE.Color }[] = [];
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        const record = sphere.pointRecordsByID.get(recordId);
        if (record) {
            let clusterAssignment = -1;
            
            // Use final cluster results if available (training movie)
            if (activeClusterCountKey !== null && sphere.finalClusterResults[activeClusterCountKey]?.cluster_labels) {
                const rowOffset = record.featrix_meta?.__featrix_row_offset;
                if (rowOffset !== undefined && rowOffset < sphere.finalClusterResults[activeClusterCountKey].cluster_labels.length) {
                    clusterAssignment = sphere.finalClusterResults[activeClusterCountKey].cluster_labels[rowOffset];
                }
            } else if (record.featrix_meta.cluster_pre !== undefined) {
                // Fallback to cluster_pre
                clusterAssignment = record.featrix_meta.cluster_pre;
            }
            
            if (clusterAssignment === spotlightCluster) {
                clusterPoints.push({
                    position: pointMesh.position.clone(),
                    color: pointMesh.material.color.clone()
                });
            }
        }
    });
    
    if (clusterPoints.length === 0) {
        console.log('🎯 No points found for cluster:', spotlightCluster);
        return;
    }
    
    console.log(`🎯 Found ${clusterPoints.length} points in cluster ${spotlightCluster}`);
    
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
    
    console.log(`🎯 Created ${clusterPoints.length + 1} spotlight lines for cluster ${spotlightCluster}`);
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
    // Simple approach: create a hull from the extremal points
    if (points.length < 4) return points;
    
    // Find extremal points in each direction
    let minX = points[0], maxX = points[0];
    let minY = points[0], maxY = points[0]; 
    let minZ = points[0], maxZ = points[0];
    
    for (const point of points) {
        if (point.x < minX.x) minX = point;
        if (point.x > maxX.x) maxX = point;
        if (point.y < minY.y) minY = point;
        if (point.y > maxY.y) maxY = point;
        if (point.z < minZ.z) minZ = point;
        if (point.z > maxZ.z) maxZ = point;
    }
    
    // Return unique extremal points
    const extremalPoints = [minX, maxX, minY, maxY, minZ, maxZ];
    const uniquePoints: THREE.Vector3[] = [];
    
    for (const point of extremalPoints) {
        const isDuplicate = uniquePoints.some(existing => 
            existing.distanceTo(point) < 0.001
        );
        if (!isDuplicate) {
            uniquePoints.push(point);
        }
    }
    
    return uniquePoints;
}

function create_convex_hull_mesh(sphere: SphereData, hullPoints: THREE.Vector3[], clusterColor: THREE.Color, cluster: number) {
    if (!sphere.convexHullsGroup || hullPoints.length < 4) return;
    
    try {
        // Create FILLED convex hull with triangulated faces
        const filledGeometry = create_filled_hull_geometry(hullPoints);
        
        if (filledGeometry) {
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
            const filledMesh = new THREE.Mesh(filledGeometry, filledMaterial);
            const wireframeMesh = new THREE.Mesh(filledGeometry.clone(), wireframeMaterial);
            
            // Add both to convex hulls group
            sphere.convexHullsGroup.add(filledMesh);
            sphere.convexHullsGroup.add(wireframeMesh);
            
            console.log(`✨ Created FILLED convex hull for cluster ${cluster} with ${hullPoints.length} vertices`);
        } else {
            console.warn(`⚠️ Failed to create filled geometry for cluster ${cluster}`);
        }
        
    } catch (error) {
        console.warn(`Failed to create convex hull for cluster ${cluster}:`, error);
    }
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
        console.warn('Error creating filled hull geometry:', error);
        return null;
    }
}
