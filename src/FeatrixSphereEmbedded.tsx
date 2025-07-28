import React, { Suspense, useEffect, useRef, useState, useCallback } from "react";
import FeatrixEmbeddingsExplorer, { find_best_cluster_number } from '../featrix_sphere_display';
import TrainingStatus from '../training_status';
import { fetch_session_data, fetch_session_projections, fetch_training_metrics } from './embed-data-access';
import { SphereRecord, SphereRecordIndex, remap_cluster_assignments, render_sphere, initialize_sphere, set_animation_options, set_visual_options, load_training_movie, play_training_movie, stop_training_movie, pause_training_movie, resume_training_movie, step_training_movie_frame, goto_training_movie_frame, compute_cluster_convex_hulls, update_cluster_spotlight } from '../featrix_sphere_control';
import { v4 as uuid4 } from 'uuid';

// Build timestamp for cache busting verification
const BUILD_TIMESTAMP = new Date().toISOString();

// Loss Plot Screen Overlay Component - MUCH BETTER VERSION
const LossPlotOverlay: React.FC<{
    lossData: Array<{ epoch: number | string, value: number }>,
    currentEpoch?: string,
    style?: React.CSSProperties
}> = ({ lossData, currentEpoch, style }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !lossData || lossData.length === 0) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const { width, height } = canvas;
        const leftPadding = 70;   // More space for Y-axis labels
        const rightPadding = 20;
        const topPadding = 35;    // Space for title
        const bottomPadding = 35; // Space for X-axis labels
        const plotWidth = width - leftPadding - rightPadding;
        const plotHeight = height - topPadding - bottomPadding;
        
        // Enable anti-aliasing for smooth lines
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Clear canvas with proper background
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(0, 0, width, height);
        
        // Find min/max values with better scaling
        const epochs = lossData.map(d => typeof d.epoch === 'string' ? parseInt(d.epoch) : d.epoch);
        const losses = lossData.map(d => d.value);
        const minEpoch = Math.min(...epochs);
        const maxEpoch = Math.max(...epochs);
        let minLoss = Math.min(...losses);
        let maxLoss = Math.max(...losses);
        
        // Add reasonable padding to Y-axis - use smart scaling
        const lossRange = maxLoss - minLoss;
        if (lossRange < 0.01) {
            // Very small range, use fixed padding
            minLoss -= 0.001;
            maxLoss += 0.001;
        } else {
            minLoss -= lossRange * 0.05;
            maxLoss += lossRange * 0.05;
        }
        
        // Draw background grid with proper coordinates
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        
        // Horizontal grid lines (5 lines)
        for (let i = 0; i <= 4; i++) {
            const y = topPadding + (i / 4) * plotHeight;
            ctx.beginPath();
            ctx.moveTo(leftPadding, y);
            ctx.lineTo(leftPadding + plotWidth, y);
            ctx.stroke();
        }
        
        // Vertical grid lines (6 lines)  
        for (let i = 0; i <= 5; i++) {
            const x = leftPadding + (i / 5) * plotWidth;
            ctx.beginPath();
            ctx.moveTo(x, topPadding);
            ctx.lineTo(x, topPadding + plotHeight);
            ctx.stroke();
        }
        
        // Draw axes with proper coordinates
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // X-axis (bottom)
        ctx.moveTo(leftPadding, topPadding + plotHeight);
        ctx.lineTo(leftPadding + plotWidth, topPadding + plotHeight);
        // Y-axis (left)
        ctx.moveTo(leftPadding, topPadding);
        ctx.lineTo(leftPadding, topPadding + plotHeight);
        ctx.stroke();
        
        // CRITICAL FIX: Sort loss data by epoch number before plotting!
        const sortedLossData = [...lossData].sort((a, b) => {
            const epochA = typeof a.epoch === 'string' ? parseInt(a.epoch) : a.epoch;
            const epochB = typeof b.epoch === 'string' ? parseInt(b.epoch) : b.epoch;
            return epochA - epochB;
        });
        
        // Draw smooth loss curve with gradient
        const gradient = ctx.createLinearGradient(0, topPadding, 0, topPadding + plotHeight);
        gradient.addColorStop(0, '#00ff88');
        gradient.addColorStop(1, '#00aa55');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        
        sortedLossData.forEach((point, i) => {
            const epoch = typeof point.epoch === 'string' ? parseInt(point.epoch) : point.epoch;
            const x = leftPadding + ((epoch - minEpoch) / (maxEpoch - minEpoch)) * plotWidth;
            const y = topPadding + (1 - (point.value - minLoss) / (maxLoss - minLoss)) * plotHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Draw data points - make them more visible
        ctx.fillStyle = '#00ff88';
        sortedLossData.forEach((point, i) => {
            if (i % 3 === 0) { // Show every 3rd point for better visibility
                const epoch = typeof point.epoch === 'string' ? parseInt(point.epoch) : point.epoch;
                const x = leftPadding + ((epoch - minEpoch) / (maxEpoch - minEpoch)) * plotWidth;
                const y = topPadding + (1 - (point.value - minLoss) / (maxLoss - minLoss)) * plotHeight;
                
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        });
        
        // Draw current epoch cursor with glow effect
        if (currentEpoch) {
            const currentEpochNum = parseInt(currentEpoch);
            const x = leftPadding + ((currentEpochNum - minEpoch) / (maxEpoch - minEpoch)) * plotWidth;
            
            // Glow effect
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x, topPadding);
            ctx.lineTo(x, topPadding + plotHeight);
            ctx.stroke();
            
            // Reset shadow
            ctx.shadowBlur = 0;
            
            // Current value marker
            const currentPoint = lossData.find(d => {
                const epoch = typeof d.epoch === 'string' ? parseInt(d.epoch) : d.epoch;
                return epoch === currentEpochNum;
            });
            
            if (currentPoint) {
                const y = topPadding + (1 - (currentPoint.value - minLoss) / (maxLoss - minLoss)) * plotHeight;
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, 2 * Math.PI);
                ctx.fill();
                
                // Value label with better positioning
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(currentPoint.value.toFixed(4), x, Math.max(15, y - 12));
            }
        }
        
        // Draw labels with better formatting
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        
        // X-axis labels (epochs)
        for (let i = 0; i <= 5; i++) {
            const epoch = minEpoch + (i / 5) * (maxEpoch - minEpoch);
            const x = leftPadding + (i / 5) * plotWidth;
            ctx.fillText(Math.round(epoch).toString(), x, height - 10);
        }
        
        // Y-axis labels (loss values) - better formatting and positioning
        ctx.textAlign = 'right';
        ctx.font = '12px Arial';
        for (let i = 0; i <= 4; i++) {
            const loss = maxLoss - (i / 4) * (maxLoss - minLoss);
            const y = topPadding + (i / 4) * plotHeight;
            // Smart decimal formatting based on value magnitude
            const formatted = loss < 0.01 ? loss.toFixed(4) : 
                             loss < 0.1 ? loss.toFixed(3) : 
                             loss.toFixed(2);
            ctx.fillText(formatted, leftPadding - 10, y + 4);
        }
        
        // Title with better positioning
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Validation Loss', width / 2, 20);
        
    }, [lossData, currentEpoch]);
    
    return (
        <div style={style}>
            <canvas 
                ref={canvasRef}
                width="600"
                height="150"
                style={{ 
                    width: '100%', 
                    height: '100%',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.2)'
                }}
            />
        </div>
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
    sessionProjections?: any,
    lossData?: any,
    onReady?: (sphere: any) => void,
    onFrameUpdate?: (frameInfo: { current: number, total: number, visible: number, epoch?: string, validationLoss?: number }) => void,
    onPointInspected?: (pointInfo: any) => void,
    rotationEnabled?: boolean
}> = ({ trainingData, sessionProjections, lossData, onReady, onFrameUpdate, onPointInspected, rotationEnabled = true }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sphereRef = useRef<any>(null);

    useEffect(() => {
        if (!containerRef.current || !trainingData) {
            return;
        }

        if (!sphereRef.current && trainingData && sessionProjections) {
            
            // Initializing sphere and loading training movie
            console.time('🌐 SPHERE_INITIALIZATION');
            
            // Initialize empty sphere
            sphereRef.current = initialize_sphere(containerRef.current, []);
            
            // CRITICAL: Set session projections data for cluster results FIRST
            if (sessionProjections && sessionProjections.entire_cluster_results) {
                sphereRef.current.jsonData = sessionProjections;
            } else {
                console.error('❌ CRITICAL: No session projections or cluster results available');
                return;
            }
            
            console.log('🌐 SPHERE_CREATED:', performance.now() + 'ms');
            
            // Set frame update callback
            if (onFrameUpdate) {
                sphereRef.current.frameUpdateCallback = onFrameUpdate;
            }
            
            // Set point inspection callback
            if (onPointInspected) {
                sphereRef.current.event_listeners.pointInspected = (event: any) => {
                    onPointInspected(event.detail);
                };
            }
            
            // Set up visual options for training movie - smaller points
            set_animation_options(sphereRef.current, rotationEnabled, 0.02, false, sphereRef.current.jsonData);
            set_visual_options(sphereRef.current, 0.025, 0.9);
            
            // Load training movie data into the sphere (AFTER setting session data)
            load_training_movie(sphereRef.current, trainingData, lossData);
            
            // Start playing the training movie (10 second loop)
            console.log('🎬 TRAINING_MOVIE_START:', performance.now() + 'ms');
            play_training_movie(sphereRef.current, 10);
            console.timeEnd('🌐 SPHERE_INITIALIZATION');
            
            // Training movie started successfully
            console.log('🎉 FIRST_PAINT_READY:', performance.now() + 'ms');
            
            // Notify parent that sphere is ready
            if (onReady) {
                onReady(sphereRef.current);
            }
            
            // Final timing log
            setTimeout(() => {
                console.log('🎉 ANIMATION_STARTED:', performance.now() + 'ms');
                console.timeEnd('🕐 TOTAL_LOAD_TIME');
            }, 100); // Small delay to ensure first frame is rendered
        }
    }, [trainingData, sessionProjections, onReady]);

    // Update rotation controls when rotationEnabled changes
    useEffect(() => {
        if (sphereRef.current) {
            set_animation_options(sphereRef.current, rotationEnabled, 0.02, false, sphereRef.current.jsonData);
        }
    }, [rotationEnabled]);

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
    // NOTE: sessionId and apiBaseUrl are ignored - we load from static training movie dump file
    const [trainingData, setTrainingData] = useState<any>(null);
    const [lossData, setLossData] = useState<any>(null);
    const [sessionProjections, setSessionProjections] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Performance timing  
    const componentStartTime = useRef(performance.now());
    const hasLoggedInit = useRef(false);
    if (!hasLoggedInit.current) {
        console.log('🎬 COMPONENT_INIT_START:', componentStartTime.current + 'ms');
        hasLoggedInit.current = true;
    }
    const [sphereRef, setSphereRef] = useState<any>(null);
    const [frameInfo, setFrameInfo] = useState<{ current: number, total: number, visible: number, epoch?: string, validationLoss?: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(true); // Start playing automatically
    const [frameInput, setFrameInput] = useState<string>('');
    const [showDynamicPoints, setShowDynamicPoints] = useState(false);
    const [showDynamicHulls, setShowDynamicHulls] = useState(false);
    const [trailLength, setTrailLength] = useState(5); // Default 5 epochs
    const [spotlightCluster, setSpotlightCluster] = useState<number>(-1); // -1 = off, 0+ = cluster number
    const [showCountdown, setShowCountdown] = useState(false);
    const [countdownText, setCountdownText] = useState('');
    const sphereRefForCountdown = useRef<any>(null); // Add ref to store sphere for countdown
    
    // Cluster debugging state
    const [showClusterDebug, setShowClusterDebug] = useState(false);
    const [selectedPointInfo, setSelectedPointInfo] = useState<any>(null);
    const [showColorLegend, setShowColorLegend] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Rotation control state
    const [rotationEnabled, setRotationEnabled] = useState(true); // Default enabled

    // Countdown function for initial pause - using useCallback to ensure stable reference
    const startCountdown = useCallback(() => {
        console.log('🎯 Starting countdown sequence');
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
                            console.log('🎬 Countdown complete, starting movie with sphere:', sphereRefForCountdown.current);
                            if (sphereRefForCountdown.current) {
                                resume_training_movie(sphereRefForCountdown.current);
                                setIsPlaying(true);
                            } else {
                                console.error('❌ No sphere reference available after countdown!');
                            }
                        }, 800);
                    }, 1000);
                }, 1000);
            }, 1000);
        }, 500);
    }, []); // Remove sphereRef dependency since we're using the ref now

    useEffect(() => {
        const loadTrainingData = async () => {
            try {
                setLoading(true);
                console.time('📊 STATIC_FILE_LOADING');
                console.log('📊 LOADING TRAINING MOVIE FROM STATIC FILE:', performance.now() + 'ms');
                
                // LOAD FROM STATIC FILE: Training movie dump (no API calls!)
                const response = await fetch('logistics-featrix-data.json');
                const trainingMovieData = await response.json();
                
                console.timeEnd('📊 STATIC_FILE_LOADING');
                console.log('📊 STATIC_FILE_LOADED:', performance.now() + 'ms');
                console.log('🎯 Training movie data structure:', trainingMovieData ? Object.keys(trainingMovieData) : 'NULL');
                
                // TRAINING MOVIE: Use epoch projections from the static dump
                if (trainingMovieData && trainingMovieData.epoch_projections) {
                    const epochKeys = Object.keys(trainingMovieData.epoch_projections).sort((a, b) => {
                        const epochA = parseInt(a.replace('epoch_', ''));
                        const epochB = parseInt(b.replace('epoch_', ''));
                        return epochA - epochB;
                    });
                    console.log('🎯 DEBUG: Epoch keys found:', epochKeys.length, 'epochs:', epochKeys.slice(0, 10));
                    console.log('🎯 DEBUG: First few epoch data:', epochKeys.slice(0, 3).map(k => ({ epoch: k, count: trainingMovieData.epoch_projections[k]?.length || 0 })));

                    setTrainingData(trainingMovieData.epoch_projections);
                    
                    // Use the static file's cluster results (this is the real training dump!)
                    setSessionProjections(trainingMovieData);
                    
                    // Also extract training metrics (loss data) if available
                    if (trainingMovieData.training_metrics) {
                        setLossData(trainingMovieData.training_metrics);
                    }
                } else {
                    console.error('❌ No epoch_projections found in static file. Data structure:', Object.keys(trainingMovieData || {}));
                    throw new Error('No epoch projections data available in training movie dump');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load training movie dump');
            } finally {
                setLoading(false);
            }
        };

        loadTrainingData();
    }, []); // No dependencies - just load the static file once

    // Handle dynamic visualization feature changes
    useEffect(() => {
        if (!sphereRef) return;
        
        // Update the ref for countdown as well
        sphereRefForCountdown.current = sphereRef;
        
        // Update sphere settings based on features
        sphereRef.showDynamicPoints = showDynamicPoints;
        sphereRef.showDynamicHulls = showDynamicHulls;
        sphereRef.memoryTrailLength = trailLength;
        sphereRef.spotlightCluster = spotlightCluster;

        // Call the unified compute function with all settings
        compute_cluster_convex_hulls(sphereRef);
        update_cluster_spotlight(sphereRef);
        
    }, [showDynamicPoints, showDynamicHulls, trailLength, spotlightCluster, sphereRef]);

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

    // Listen for fullscreen changes (user pressing ESC)
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isCurrentlyFullscreen);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    if (loading) {
        return (
            <div className="training-progress-display" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '770px',
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
                height: '770px',
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
                height: '770px',
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
            height: '100vh',
            minHeight: '800px',
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
                    <div>
                        <div style={{ color: '#00ff00', marginTop: '2px', fontSize: '12px', fontWeight: 'bold' }}>
                            Frame {frameInfo.current}/{frameInfo.total} | {frameInfo.visible} clusters
                        </div>
                        
                        {/* Progress Bar */}
                        <div style={{ 
                            marginTop: '6px',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            height: '12px',
                            width: '160px',
                            border: '1px solid rgba(0,255,0,0.3)'
                        }}>
                            <div style={{
                                background: 'linear-gradient(90deg, #00ff00, #00aa00)',
                                height: '100%',
                                width: `${(frameInfo.current / frameInfo.total) * 100}%`,
                                transition: 'width 0.2s ease',
                                borderRadius: '5px',
                                boxShadow: '0 0 8px rgba(0,255,0,0.4)'
                            }} />
                        </div>
                        <div style={{ 
                            color: '#00ff00', 
                            fontSize: '11px', 
                            marginTop: '3px',
                            textAlign: 'center',
                            fontWeight: 'bold'
                        }}>
                            {Math.round((frameInfo.current / frameInfo.total) * 100)}%
                        </div>
                        
                        {frameInfo.epoch && (
                            <div style={{ color: '#00ffff', marginTop: '2px', fontSize: '12px', fontWeight: 'bold' }}>
                                Epoch {frameInfo.epoch} of 225
                            </div>
                        )}
                        {frameInfo.validationLoss !== undefined && (
                            <div style={{ color: '#ffff00', marginTop: '2px', fontSize: '11px', fontWeight: 'bold' }}>
                                Validation Loss: {frameInfo.validationLoss.toFixed(4)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Countdown Overlay */}
            {showCountdown && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(0, 0, 0, 0.9)',
                    color: '#fff',
                    padding: '30px 50px',
                    borderRadius: '12px',
                    fontSize: '32px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    border: '3px solid #00ff00',
                    textAlign: 'center',
                    boxShadow: '0 0 30px rgba(0, 255, 0, 0.4)',
                    zIndex: 2000
                }}>
                    {countdownText}
                </div>
            )}

            {/* Loss Plot - positioned away from info panel */}
            {lossData && lossData.validation_loss && (
                <LossPlotOverlay 
                    lossData={lossData.validation_loss} 
                    currentEpoch={frameInfo?.epoch} 
                    style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        width: '400px',
                        height: '100px',
                        zIndex: 1000,
                        pointerEvents: 'none'
                    }}
                />
            )}


            {/* Frame Controls - single row, bottom */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(0,0,0,0.9)',
                padding: '8px 16px',
                borderRadius: '25px',
                zIndex: 1000,
                fontFamily: 'monospace',
                fontSize: '11px'
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
                
                {/* Convex Hull Toggle - always visible for debugging */}
                {frameInfo && (
                    <>
                        <div style={{ margin: '0 8px', color: '#888' }}>|</div>
                        <label style={{
                            color: '#fff',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            marginRight: '8px'
                        }}>
                            <input
                                type="checkbox"
                                checked={showDynamicPoints}
                                onChange={(e) => {
                                    console.log('🔹 Point sizing toggled:', e.target.checked);
                                    setShowDynamicPoints(e.target.checked);
                                }}
                                style={{
                                    marginRight: '4px',
                                    cursor: 'pointer'
                                }}
                            />
                            🔹 Points
                        </label>
                        <label style={{
                            color: frameInfo.visible >= 4 ? '#fff' : '#888',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer'
                        }}>
                            <input
                                type="checkbox"
                                checked={showDynamicHulls}
                                onChange={(e) => {
                                    console.log('🔮 Sphere sizing toggled:', e.target.checked, 'clusters:', frameInfo.visible);
                                    setShowDynamicHulls(e.target.checked);
                                }}
                                style={{
                                    marginRight: '4px',
                                    cursor: 'pointer'
                                }}
                                disabled={frameInfo.visible < 4}
                            />
                            🔮 Spheres ({frameInfo.visible})
                        </label>
                        
                        <div style={{ margin: '0 8px', color: '#888' }}>|</div>
                        
                        {/* Trail Length Control */}
                        <label style={{
                            color: '#fff',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            marginRight: '8px'
                        }}>
                            🛤️ Trails:
                            <input
                                type="range"
                                min="2"
                                max="15"
                                value={trailLength}
                                onChange={(e) => {
                                    const newLength = parseInt(e.target.value);
                                    console.log('🛤️ Trail length changed:', newLength);
                                    setTrailLength(newLength);
                                }}
                                style={{
                                    marginLeft: '4px',
                                    marginRight: '4px',
                                    cursor: 'pointer',
                                    width: '40px'
                                }}
                            />
                            <span style={{ fontSize: '10px', color: '#ccc' }}>{trailLength}</span>
                        </label>
                        
                        {/* Cluster Spotlight Control */}
                        <label style={{
                            color: '#fff',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            🎯 Focus:
                            <select
                                value={spotlightCluster}
                                onChange={(e) => {
                                    const cluster = parseInt(e.target.value);
                                    console.log('🎯 Spotlight cluster changed:', cluster);
                                    setSpotlightCluster(cluster);
                                    
                                    // Update spotlight on the sphere
                                    if (sphereRef) {
                                        sphereRef.spotlightCluster = cluster;
                                        update_cluster_spotlight(sphereRef);
                                        render_sphere(sphereRef);
                                    }
                                }}
                                style={{
                                    marginLeft: '4px',
                                    fontSize: '10px',
                                    padding: '1px 2px',
                                    backgroundColor: '#333',
                                    color: '#fff',
                                    border: '1px solid #555',
                                    borderRadius: '2px',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value={-1}>Off</option>
                                {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => (
                                    <option key={i} value={i}>C{i}</option>
                                ))}
                            </select>
                        </label>
                        
                        {/* Cluster Debugging Tools */}
                        <div style={{ margin: '0 8px', color: '#888' }}>|</div>
                        
                        <button
                            onClick={() => setShowClusterDebug(!showClusterDebug)}
                            style={{
                                background: showClusterDebug ? '#4c4' : '#333',
                                border: '1px solid #555',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: '11px'
                            }}
                            title="Toggle Cluster Inspector"
                        >
                            🔍 Debug
                        </button>
                        
                        <button
                            onClick={() => setShowColorLegend(!showColorLegend)}
                            style={{
                                background: showColorLegend ? '#4c4' : '#333',
                                border: '1px solid #555',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                marginLeft: '4px'
                            }}
                            title="Toggle Color Legend"
                        >
                            🎨 Colors
                        </button>
                        
                        {/* Fullscreen Toggle */}
                        <div style={{ margin: '0 8px', color: '#888' }}>|</div>
                        
                        <button
                            onClick={toggleFullscreen}
                            style={{
                                background: isFullscreen ? '#4c4' : '#333',
                                border: '1px solid #555',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: '11px'
                            }}
                            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                        >
                            {isFullscreen ? '🪟 Exit' : '⛶ Full'}
                        </button>
                        
                        {/* Rotation Toggle */}
                        <div style={{ margin: '0 8px', color: '#888' }}>|</div>
                        
                        <button
                            onClick={() => setRotationEnabled(!rotationEnabled)}
                            style={{
                                background: rotationEnabled ? '#4c4' : '#c44',
                                border: '1px solid #555',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: '11px'
                            }}
                            title={rotationEnabled ? "Disable Rotation" : "Enable Rotation"}
                        >
                            {rotationEnabled ? '🔒 Lock' : '🔓 Free'}
                        </button>
                    </>
                )}
                </div>

            {/* Cluster Debug Panel */}
            {showClusterDebug && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    background: 'rgba(0,0,0,0.9)',
                    color: '#fff',
                    padding: '12px',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    maxWidth: '300px',
                    zIndex: 1500,
                    border: '1px solid #555'
                }}>
                    <div style={{ color: '#4c4', fontWeight: 'bold', marginBottom: '8px' }}>🔍 Cluster Inspector</div>
                    
                    {frameInfo && (
                        <div style={{ marginBottom: '8px' }}>
                            <div>Frame: {frameInfo.current}/{frameInfo.total}</div>
                            <div>Visible Clusters: {frameInfo.visible}</div>
                            <div>Epoch: {frameInfo.epoch || 'unknown'}</div>
                        </div>
                    )}
                    
                    {selectedPointInfo && (
                        <div style={{ marginTop: '8px', borderTop: '1px solid #444', paddingTop: '8px' }}>
                            <div style={{ color: '#ff4', fontWeight: 'bold' }}>Selected Point:</div>
                            <div>Record ID: {selectedPointInfo.recordId}</div>
                            <div>Row Offset: {selectedPointInfo.rowOffset}</div>
                            <div>Cluster ID: {selectedPointInfo.clusterId}</div>
                            <div>Color: <span style={{ background: selectedPointInfo.color, padding: '2px 6px', borderRadius: '2px' }}>{selectedPointInfo.color}</span></div>
                            <div>Position: {selectedPointInfo.position}</div>
                        </div>
                    )}
                    
                    <div style={{ marginTop: '8px', fontSize: '10px', color: '#888' }}>
                        Click points on sphere to inspect
                    </div>
                </div>
            )}

            {/* Color Legend Panel - positioned near controls */}
            {showColorLegend && frameInfo && (
                <div style={{
                    position: 'absolute',
                    bottom: '80px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.9)',
                    color: '#fff',
                    padding: '12px',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    zIndex: 1500,
                    border: '1px solid #555'
                }}>
                    <div style={{ color: '#4c4', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>🎨 Cluster Colors</div>
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => {
                            const colorIndex = i + 2;
                            const kColorTable = [
                                '#888888', '#ffcccc', '#ff0000', '#ff8800', '#ffff00', '#88ff00',
                                '#00ff00', '#00ff88', '#00ffff', '#0088ff', '#0000ff', '#8800ff',
                                '#ff00ff', '#ff0088'
                            ];
                            const color = kColorTable[colorIndex] || '#888888';
                            
                            return (
                                <div key={`cluster-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '10px' }}>C{i}</span>
                                    <div style={{ 
                                        background: color, 
                                        width: '16px', 
                                        height: '16px', 
                                        border: '1px solid #555',
                                        borderRadius: '3px'
                                    }}></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ACTUAL 3D SPHERE VIEWER */}
            <div id="training-movie-3d-container" style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'auto',
                cursor: 'pointer'
            }}>
                {trainingData ? (
                    <TrainingMovieSphere
                        trainingData={trainingData}
                        sessionProjections={sessionProjections}
                        lossData={lossData}
                        onPointInspected={setSelectedPointInfo}
                        rotationEnabled={rotationEnabled}
                        onReady={(sphere: any) => {
                            // Training movie sphere ready
                            setSphereRef(sphere);
                            sphereRefForCountdown.current = sphere; // Store sphere in ref
                            
                            // Start with paused state for countdown
                            setIsPlaying(false);
                            
                            // Pause the sphere initially
                            if (sphere) {
                                pause_training_movie(sphere);
                            }
                            
                            console.log('🎮 Sphere ready - starting countdown sequence');
                            
                            // Start countdown after a brief delay
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
                        }}
                        onFrameUpdate={(info) => {
                            // DEBUG: Log frameInfo for troubleshooting focus dropdown
                            console.log('🎯 Frame update received:', {
                                current: info.current,
                                total: info.total,
                                visible: info.visible,
                                epoch: info.epoch,
                                type: typeof info.visible
                            });
                            
                            // Detect restart (frame went back to 1 from higher number)
                            const prevFrame = frameInfo?.current || 0;
                            if (prevFrame > 1 && info.current === 1 && typeof startCountdown === 'function') {
                                console.log('🔄 Training movie restarted - showing countdown');
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
    // 2. AUTOMATICALLY: Load training movie from STATIC FILE logistics-featrix-data.json (no API calls!)
    // 3. DISPLAY: Show ONLY the training movie animation once loaded - NOT the finished sphere
    // 4. NEVER: Show training movie simultaneously with the finished sphere data

    // Show ONLY the training movie - loads from static dump file
    return (
        <div className="sphere-embedded-container">
            <div className="mx-auto">
                <TrainingMovie sessionId="static-dump" apiBaseUrl={apiBaseUrl} />
            </div>
        </div>
    );
} 