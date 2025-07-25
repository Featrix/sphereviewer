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
    animateClusters: boolean;
    clusterAnimationRef: number;
    currentCluster: number;
    jsonData?: any;
    
    // Visual controls
    pointSize: number;
    pointOpacity: number;
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
        movieAnimationRef: 0
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
    // the old cluster.
    if (new_n_clusters > base_n_clusters) {
        // for every old cluster, figure out which new cluster contains the most points
        // from the old cluster. Then, remap the cluster idx of that new cluster to
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

    // Case 2: decreasing the number of clusters
    else if (new_n_clusters < base_n_clusters) {
        throw new Error("Decreasing the number of clusters is not yet supported");
    }

    // Case 3: keeping the number of clusters the same
    // This can happen when we change the clustering criterion.
    else if (new_n_clusters === base_n_clusters) {
        throw new Error("Keeping the number of clusters the same is not yet supported");
    }
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
        sphere.angle += sphere.rotationSpeed * dt / 1000  * Math.PI;
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
    
    // Load logistics cluster data from the actual JSON file
    let logisticsClusterData = null;
    try {
        // Use fetch to load the actual logistics data file
        fetch('/logistics-featrix-data.json')
            .then(response => response.json())
            .then(data => {
                
                if (data.entire_cluster_results) {
                    // Use the logistics data but expand it to 12 clusters for the training movie
                    const originalLabels = data.entire_cluster_results["2"] ? data.entire_cluster_results["2"].cluster_labels : [];
                    
                                         // Generate 12-cluster pattern with better distribution
                     const expandedLabels = Array(500).fill(0).map((_, i) => {
                         if (i < originalLabels.length && originalLabels[i] !== undefined) {
                             // Mix original pattern with index-based distribution
                             return (originalLabels[i] + Math.floor(i / 42)) % 12;
                         }
                         return i % 12;
                     });
                    
                    sphere.logisticsClusterData = {
                        "12": { "cluster_labels": expandedLabels }
                    };
                    

                    sphere.trainingMovieMaxClusters = 11; // 0-11 = 12 clusters
                } else {
                    console.error('❌ No cluster results found in logistics data');
                    // Fallback to 12-cluster pattern
                    sphere.logisticsClusterData = {
                        "12": { "cluster_labels": Array(500).fill(0).map((_, i) => i % 12) }
                    };
                }
            })
            .catch(error => {
                console.error('❌ Failed to load logistics-featrix-data.json:', error);
                // Fallback to 12-cluster pattern
                sphere.logisticsClusterData = {
                    "12": { "cluster_labels": Array(500).fill(0).map((_, i) => i % 12) }
                };
            });
    } catch (error) {
        console.error('❌ Error setting up logistics data fetch:', error);
    }
    
    // Set cluster range for progressive reveal
    const maxCluster = 1; // Logistics data has clusters 0,1
    // Logistics cluster analysis completed
    sphere.trainingMovieMaxClusters = maxCluster;
    sphere.trainingMovieStartClusters = 2; // Start showing 2 clusters
    
    // Initialize sphere with first epoch data
    const epochKeys = Object.keys(trainingMovieData).sort((a, b) => parseInt(a) - parseInt(b));
    const firstEpochKey = epochKeys[0];
    const firstEpochData = trainingMovieData[firstEpochKey];
    
    // Process first epoch data
        
        // Check if cluster data exists anywhere
        if (firstEpochData && firstEpochData.entire_cluster_results) {
            const clusterResultsKeys = Object.keys(firstEpochData.entire_cluster_results);
            console.log('🎯 Available cluster counts:', clusterResultsKeys);
            
            if (clusterResultsKeys.length > 0) {
                const sampleCount = clusterResultsKeys[0];
                const sampleResult = firstEpochData.entire_cluster_results[sampleCount];
                console.log(`🎯 Sample cluster result for ${sampleCount} clusters:`, sampleResult);
                if (sampleResult.cluster_labels) {
                    console.log(`🎯 First 10 cluster labels:`, sampleResult.cluster_labels.slice(0, 10));
                }
            } else {
                console.log('❌ entire_cluster_results is EMPTY - no cluster data found!');
                console.log('🔍 Need to find working session with cluster data');
            }
        } else {
            console.log('❌ No entire_cluster_results field found');
        }
        
        if (firstEpochData && firstEpochData.coords) {
                // Debug coordinate format for development
        
        // The coords are already in full sphere record format, just need to extract coordinates
        const recordList: SphereRecord[] = firstEpochData.coords.map((entry: any, index: number) => {
            
            // Parse coordinate entry
            
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

        const record = {
            coords: {
                x: x,
                y: y,
                z: z
            },
                id: String(index),
                featrix_meta: {
                    cluster_pre: 0, // Will be set from logistics data during animation
                    webgl_id: null,
                    __featrix_row_id: index,
                    __featrix_row_offset: index,
                },
                original: {
                    // Entry is coordinate array [x, y, z], no additional properties
                }
            };
            
            // Record created successfully
            
            return record;
        });
        
        // Add points to sphere
        add_points_to_sphere(sphere, recordList);
        
        // Force render
        render_sphere(sphere);
    } else {
        console.error('🎬 No coords found in first epoch data');
    }
}

export function play_training_movie(sphere: SphereData, durationSeconds: number = 10) {
    if (!sphere.trainingMovieData || sphere.isPlayingMovie) return;
    
    sphere.isPlayingMovie = true;
    
    const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => parseInt(a) - parseInt(b));
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
            // Rotation phase - 8 full rotations over ~4 seconds
            const rotationDuration = 4000; // 4 seconds for 8 rotations
            const totalRotations = 8;
            const elapsed = Date.now() - (sphere.rotationStartTime || 0);
            const rotationProgress = Math.min(elapsed / rotationDuration, 1.0);
            
            if (rotationProgress < 1.0) {
                // Still rotating - update camera angle
                const rotationAmount = totalRotations * 2 * Math.PI * rotationProgress; // 8 full rotations
                sphere.angle = (sphere.rotationStartAngle || 0) + rotationAmount;
                
                render_sphere(sphere);
                
                // Update frame counter for rotation
                if (sphere.frameUpdateCallback) {
                    sphere.frameUpdateCallback({
                        current: totalFrames,
                        total: totalFrames,
                        visible: 12, // Show all clusters during rotation
                        phase: `rotating (${(rotationProgress * 100).toFixed(0)}%)`
                    });
                }
                
                // Rotation in progress
            } else {
                // Rotation complete, restart training
                
                sphere.currentEpoch = 0;
                sphere.isInRotationPhase = false;
                sphere.rotationStartTime = undefined;
                sphere.rotationStartAngle = undefined;
                
                // Reset frame counter display for restart
                if (sphere.frameUpdateCallback) {
                    sphere.frameUpdateCallback({
                        current: 1,
                        total: totalFrames,
                        visible: 2 // Starting clusters
                    });
                }
            }
        }
        
        // Only increment epoch during training phase, not during rotation
        if (!sphere.isInRotationPhase) {
            sphere.currentEpoch++;
            
            if (sphere.currentEpoch >= totalFrames) {
                // Training complete, start rotation phase

                sphere.isInRotationPhase = true;
                sphere.rotationStartTime = Date.now();
                sphere.rotationStartAngle = sphere.angle; // Current camera angle
            }
        }
        
        // Schedule next frame or rotation update
        if (sphere.isPlayingMovie) {
            sphere.movieAnimationRef = setTimeout(animate, frameDelay);
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
    
    // Can't step during rotation phase
    if (sphere.isInRotationPhase) {
        console.warn('Cannot step during rotation phase');
        return;
    }
    
    // Pause if currently playing
    if (sphere.isPlayingMovie) {
        pause_training_movie(sphere);
    }
    
    const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => parseInt(a) - parseInt(b));
    const currentIndex = sphere.currentEpoch || 0;
    
    let newIndex;
    if (direction === 'forward') {
        newIndex = (currentIndex + 1) % epochKeys.length;
    } else {
        newIndex = currentIndex <= 0 ? epochKeys.length - 1 : currentIndex - 1;
    }
    
    sphere.currentEpoch = newIndex;
    const epochKey = epochKeys[newIndex];
    

    update_training_movie_frame(sphere, epochKey);
}

export function goto_training_movie_frame(sphere: SphereData, frameNumber: number) {
    if (!sphere.trainingMovieData) {
        console.warn('No training data for frame navigation');
        return;
    }
    
    // Can't navigate during rotation phase
    if (sphere.isInRotationPhase) {
        console.warn('Cannot navigate during rotation phase');
        return;
    }
    
    // Pause if currently playing
    if (sphere.isPlayingMovie) {
        pause_training_movie(sphere);
    }
    
    const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => parseInt(a) - parseInt(b));
    const targetIndex = Math.max(0, Math.min(frameNumber - 1, epochKeys.length - 1)); // Convert 1-based to 0-based
    
    sphere.currentEpoch = targetIndex;
    const epochKey = epochKeys[targetIndex];
    

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

function update_training_movie_frame(sphere: SphereData, epochKey: string) {
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
    const epochKeys = Object.keys(sphere.trainingMovieData || {}).sort((a, b) => parseInt(a) - parseInt(b));
    const currentFrameIndex = epochKeys.indexOf(epochKey);
    const totalFrames = epochKeys.length;
    
    // Progressive cluster reveal: 2 to 12 clusters
    const startClusters = 2;
    const endClusters = 12;
    
    // Calculate how many clusters should be visible at this frame
    const progressRatio = currentFrameIndex / (totalFrames - 1);
    const clusterRange = endClusters - startClusters;
    const visibleClusters = startClusters + Math.floor(progressRatio * clusterRange);
    
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
    
    // Update positions and colors of existing points
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        totalPoints++;
        const rowOffset = parseInt(recordId); // We used index as record ID
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
                
                // Use logistics cluster data instead of broken cluster_pre
                let clusterAssignment = 0; // Default fallback
                
                // Get cluster assignment from logistics data
                const availableClusterKeys = Object.keys(sphere.logisticsClusterData || {});
                const clusterKey = availableClusterKeys.length > 0 ? availableClusterKeys[0] : "12";
                
                if (sphere.logisticsClusterData && sphere.logisticsClusterData[clusterKey] && sphere.logisticsClusterData[clusterKey].cluster_labels) {
                    const clusterLabels = sphere.logisticsClusterData[clusterKey].cluster_labels;
                    if (rowOffset < clusterLabels.length) {
                        const originalCluster = clusterLabels[rowOffset];
                        // REMAP cluster assignment to current visible range
                        // This prevents early frames from having too many gray points
                        clusterAssignment = originalCluster % visibleClusters;
                    }
                }
                
                // Update the record's cluster assignment
                const record = sphere.pointRecordsByID.get(recordId);
                if (record) {
                    record.featrix_meta.cluster_pre = clusterAssignment;
                }
                
                // PROGRESSIVE CLUSTER REVEAL with enhanced debugging
                let newColor;
                
                // Cluster assignment calculated
                
                // Check if cluster is valid first
                if (clusterAssignment === undefined || clusterAssignment === null) {
                    newColor = 0xff0000; // Red for undefined clusters
                } else if (clusterAssignment >= kColorTable.length) {
                    newColor = 0xff0000; // Red for out-of-range clusters
                } else if (clusterAssignment < visibleClusters) {
                    // Cluster is "revealed" - use its assigned color
                    newColor = kColorTable[clusterAssignment];
                } else {
                    // This should rarely happen now with remapping
                    newColor = 0x999999; // Gray for unrevealed clusters
                }
                
                                     // Apply the new color
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
    
    // Keep only last 6 positions (current + 5 previous)
    if (history.length > 6) {
        history.splice(6);
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

    if (sphere.isDragging) {

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

function compute_cluster_convex_hulls(sphere: SphereData) {
    if (!sphere.convexHullsGroup || !sphere.showConvexHulls) {
        console.log('🔗 compute_cluster_convex_hulls: Skipped - no group or disabled');
        return;
    }
    
    console.log('🔗 Computing convex hulls for', sphere.pointObjectsByRecordID?.size || 0, 'points');
    
    // Clear existing hulls
    hide_convex_hulls(sphere);
    sphere.showConvexHulls = true; // Reset flag after clearing
    
    // Group points by cluster
    const clusterPoints: Map<number, Array<{point: THREE.Vector3, color: THREE.Color}>> = new Map();
    
    sphere.pointObjectsByRecordID.forEach((pointMesh, recordId) => {
        const record = sphere.pointRecordsByID.get(recordId);
        if (!record || record.featrix_meta.cluster_pre === null) return;
        
        const cluster = record.featrix_meta.cluster_pre;
        const position = pointMesh.position.clone();
        const color = pointMesh.material.color.clone();
        
        if (!clusterPoints.has(cluster)) {
            clusterPoints.set(cluster, []);
        }
        clusterPoints.get(cluster)!.push({point: position, color});
    });
    
    console.log('🔗 Found clusters:', Array.from(clusterPoints.keys()), 'with points:', Array.from(clusterPoints.entries()).map(([k,v]) => `${k}:${v.length}`));
    
    // Create convex hulls for clusters with enough points (minimum 4 for 3D hull)
    let hullsCreated = 0;
    clusterPoints.forEach((points, cluster) => {
        if (points.length >= 4) {
            const hull = compute_3d_convex_hull(points.map(p => p.point));
            if (hull && hull.length > 0) {
                create_convex_hull_mesh(sphere, hull, points[0].color, cluster);
                hullsCreated++;
            }
        } else {
            console.log(`🔗 Cluster ${cluster} has only ${points.length} points (need 4+ for hull)`);
        }
    });
    
    console.log('🔗 Created', hullsCreated, 'convex hulls');
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
        // Create a simple wireframe connecting the extremal points
        // This creates a rough "hull" visualization using line segments
        
        // Create line segments connecting hull points
        const geometry = new THREE.BufferGeometry();
        const lines: THREE.Vector3[] = [];
        
        // Connect each point to every other point to create a wireframe hull
        for (let i = 0; i < hullPoints.length; i++) {
            for (let j = i + 1; j < hullPoints.length; j++) {
                lines.push(hullPoints[i]);
                lines.push(hullPoints[j]);
            }
        }
        
        geometry.setFromPoints(lines);
        
        // Create wireframe material with cluster color
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: clusterColor,
            transparent: true,
            opacity: 0.3,
            linewidth: 2
        });
        
        // Create line segments mesh
        const wireframeMesh = new THREE.LineSegments(geometry, wireframeMaterial);
        
        // Add to convex hulls group
        sphere.convexHullsGroup.add(wireframeMesh);
        
        console.log(`Created simple hull wireframe for cluster ${cluster} with ${hullPoints.length} vertices`);
        
    } catch (error) {
        console.warn(`Failed to create convex hull for cluster ${cluster}:`, error);
    }
}
