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
        console.log('🔧 Force-fixed canvas height to', effectiveHeight);
    }
}

function attach_sphere_to_container(sphere: SphereData) {
    console.log('🔧 Attaching sphere to container:', {
        containerSize: {
            width: sphere.container.clientWidth,
            height: sphere.container.clientHeight
        },
        rendererSize: {
            width: sphere.renderer.domElement.width,
            height: sphere.renderer.domElement.height
        },
        containerChildren: sphere.container.children.length
    });
    
    sphere.container.appendChild(sphere.renderer.domElement);
    
    console.log('🔧 After attachment:', {
        containerChildren: sphere.container.children.length,
        canvasStyle: sphere.renderer.domElement.style.cssText
    });
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
export function load_training_movie(sphere: SphereData, trainingMovieData: any) {
    console.log('🎬 Loading training movie data into sphere:', Object.keys(trainingMovieData).length, 'epochs');
    console.log('🎬 Training data structure:', trainingMovieData);
    
    sphere.trainingMovieData = trainingMovieData;
    sphere.currentEpoch = 0;
    
    // Analyze cluster range for progressive reveal
    let maxCluster = 0;
    Object.values(trainingMovieData).forEach((epochData: any) => {
        if (epochData?.coords) {
            epochData.coords.forEach((entry: any) => {
                if (entry.cluster_pre > maxCluster) {
                    maxCluster = entry.cluster_pre;
                }
            });
        }
    });
    
    console.log(`🎬 Cluster analysis: Found clusters 0 to ${maxCluster} (${maxCluster + 1} total clusters)`);
    sphere.trainingMovieMaxClusters = maxCluster;
    sphere.trainingMovieStartClusters = 2; // Start showing 2 clusters
    
    // Initialize sphere with first epoch data
    const epochKeys = Object.keys(trainingMovieData).sort((a, b) => parseInt(a) - parseInt(b));
    const firstEpochKey = epochKeys[0];
    const firstEpochData = trainingMovieData[firstEpochKey];
    
    console.log('🎬 First epoch key:', firstEpochKey);
    console.log('🎬 First epoch data:', firstEpochData);
    
    if (firstEpochData && firstEpochData.coords) {
        console.log('🎬 First epoch coords length:', firstEpochData.coords.length);
        console.log('🎬 Sample coord:', firstEpochData.coords[0]);
        console.log('🎬 Sample coord keys:', Object.keys(firstEpochData.coords[0]));
        console.log('🎬 Sample coord [0]:', firstEpochData.coords[0][0]);
        console.log('🎬 Sample coord [1]:', firstEpochData.coords[0][1]); 
        console.log('🎬 Sample coord [2]:', firstEpochData.coords[0][2]);
        
        // The coords are already in full sphere record format, just need to extract coordinates
        const recordList: SphereRecord[] = firstEpochData.coords.map((entry: any, index: number) => {
            const record = {
                coords: {
                    x: entry.x, // Coordinates are stored as object properties, not array indices
                    y: entry.y,
                    z: entry.z
                },
                id: String(index),
                featrix_meta: {
                    cluster_pre: entry.cluster_pre || 0,
                    webgl_id: null,
                    __featrix_row_id: entry.__featrix_row_id || index,
                    __featrix_row_offset: entry.__featrix_row_offset || index,
                },
                original: {
                    ...(entry.set_columns || {}),
                    ...(entry.scalar_columns || {}),
                    ...(entry.string_columns || {})
                }
            };
            
            // Debug first few records
            if (index < 3) {
                console.log(`🎬 Record ${index}:`, {
                    extractedCoords: record.coords,
                    rawValues: { x: entry.x, y: entry.y, z: entry.z },
                    coordTypes: { x: typeof entry.x, y: typeof entry.y, z: typeof entry.z },
                    coordStrings: { x: String(entry.x), y: String(entry.y), z: String(entry.z) }
                });
            }
            
            return record;
        });
        
        console.log('🎬 Created record list:', recordList.length, 'records');
        console.log('🎬 Sample record:', recordList[0]);
        
        // Add points to sphere
        add_points_to_sphere(sphere, recordList);
        
        console.log('🎬 After adding points - scene children:', sphere.scene.children.length);
        console.log('🎬 After adding points - pointRecordsByID:', sphere.pointRecordsByID.size);
        console.log('🎬 After adding points - pointObjectsByRecordID:', sphere.pointObjectsByRecordID.size);
        
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
    
    console.log('🎬 Starting training movie:', totalFrames, 'epochs over', durationSeconds, 'seconds');
    
    const animate = () => {
        sphere.currentEpoch = (sphere.currentEpoch + 1) % totalFrames;
        
        // Update point positions for current epoch
        update_training_movie_frame(sphere, epochKeys[sphere.currentEpoch]);
        
        if (sphere.isPlayingMovie) {
            sphere.movieAnimationRef = setTimeout(animate, frameDelay);
        }
    };
    
    animate();
}

export function stop_training_movie(sphere: SphereData) {
    sphere.isPlayingMovie = false;
    if (sphere.movieAnimationRef) {
        clearTimeout(sphere.movieAnimationRef);
        sphere.movieAnimationRef = 0;
    }
}

function update_training_movie_frame(sphere: SphereData, epochKey: string) {
    const epochData = sphere.trainingMovieData[epochKey];
    
    if (!epochData || !epochData.coords) return;
    
    // Calculate progressive cluster reveal
    const epochKeys = Object.keys(sphere.trainingMovieData).sort((a, b) => parseInt(a) - parseInt(b));
    const currentFrameIndex = epochKeys.indexOf(epochKey);
    const totalFrames = epochKeys.length;
    
    // Progressive cluster reveal: start with 2 clusters, end with max clusters
    const startClusters = sphere.trainingMovieStartClusters || 2;
    const maxClusters = sphere.trainingMovieMaxClusters || 2;
    const clusterRange = maxClusters - startClusters + 1;
    
    // Calculate how many clusters should be visible at this frame
    const progressRatio = currentFrameIndex / (totalFrames - 1);
    const visibleClusters = Math.min(
        startClusters + Math.floor(progressRatio * clusterRange),
        maxClusters + 1
    );
    
    console.log(`🎬 Frame ${currentFrameIndex}/${totalFrames}: Showing ${visibleClusters} clusters (0-${visibleClusters-1})`);
    
    // Update positions and colors of existing points
    sphere.pointObjectsByRecordID.forEach((mesh: any, recordId: string) => {
        const rowOffset = parseInt(recordId); // We used index as record ID
        if (rowOffset < epochData.coords.length) {
            const newCoords = epochData.coords[rowOffset];
            if (newCoords && newCoords.x !== undefined && newCoords.y !== undefined && newCoords.z !== undefined) {
                // Update position
                mesh.position.set(newCoords.x, newCoords.y, newCoords.z);
                
                // Update cluster assignment and color with progressive reveal
                const newClusterPre = newCoords.cluster_pre || 0;
                
                // Update the record's cluster_pre value
                const record = sphere.pointRecordsByID.get(recordId);
                if (record) {
                    record.featrix_meta.cluster_pre = newClusterPre;
                }
                
                // Apply progressive cluster reveal logic
                let newColor;
                if (newClusterPre < visibleClusters) {
                    // Cluster is "revealed" - use its assigned color
                    if (newClusterPre < kColorTable.length) {
                        newColor = kColorTable[newClusterPre];
                    } else {
                        newColor = 0xff0000; // Red for out-of-range clusters
                    }
                } else {
                    // Cluster not yet revealed - use gray
                    newColor = 0x999999; // Gray for unrevealed clusters
                }
                
                // Apply the new color
                if (mesh.material instanceof THREE.MeshBasicMaterial) {
                    mesh.material.color.set(newColor);
                    mesh.material.needsUpdate = true;
                }
            }
        }
    });
    
    // Re-render the sphere
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
