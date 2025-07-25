import React, { Suspense, useEffect, useRef, useState } from "react";
import FeatrixEmbeddingsExplorer, { find_best_cluster_number } from '../featrix_sphere_display';
import TrainingStatus from '../training_status';
import { fetch_session_data, fetch_session_projections, fetch_training_metrics } from './embed-data-access';
import { SphereRecord, SphereRecordIndex, remap_cluster_assignments, render_sphere, initialize_sphere, set_animation_options, set_visual_options, load_training_movie, play_training_movie, stop_training_movie, pause_training_movie, resume_training_movie, step_training_movie_frame, goto_training_movie_frame } from '../featrix_sphere_control';
import { v4 as uuid4 } from 'uuid';

// Build timestamp for cache busting verification
const BUILD_TIMESTAMP = new Date().toISOString();

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
        console.error("Error getting column types:", error);
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
        const sphere_record = {
            coords: {
                x: entry[0],
                y: entry[1],
                z: entry[2],
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
}

// Training Movie Sphere Component - handles everything internally
const TrainingMovieSphere: React.FC<{ 
    trainingData: any,
    onReady?: (sphere: any) => void,
    onFrameUpdate?: (frameInfo: { current: number, total: number, visible: number }) => void
}> = ({ trainingData, onReady, onFrameUpdate }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sphereRef = useRef<any>(null);

    useEffect(() => {
        if (!containerRef.current || !trainingData) {
            console.log('🔴 TrainingMovieSphere: Missing container or training data');
            return;
        }

        if (!sphereRef.current) {
            console.log('🎬 TrainingMovieSphere: Initializing sphere and loading training movie');
            
            // Initialize empty sphere
            sphereRef.current = initialize_sphere(containerRef.current, []);
            
            // Set frame update callback
            if (onFrameUpdate) {
                sphereRef.current.frameUpdateCallback = onFrameUpdate;
            }
            
            // Set up visual options for training movie - smaller points
            set_animation_options(sphereRef.current, true, 0.02, false, null);
            set_visual_options(sphereRef.current, 0.025, 0.9);
            
            // Load training movie data into the sphere
            load_training_movie(sphereRef.current, trainingData);
            
            // Start playing the training movie (10 second loop)
            play_training_movie(sphereRef.current, 10);
            
            console.log('🎬 TrainingMovieSphere: Training movie started');
            
            // Notify parent that sphere is ready
            if (onReady) {
                onReady(sphereRef.current);
            }
        }
    }, [trainingData, onReady]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (sphereRef.current) {
                stop_training_movie(sphereRef.current);
            }
        };
    }, []);

    return (
        <div 
            ref={containerRef} 
            style={{ 
                width: '100%', 
                height: '100%',
                background: 'transparent'
            }}
        />
    );
};

const TrainingMovie: React.FC<TrainingMovieProps> = ({ sessionId, apiBaseUrl }) => {
    const [trainingData, setTrainingData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sphereRef, setSphereRef] = useState<any>(null);
    const [frameInfo, setFrameInfo] = useState<{ current: number, total: number, visible: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(true); // Start playing automatically
    const [frameInput, setFrameInput] = useState<string>('');

    useEffect(() => {
        const loadTrainingData = async () => {
            try {
                setLoading(true);
                const data = await fetch_training_metrics(sessionId, apiBaseUrl);
                
                // TRAINING MOVIE: Get 3D coordinates for each epoch
                console.log('🎬 Epoch projections data received:', data);
                
                // Get the epoch projections (3D coordinates per epoch)
                if (data && data.epoch_projections) {
                    const epochKeys = Object.keys(data.epoch_projections).sort((a, b) => parseInt(a) - parseInt(b));
                    console.log(`✅ Found ${epochKeys.length} epoch projections for training movie`);
                    setTrainingData(data.epoch_projections);
                } else {
                    console.error('❌ No epoch_projections found. Data structure:', Object.keys(data || {}));
                    throw new Error('No epoch projections data available for training movie');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load training data');
            } finally {
                setLoading(false);
            }
        };

        loadTrainingData();
    }, [sessionId, apiBaseUrl]);

    // Frame control functions
    const handlePlayPause = () => {
        if (!sphereRef) return;
        
        if (isPlaying) {
            pause_training_movie(sphereRef);
            setIsPlaying(false);
        } else {
            resume_training_movie(sphereRef);
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

    if (loading) {
        return (
            <div className="training-progress-display" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                background: '#000',
                color: '#fff',
                position: 'relative'
            }}>
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    fontSize: '12px',
                    color: '#ff6b6b',
                    fontFamily: 'monospace',
                    background: 'rgba(255, 107, 107, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '4px'
                }}>
                    Build: {BUILD_TIMESTAMP.slice(0, 16)}
                </div>
                <div style={{ marginBottom: '20px', fontSize: '18px' }}>🎬 Loading Training Movie...</div>
                <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    border: '3px solid #333', 
                    borderTop: '3px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '15px'
                }}></div>
                <div style={{ fontSize: '14px', color: '#ccc' }}>Session: {sessionId}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                    Fetching from {apiBaseUrl || 'default API'}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="training-progress-display" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                background: '#000',
                color: '#ff4444',
                position: 'relative'
            }}>
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    fontSize: '12px',
                    color: '#ff6b6b',
                    fontFamily: 'monospace',
                    background: 'rgba(255, 107, 107, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '4px'
                }}>
                    Build: {BUILD_TIMESTAMP.slice(0, 16)}
                </div>
                <div style={{ fontSize: '18px', marginBottom: '10px' }}>❌ Error loading training movie</div>
                <div style={{ fontSize: '14px', marginTop: '10px', textAlign: 'center' }}>{error}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
                    Session: {sessionId} | API: {apiBaseUrl || 'default'}
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
                height: '400px',
                background: '#000',
                color: '#fff'
            }}>
                No training movie data available
            </div>
        );
    }

    return (
        <div className="training-progress-display" style={{
            position: 'relative',
            width: '100%',
            height: '400px',
            background: '#000',
            color: '#fff',
            overflow: 'hidden'
        }}>
            {/* Build timestamp & frame info - top right overlay */}
            <div className="build-display" style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                fontSize: '10px',
                color: '#ff0000',
                fontFamily: 'monospace',
                background: 'rgba(0,0,0,0.8)',
                padding: '4px 6px',
                borderRadius: '3px',
                zIndex: 1000
            }}>
                <div>v{BUILD_TIMESTAMP.slice(0, 19).replace('T', ' ')}</div>
                {frameInfo && (
                    <div style={{ color: '#00ff00', marginTop: '2px' }}>
                        Frame {frameInfo.current}/{frameInfo.total} | {frameInfo.visible} clusters
                    </div>
                )}
            </div>

            {/* Frame Controls - bottom center overlay */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(0,0,0,0.8)',
                padding: '8px 12px',
                borderRadius: '6px',
                zIndex: 1000,
                fontFamily: 'monospace',
                fontSize: '12px'
            }}>
                <button
                    onClick={handleStepBackward}
                    style={{
                        background: '#333',
                        border: '1px solid #555',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                    title="Previous Frame"
                >
                    ⏮️
                </button>
                
                <button
                    onClick={handlePlayPause}
                    style={{
                        background: isPlaying ? '#c44' : '#4c4',
                        border: '1px solid #555',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        minWidth: '32px'
                    }}
                    title={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? '⏸️' : '▶️'}
                </button>
                
                <button
                    onClick={handleStepForward}
                    style={{
                        background: '#333',
                        border: '1px solid #555',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                    title="Next Frame"
                >
                    ⏭️
                </button>
                
                <div style={{ margin: '0 8px', color: '#888' }}>|</div>
                
                <input
                    type="number"
                    value={frameInput}
                    onChange={(e) => setFrameInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGotoFrame()}
                    placeholder="Frame #"
                    style={{
                        background: '#222',
                        border: '1px solid #555',
                        color: '#fff',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        width: '60px',
                        fontSize: '11px'
                    }}
                    min="1"
                    max={frameInfo?.total || 1}
                />
                
                <button
                    onClick={handleGotoFrame}
                    style={{
                        background: '#333',
                        border: '1px solid #555',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px'
                    }}
                    title="Go to Frame"
                >
                    Go
                </button>
                
                <div style={{ margin: '0 8px', color: '#888' }}>|</div>
                
                <button
                    onClick={handleStop}
                    style={{
                        background: '#633',
                        border: '1px solid #555',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                    title="Stop"
                >
                    ⏹️
                </button>
            </div>

            {/* ACTUAL 3D SPHERE VIEWER */}
            <div id="training-movie-3d-container" style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0
            }}>
                {trainingData ? (
                    <TrainingMovieSphere
                        trainingData={trainingData}
                        onReady={(sphere: any) => {
                            console.log('🎬 Training movie sphere ready:', sphere);
                            setSphereRef(sphere);
                            
                            // Monitor sphere playing state
                            const checkPlayingState = () => {
                                if (sphere && sphere.isPlayingMovie !== undefined) {
                                    setIsPlaying(sphere.isPlayingMovie);
                                }
                            };
                            
                            // Check state periodically
                            const stateChecker = setInterval(checkPlayingState, 500);
                            
                            // Clean up on unmount
                            return () => clearInterval(stateChecker);
                        }}
                        onFrameUpdate={(info) => {
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
                        color: '#666',
                        background: '#111'
                    }}>
                        Initializing 3D sphere...
                    </div>
                )}
            </div>
        </div>
    );
};

interface SphereEmbeddedProps {
    initial_data: any;
    apiBaseUrl?: string;
    isRotating?: boolean;
    rotationSpeed?: number;
    animateClusters?: boolean;
    pointSize?: number;
    pointOpacity?: number;
    onSphereReady?: (sphereRef: any) => void;
}

export default function FeatrixSphereEmbedded({ initial_data, apiBaseUrl, isRotating, rotationSpeed, animateClusters, pointSize, pointOpacity, onSphereReady }: SphereEmbeddedProps) {
    // TRAINING MOVIE SPECIFICATIONS: 
    // 1. ON LOAD: Show NOTHING - no sphere, no points, no final data visualization
    // 2. AUTOMATICALLY: Load training movie epoch data from /training_metrics endpoint
    // 3. DISPLAY: Show ONLY the training movie animation once loaded - NOT the finished sphere
    // 4. NEVER: Show training movie simultaneously with the finished sphere data

    const session_id = initial_data?.session?.session_id;

    // Show ONLY the training movie - never the sphere
    return (
        <div className="sphere-embedded-container">
            <div className="mx-auto">
                {session_id ? (
                    <TrainingMovie sessionId={session_id} apiBaseUrl={apiBaseUrl} />
                ) : (
                    <div className="training-progress-display" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '400px',
                        background: '#000',
                        color: '#fff'
                    }}>
                        No session ID available for training movie
                    </div>
                )}
            </div>
        </div>
    );
} 