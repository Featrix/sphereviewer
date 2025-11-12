/**
 * @license
 * Featrix Sphere Viewer - Embeddable 3D Data Visualization Component
 * 
 * Copyright (c) 2024-2025 Featrix
 * Licensed under the MIT License
 * 
 * This file contains the main React component for embedded sphere visualization.
 */

import React, { Suspense, useEffect, useRef, useState, useCallback } from "react";
import FeatrixEmbeddingsExplorer, { find_best_cluster_number } from '../featrix_sphere_display';
import TrainingStatus from '../training_status';
import { fetch_session_data, fetch_session_projections, fetch_training_metrics, fetch_session_status, fetch_single_epoch } from './embed-data-access';
import { SphereRecord, SphereRecordIndex, remap_cluster_assignments, render_sphere, initialize_sphere, set_animation_options, set_visual_options, load_training_movie, play_training_movie, stop_training_movie, pause_training_movie, resume_training_movie, step_training_movie_frame, goto_training_movie_frame, compute_cluster_convex_hulls, update_cluster_spotlight, show_search_results, clear_colors, toggle_bounds_box } from '../featrix_sphere_control';
import { v4 as uuid4 } from 'uuid';

// Build timestamp for cache busting verification
const BUILD_TIMESTAMP = new Date().toISOString();

// Loss Plot Screen Overlay Component - MUCH BETTER VERSION
const LossPlotOverlay: React.FC<{
    lossData: Array<{ epoch: number | string, value: number }>,
    currentEpoch?: string,
    title?: string,
    style?: React.CSSProperties
}> = ({ lossData, currentEpoch, title = 'Validation Loss', style }) => {
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
        ctx.fillText(title, width / 2, 20);
        
    }, [lossData, currentEpoch, title]);
    
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
                x: entry["0"],
                y: entry["1"],
                z: entry["2"],
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
    rotationEnabled?: boolean,
    containerRef?: React.RefObject<HTMLDivElement>
}> = ({ trainingData, sessionProjections, lossData, onReady, onFrameUpdate, onPointInspected, rotationEnabled = true, containerRef }) => {
    const internalContainerRef = useRef<HTMLDivElement>(null);
    const actualContainerRef = containerRef || internalContainerRef;
    const sphereRef = useRef<any>(null);

    useEffect(() => {
        if (!actualContainerRef.current || !trainingData) {
            return;
        }

        if (!sphereRef.current && trainingData && sessionProjections) {
            
            // Initialize sphere for training movie (as it was working)
            console.time('🌐 SPHERE_INITIALIZATION');
            
            // Get training movie record IDs from first epoch
            const firstEpoch = Object.keys(trainingData)[0];
            const firstEpochData = trainingData[firstEpoch];
            const trainingRecordIds = new Set(firstEpochData.coords.map((c: any) => c.__featrix_row_id || c.__featrix_row_offset));
            console.log('🎬 Training movie contains', trainingRecordIds.size, 'unique records');
            
            // Extract cluster results from first epoch (each epoch has its own cluster results)
            const clusterResults = firstEpochData.entire_cluster_results || sessionProjections.entire_cluster_results || {};
            console.log('🎬 Cluster results available:', Object.keys(clusterResults).length > 0 ? `Yes (${Object.keys(clusterResults).length} cluster counts)` : 'No');
            
            // Use the first epoch's coords as the base data structure
            // The training movie will update these coords over time
            const filteredSessionData = {
                ...sessionProjections,
                coords: firstEpochData.coords || [],
                entire_cluster_results: clusterResults
            };
            console.log('🎬 Using first epoch data with', filteredSessionData.coords.length, 'records for training movie');
            
            // Initialize sphere with filtered records that match training movie
            const recordList = create_record_list(filteredSessionData);
            console.log('🌐 Created record list with', recordList.length, 'points for training movie');
            sphereRef.current = initialize_sphere(actualContainerRef.current, recordList);
            
            // Set session projections data for training movie with cluster results from first epoch
            sphereRef.current.jsonData = {
                ...filteredSessionData,
                entire_cluster_results: clusterResults
            };
            console.log('✅ Set session projections data for training movie with cluster results');
            
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
            
            // Set up training movie visual options
            set_animation_options(sphereRef.current, rotationEnabled, 0.02, false, sphereRef.current.jsonData);
            set_visual_options(sphereRef.current, 0.025, 0.9);
            
            // Load training movie data (like it was working)
            load_training_movie(sphereRef.current, trainingData, lossData);
            
            // Start playing the training movie
            console.log('🎬 TRAINING_MOVIE_START:', performance.now() + 'ms');
            play_training_movie(sphereRef.current, 10);
            console.timeEnd('🌐 SPHERE_INITIALIZATION');
            
            // Training movie ready
            console.log('🎉 TRAINING_MOVIE_READY:', performance.now() + 'ms');
            
            // Notify parent that sphere is ready
            if (onReady) {
                onReady(sphereRef.current);
            }
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

const TrainingMovie: React.FC<TrainingMovieProps> = ({ sessionId, apiBaseUrl }) => {
    // NOTE: Loading training movie from API (the working version)
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
    const containerRef = useRef<HTMLDivElement>(null);
    const [frameInfo, setFrameInfo] = useState<{ current: number, total: number, visible: number, epoch?: string, validationLoss?: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(true); // Start playing automatically
    const [frameInput, setFrameInput] = useState<string>('');
    const [showDynamicPoints, setShowDynamicPoints] = useState(false);
    const [showDynamicHulls, setShowDynamicHulls] = useState(false);
    const [trailLength, setTrailLength] = useState(12); // Default 12 epochs
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
    
    // Search state
    const [columnTypes, setColumnTypes] = useState<any>(null);
    const [selectedSearchColumn, setSelectedSearchColumn] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showSearch, setShowSearch] = useState(false);
    const [showBoundsBox, setShowBoundsBox] = useState(false);
    // Note: Unit sphere is always visible now (created automatically in initialize_sphere)
    
    // Training status state
    const [trainingStatus, setTrainingStatus] = useState<'loading' | 'training' | 'completed' | null>(null);
    const [nextCheckCountdown, setNextCheckCountdown] = useState<number>(30);

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
                
                // TRAINING MOVIE: Load from API - ignore deprecated cluster_pre, use finalClusterResults
                console.log('🔗 Loading training movie from API (cluster_pre ignored - using finalClusterResults)');
                
                // Use the session ID to fetch training data from API
                const apiTrainingData = await fetch_training_metrics(sessionId, apiBaseUrl);
                
                if (apiTrainingData && apiTrainingData.epoch_projections) {
                    console.log('✅ Got training movie data from API:', Object.keys(apiTrainingData.epoch_projections).length, 'epochs');
                    console.log('✅ Using finalClusterResults for cluster assignments, ignoring deprecated cluster_pre');
                    
                    // Try to fetch final projections for cluster results
                    let clusterResults = {};
                    try {
                        const baseUrl = apiBaseUrl || (window.location.hostname === 'localhost' 
                            ? window.location.origin + '/proxy/featrix'
                            : 'https://sphere-api.featrix.com');
                        const projectionsResponse = await fetch(`${baseUrl}/compute/session/${sessionId}/projections`);
                        if (projectionsResponse.ok) {
                            const projectionsData = await projectionsResponse.json();
                            if (projectionsData.projections?.entire_cluster_results) {
                                clusterResults = projectionsData.projections.entire_cluster_results;
                                console.log('✅ Found cluster results in final projections:', Object.keys(clusterResults).length, 'cluster counts');
                            }
                        }
                    } catch (err) {
                        console.warn('⚠️ Could not fetch final projections for cluster results:', err);
                    }
                    
                    setTrainingData(apiTrainingData.epoch_projections);
                    // Use API data for session projections with cluster results
                    const sessionData = {
                        ...apiTrainingData,
                        entire_cluster_results: clusterResults
                    };
                    setSessionProjections(sessionData);
                    
                    // Extract column types from first epoch for search functionality
                    const firstEpochKey = Object.keys(apiTrainingData.epoch_projections)[0];
                    const firstEpoch = apiTrainingData.epoch_projections[firstEpochKey];
                    if (firstEpoch && firstEpoch.coords) {
                        const types = getColumnTypes({ coords: firstEpoch.coords });
                        setColumnTypes(types);
                        if (Object.keys(types).length > 0) {
                            setSelectedSearchColumn(Object.keys(types)[0]);
                        }
                    }
                    
                    // Use API training metrics for loss plot
                    if (apiTrainingData.training_metrics) {
                        setLossData(apiTrainingData.training_metrics);
                    }
                } else {
                    console.error('❌ No epoch_projections in API response');
                    throw new Error('No training movie data from API');
                }
            } catch (err) {
                console.error('❌ Error loading training movie:', err);
                setError(err instanceof Error ? err.message : 'Failed to load training movie');
            } finally {
                setLoading(false);
            }
        };

        loadTrainingData();
    }, [sessionId, apiBaseUrl]); // Load when sessionId or apiBaseUrl changes

    // Poll for new epochs if training is in progress
    useEffect(() => {
        if (!sessionId || !trainingData) return;

        const checkForNewEpochs = async () => {
            try {
                // Check session status to see if training is in progress
                const sessionStatus = await fetch_session_status(sessionId, apiBaseUrl);
                if (!sessionStatus) return;

                // Check if training is still in progress
                const isTraining = sessionStatus.session?.status === 'training' || 
                                  sessionStatus.session?.status === 'running' ||
                                  sessionStatus.session?.status === 'pending';
                
                if (!isTraining) {
                    console.log('✅ Training complete or not in progress, stopping epoch polling');
                    setTrainingStatus('completed');
                    return;
                }
                
                // Set training status
                setTrainingStatus('training');
                setNextCheckCountdown(30); // Reset countdown

                // Get current epoch keys
                const currentEpochKeys = Object.keys(trainingData);
                const currentMaxEpoch = Math.max(...currentEpochKeys.map(k => {
                    const epochNum = parseInt(k.replace('epoch_', ''));
                    return isNaN(epochNum) ? 0 : epochNum;
                }));

                // Fetch latest epoch projections to see if there are new epochs
                const latestData = await fetch_training_metrics(sessionId, apiBaseUrl);
                if (latestData && latestData.epoch_projections) {
                    const newEpochKeys = Object.keys(latestData.epoch_projections);
                    const newMaxEpoch = Math.max(...newEpochKeys.map(k => {
                        const epochNum = parseInt(k.replace('epoch_', ''));
                        return isNaN(epochNum) ? 0 : epochNum;
                    }));

                    if (newMaxEpoch > currentMaxEpoch) {
                        console.log(`🆕 New epoch detected! Current: ${currentMaxEpoch}, New: ${newMaxEpoch}`);
                        
                        // Find all new epochs
                        const newEpochs: Record<string, any> = {};
                        newEpochKeys.forEach(epochKey => {
                            const epochNum = parseInt(epochKey.replace('epoch_', ''));
                            if (epochNum > currentMaxEpoch && !trainingData[epochKey]) {
                                newEpochs[epochKey] = latestData.epoch_projections[epochKey];
                            }
                        });

                        if (Object.keys(newEpochs).length > 0) {
                            console.log(`📥 Adding ${Object.keys(newEpochs).length} new epochs to training movie`);
                            
                            // Merge new epochs into existing training data
                            const updatedTrainingData = {
                                ...trainingData,
                                ...newEpochs
                            };
                            
                            setTrainingData(updatedTrainingData);
                            
                            // Update sphere with new epochs if it's already loaded
                            if (sphereRef && sphereRef.trainingMovieData) {
                                sphereRef.trainingMovieData = updatedTrainingData;
                                console.log('🔄 Updated sphere training movie data with new epochs');
                            }

                            // Update loss data if available
                            if (latestData.training_metrics) {
                                setLossData(latestData.training_metrics);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ Error checking for new epochs:', error);
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
        
        // Check immediately on mount
        checkForNewEpochs();

        return () => {
            clearInterval(pollInterval);
            clearInterval(countdownInterval);
        };
    }, [sessionId, apiBaseUrl, trainingData, sphereRef]);
    
    // Set loading status when loading
    useEffect(() => {
        if (loading) {
            setTrainingStatus('loading');
        }
    }, [loading]);

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
    
    const handleReplay = () => {
        if (!sphereRef) return;
        // Reset to frame 1 and play
        goto_training_movie_frame(sphereRef, 1);
        setIsPlaying(true);
        play_training_movie(sphereRef, 10);
    };
    
    const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!sphereRef) return;
        const frameNumber = parseInt(e.target.value);
        if (isNaN(frameNumber)) return;
        goto_training_movie_frame(sphereRef, frameNumber);
        setIsPlaying(false); // Scrubbing pauses
        setFrameInput(frameNumber.toString());
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
            console.error("Error getting column types:", error);
            return {};
        }
    };
    
    // Filter record list for search (same logic as FeatrixSphereColorControls)
    const filter_record_list = (queryColumnType: any, queryColumn: any, queryValue: any) => {
        if (!sphereRef || !sphereRef.pointRecordsByID) {
            console.warn('🔍 Search: No sphereRef or pointRecordsByID');
            return [];
        }
        
        let results: any = [];
        let checked = 0;
        for (const record of sphereRef.pointRecordsByID.values()) {
            checked++;
            const columnValue = record.original[queryColumn];
            if (columnValue === undefined) continue;
            
            if (queryColumnType === 'string') {
                const value = String(columnValue).toLowerCase();
                const query = String(queryValue).toLowerCase();
                if (value.includes(query)) {
                    results.push(record);
                }
            } else if (queryColumnType === 'set') {
                const value = String(columnValue).toLowerCase();
                const query = String(queryValue).toLowerCase();
                if (value === query) {
                    results.push(record);
                }
            } else if (queryColumnType === 'scalar') {
                // Handle scalar columns - convert to string for comparison
                const value = String(columnValue).toLowerCase();
                const query = String(queryValue).toLowerCase();
                if (value.includes(query)) {
                    results.push(record);
                }
            }
        }
        console.log(`🔍 Search: Checked ${checked} records, found ${results.length} matches for "${queryValue}" in column "${queryColumn}" (type: ${queryColumnType})`);
        return results;
    };
    
    // Handle search input
    const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        setSearchQuery(inputValue);
        
        if (!sphereRef) {
            console.warn('🔍 Search: No sphereRef available');
            return;
        }
        
        if (!columnTypes || !selectedSearchColumn) {
            console.warn('🔍 Search: No columnTypes or selectedSearchColumn');
            return;
        }
        
        // If empty, clear search
        if (inputValue === "") {
            clear_colors(sphereRef);
            render_sphere(sphereRef);
            return;
        }
        
        // Filter and highlight results
        const queryColumnType = columnTypes[selectedSearchColumn];
        const theRecords = filter_record_list(queryColumnType, selectedSearchColumn, inputValue);
        console.log(`🔍 Search: Highlighting ${theRecords.length} records`);
        show_search_results(sphereRef, theRecords);
        render_sphere(sphereRef);
    };

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
                {trainingStatus === 'loading' && (
                    <>
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
                    </>
                )}
                {trainingStatus === 'training' && (
                    <>
                        <div style={{ marginBottom: '20px', fontSize: '18px', color: '#00ff00' }}>
                            🎯 Training in progress
                        </div>
                        <div style={{ fontSize: '14px', color: '#00ffff', marginBottom: '10px' }}>
                            Will check for new frames in {nextCheckCountdown} seconds
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                            Session: {sessionId}
                        </div>
                    </>
                )}
                {trainingStatus === 'completed' && (
                    <>
                        <div style={{ marginBottom: '20px', fontSize: '18px', color: '#00ff00' }}>
                            ✅ Training Completed
                        </div>
                        <div style={{ fontSize: '14px', color: '#ccc', marginBottom: '10px' }}>
                            All epochs loaded
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                            Session: {sessionId}
                        </div>
                    </>
                )}
                {!trainingStatus && (
                    <>
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
                    </>
                )}
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
            display: 'flex',
            width: '100%',
            height: '100vh',
            minHeight: '800px',
            background: '#000',
            color: '#fff',
            overflow: 'hidden'
        }}>
            {/* Sphere Container - Left side, 75% of available width */}
            <div style={{
                flex: '0 0 75%',
                width: '75%',
                height: '100vh',
                position: 'relative',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {/* Countdown Overlay - only temporary, positioned over sphere */}
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
                        zIndex: 2000,
                        pointerEvents: 'none'
                    }}>
                        {countdownText}
                    </div>
                )}
                
                {/* ACTUAL 3D SPHERE VIEWER - WebGL container is 75% of available space, centered */}
                <div 
                    id="training-movie-3d-container" 
                    style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <div 
                        ref={containerRef} 
                        style={{ 
                            width: '75%', 
                            height: '75%',
                            maxWidth: '75%',
                            maxHeight: '75%',
                            background: 'transparent',
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                            margin: 'auto'
                        }}
                    />
                {trainingData ? (
                    <TrainingMovieSphere
                        trainingData={trainingData}
                        sessionProjections={sessionProjections}
                        lossData={lossData}
                        onPointInspected={setSelectedPointInfo}
                        rotationEnabled={rotationEnabled}
                        containerRef={containerRef}
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
            
            {/* Controls Side Panel - Right side, hugging the edge */}
            <div style={{
                flex: '0 0 25%',
                width: '25%',
                height: '100vh',
                background: '#1a1a1a',
                borderLeft: '1px solid #333',
                overflowY: 'auto',
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: '14px',
                color: '#fff'
            }}>
                {/* Build timestamp & frame info */}
                <div className="build-display" style={{
                    marginBottom: '16px',
                    padding: '8px',
                    background: 'rgba(0,0,0,0.8)',
                    borderRadius: '6px',
                    border: '1px solid #555'
                }}>
                    <div style={{ color: '#ff0000', fontSize: '12px' }}>v{BUILD_TIMESTAMP.slice(0, 19).replace('T', ' ')}</div>
                    {/* Training Status */}
                    {trainingStatus === 'training' && (
                        <div style={{ 
                            marginTop: '8px', 
                            padding: '6px', 
                            background: 'rgba(0, 255, 0, 0.1)', 
                            borderRadius: '4px',
                            border: '1px solid rgba(0, 255, 0, 0.3)'
                        }}>
                            <div style={{ color: '#00ff00', fontSize: '13px', fontWeight: 'bold' }}>
                                🎯 Training in progress
                            </div>
                            <div style={{ color: '#00ffff', fontSize: '12px', marginTop: '4px' }}>
                                Checking for new frames in {nextCheckCountdown}s
                            </div>
                        </div>
                    )}
                    {trainingStatus === 'completed' && (
                        <div style={{ 
                            marginTop: '8px', 
                            padding: '6px', 
                            background: 'rgba(0, 255, 0, 0.1)', 
                            borderRadius: '4px',
                            border: '1px solid rgba(0, 255, 0, 0.3)'
                        }}>
                            <div style={{ color: '#00ff00', fontSize: '13px', fontWeight: 'bold' }}>
                                ✅ Training Completed
                            </div>
                        </div>
                    )}
                    {frameInfo && (
                        <div style={{ marginTop: '8px' }}>
                            <div style={{ color: '#00ff00', fontSize: '16px', fontWeight: 'bold' }}>
                                Frame {frameInfo.current}/{frameInfo.total} | {frameInfo.visible} clusters
                            </div>
                            
                            {/* Progress Bar */}
                            <div style={{ 
                                marginTop: '6px',
                                background: 'rgba(255,255,255,0.2)',
                                borderRadius: '6px',
                                overflow: 'hidden',
                                height: '12px',
                                width: '100%',
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
                                fontSize: '14px', 
                                marginTop: '3px',
                                textAlign: 'center',
                                fontWeight: 'bold'
                            }}>
                                {Math.round((frameInfo.current / frameInfo.total) * 100)}%
                            </div>
                            
                            {frameInfo.epoch && (
                                <div style={{ color: '#00ffff', marginTop: '4px', fontSize: '14px', fontWeight: 'bold' }}>
                                    Epoch {frameInfo.epoch} of 225
                                </div>
                            )}
                            {frameInfo.validationLoss !== undefined && (
                                <div style={{ color: '#ffff00', marginTop: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                                    Validation Loss: {frameInfo.validationLoss.toFixed(4)}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Loss Plot */}
                {lossData && lossData.validation_loss && (
                    <div style={{ marginBottom: '16px' }}>
                        <LossPlotOverlay 
                            lossData={lossData.validation_loss} 
                            currentEpoch={frameInfo?.epoch} 
                            style={{
                                width: '100%',
                                height: '120px',
                                pointerEvents: 'none'
                            }}
                        />
                        {/* Learning Rate Plot */}
                        {lossData.learning_rate && Array.isArray(lossData.learning_rate) && lossData.learning_rate.length > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                <LossPlotOverlay 
                                    lossData={lossData.learning_rate.map((lr: any) => ({
                                        epoch: lr.epoch || lr.epoch_number || 0,
                                        value: lr.value || lr.learning_rate || lr.current_learning_rate || 0
                                    }))} 
                                    currentEpoch={frameInfo?.epoch} 
                                    title="Learning Rate"
                                    style={{
                                        width: '100%',
                                        height: '100px',
                                        pointerEvents: 'none'
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Frame Controls */}
                {frameInfo && frameInfo.total > 0 && (
                    <div style={{
                        background: 'rgba(0,0,0,0.6)',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #555',
                        marginBottom: '16px'
                    }}>
                        {/* Scrub Slider */}
                        <div 
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                marginBottom: '12px'
                            }}
                            onWheel={(e) => {
                                // Handle horizontal trackpad scrolling
                                if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                                    e.preventDefault();
                                    const delta = e.deltaX > 0 ? 1 : -1;
                                    const newFrame = Math.max(1, Math.min(frameInfo.total, frameInfo.current + delta));
                                    if (newFrame !== frameInfo.current && sphereRef) {
                                        goto_training_movie_frame(sphereRef, newFrame);
                                        setIsPlaying(false);
                                        setFrameInput(newFrame.toString());
                                    }
                                }
                            }}
                        >
                            <span style={{ color: '#fff', fontSize: '14px', minWidth: '45px', flexShrink: 0 }}>Frame:</span>
                            <input
                                type="range"
                                min="1"
                                max={frameInfo.total}
                                value={frameInfo.current}
                                onChange={handleScrub}
                                style={{
                                    flex: 1,
                                    cursor: 'pointer',
                                    height: '6px',
                                    minWidth: 0
                                }}
                            />
                            <span style={{ color: '#fff', fontSize: '14px', minWidth: '60px', textAlign: 'right', flexShrink: 0 }}>
                                {frameInfo.current} / {frameInfo.total}
                            </span>
                        </div>
                        
                        {/* Control Buttons */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            marginBottom: '12px'
                        }}>
                            <button onClick={handleStepBackward} style={{ background: '#333', border: '1px solid #555', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', flexShrink: 0 }} title="Previous Frame">⏮️</button>
                            <button onClick={handlePlayPause} style={{ background: isPlaying ? '#c44' : '#4c4', border: '1px solid #555', color: '#fff', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', minWidth: '50px', fontWeight: 'bold', flexShrink: 0 }} title={isPlaying ? "Pause" : "Play"}>{isPlaying ? '⏸️' : '▶️'}</button>
                            <button onClick={handleStepForward} style={{ background: '#333', border: '1px solid #555', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', flexShrink: 0 }} title="Next Frame">⏭️</button>
                            <div style={{ margin: '0 4px', color: '#888', flexShrink: 0 }}>|</div>
                            <input type="number" value={frameInput} onChange={(e) => setFrameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGotoFrame()} placeholder="#" style={{ background: '#222', border: '1px solid #555', color: '#fff', padding: '6px 8px', borderRadius: '4px', width: '60px', fontSize: '14px', flexShrink: 0 }} min="1" max={frameInfo?.total || 1} />
                            <button onClick={handleGotoFrame} style={{ background: '#333', border: '1px solid #555', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }} title="Go to Frame">Go</button>
                            <div style={{ margin: '0 4px', color: '#888', flexShrink: 0 }}>|</div>
                            <button onClick={handleStop} style={{ background: '#633', border: '1px solid #555', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }} title="Stop">⏹️</button>
                            <button onClick={handleReplay} style={{ background: '#333', border: '1px solid #555', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }} title="Replay">🔄</button>
                        </div>
                    </div>
                )}

                {/* Search & Bounds Box Controls */}
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #555', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => setShowSearch(!showSearch)} style={{ background: showSearch ? '#4c4' : '#333', border: '1px solid #555', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }} title="Toggle Search">🔍 Search</button>
                        <button onClick={() => { setShowBoundsBox(!showBoundsBox); if (sphereRef) { toggle_bounds_box(sphereRef, !showBoundsBox); render_sphere(sphereRef); } }} style={{ background: showBoundsBox ? '#4c4' : '#333', border: '1px solid #555', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }} title="Toggle Bounds Box">📦 Bounds</button>
                    </div>
                    {showBoundsBox && sphereRef && sphereRef.boundsBoxVolumeUtilization !== undefined && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #555', fontSize: '13px', color: '#00ff00' }}>
                            📊 Volume Utilization: <strong>{sphereRef.boundsBoxVolumeUtilization.toFixed(2)}%</strong>
                            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                                Unit sphere occupies {sphereRef.boundsBoxVolumeUtilization.toFixed(2)}% of bounding box volume
                            </div>
                        </div>
                    )}
                </div>

                {/* Search Panel - Inline in side panel */}
                {showSearch && columnTypes && Object.keys(columnTypes).length > 0 && (
                    <div style={{ background: 'rgba(0,0,0,0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #555', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <label style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px' }}>
                                    Column:
                                    <select value={selectedSearchColumn} onChange={(e) => setSelectedSearchColumn(e.target.value)} style={{ marginLeft: '4px', fontSize: '13px', padding: '4px 6px', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '3px', cursor: 'pointer' }}>
                                        {Object.keys(columnTypes).map((col) => (<option key={col} value={col}>{col}</option>))}
                                    </select>
                                </label>
                                <input type="text" value={searchQuery} onChange={handleSearchInput} placeholder="Search..." style={{ background: '#222', border: '1px solid #555', color: '#fff', padding: '6px 10px', borderRadius: '3px', fontSize: '14px', flex: 1, minWidth: '150px' }} />
                                {searchQuery && (<button onClick={() => { setSearchQuery(''); if (sphereRef) { clear_colors(sphereRef); render_sphere(sphereRef); } }} style={{ background: '#633', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '13px' }} title="Clear Search">✕</button>)}
                            </div>
                            {/* Example Queries */}
                            <div style={{ borderTop: '1px solid #555', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ color: '#888', fontSize: '13px', marginBottom: '4px' }}>Example queries:</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {(() => {
                                        const examples: string[] = [];
                                        if (selectedSearchColumn && columnTypes[selectedSearchColumn]) {
                                            const colType = columnTypes[selectedSearchColumn];
                                            if (colType === 'string') {
                                                examples.push('a', 'test', 'value');
                                            } else if (colType === 'set') {
                                                const sampleValues = new Set<string>();
                                                if (sphereRef && sphereRef.pointRecordsByID) {
                                                    for (const record of sphereRef.pointRecordsByID.values()) {
                                                        const val = record.original[selectedSearchColumn];
                                                        if (val !== undefined) {
                                                            sampleValues.add(String(val));
                                                            if (sampleValues.size >= 3) break;
                                                        }
                                                    }
                                                }
                                                examples.push(...Array.from(sampleValues).slice(0, 3));
                                            }
                                        }
                                        return examples.length > 0 ? examples.map((ex, idx) => (
                                            <button key={idx} onClick={() => { setSearchQuery(ex); if (sphereRef && columnTypes && selectedSearchColumn) { const queryColumnType = columnTypes[selectedSearchColumn]; const theRecords = filter_record_list(queryColumnType, selectedSearchColumn, ex); show_search_results(sphereRef, theRecords); render_sphere(sphereRef); } }} style={{ background: '#444', border: '1px solid #666', color: '#fff', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '13px' }}>{ex}</button>
                                        )) : null;
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Visual Controls */}
                {frameInfo && (
                    <div style={{ background: 'rgba(0,0,0,0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #555', marginBottom: '16px' }}>
                        <div style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>Visual Controls</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: '#fff', fontSize: '14px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={showDynamicPoints} onChange={(e) => { console.log('🔹 Point sizing toggled:', e.target.checked); setShowDynamicPoints(e.target.checked); }} style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }} />
                                🔹 Dynamic Point Sizing
                            </label>
                            <label style={{ color: frameInfo.visible >= 4 ? '#fff' : '#888', fontSize: '14px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={showDynamicHulls} onChange={(e) => { console.log('🔮 Sphere sizing toggled:', e.target.checked, 'clusters:', frameInfo.visible); setShowDynamicHulls(e.target.checked); }} style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }} disabled={frameInfo.visible < 4} />
                                🔮 Dynamic Spheres ({frameInfo.visible} clusters)
                            </label>
                            <div style={{ marginTop: '8px', borderTop: '1px solid #555', paddingTop: '8px' }}>
                                <label style={{ color: '#fff', fontSize: '14px', display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                    🛤️ Trail Length:
                                    <input type="range" min="2" max="15" value={trailLength} onChange={(e) => { const newLength = parseInt(e.target.value); console.log('🛤️ Trail length changed:', newLength); setTrailLength(newLength); }} style={{ marginLeft: '8px', marginRight: '8px', cursor: 'pointer', flex: 1 }} />
                                    <span style={{ fontSize: '14px', color: '#ccc', minWidth: '20px' }}>{trailLength}</span>
                                </label>
                            </div>
                            <div style={{ marginTop: '8px', borderTop: '1px solid #555', paddingTop: '8px' }}>
                                <label style={{ color: '#fff', fontSize: '14px', display: 'flex', alignItems: 'center' }}>
                                    🎯 Focus Cluster:
                                    <select value={spotlightCluster} onChange={(e) => { const cluster = parseInt(e.target.value); console.log('🎯 Spotlight cluster changed:', cluster); setSpotlightCluster(cluster); if (sphereRef) { sphereRef.spotlightCluster = cluster; update_cluster_spotlight(sphereRef); render_sphere(sphereRef); } }} style={{ marginLeft: '8px', fontSize: '13px', padding: '4px 6px', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '3px', cursor: 'pointer', flex: 1 }}>
                                        <option value={-1}>Off</option>
                                        {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => (<option key={i} value={i}>C{i}</option>))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Other Controls */}
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #555', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={() => setShowClusterDebug(!showClusterDebug)} style={{ background: showClusterDebug ? '#4c4' : '#333', border: '1px solid #555', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }} title="Toggle Cluster Inspector">🔍 Debug</button>
                        <button onClick={() => setShowColorLegend(!showColorLegend)} style={{ background: showColorLegend ? '#4c4' : '#333', border: '1px solid #555', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }} title="Toggle Color Legend">🎨 Colors</button>
                        <button onClick={toggleFullscreen} style={{ background: isFullscreen ? '#4c4' : '#333', border: '1px solid #555', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }} title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>{isFullscreen ? '🪟 Exit' : '⛶ Full'}</button>
                        <button onClick={() => setRotationEnabled(!rotationEnabled)} style={{ background: rotationEnabled ? '#4c4' : '#c44', border: '1px solid #555', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }} title={rotationEnabled ? "Disable Rotation" : "Enable Rotation"}>{rotationEnabled ? '🔄 On' : '⏸️ Off'}</button>
                    </div>
                </div>

                {/* Color Legend - Inline in side panel */}
                {showColorLegend && frameInfo && (
                    <div style={{ background: 'rgba(0,0,0,0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #555', marginBottom: '16px' }}>
                        <div style={{ color: '#4c4', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center', fontSize: '16px' }}>🎨 Cluster Colors</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => {
                                // Clusters are 0-based, so cluster 0 uses color index 0
                                const kColorTable = [0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0xbcf60c, 0xfabebe, 0x008080, 0xe6beff, 0x9a6324, 0xfffac8, 0x800000, 0xaaffc3, 0x808000, 0xffd8b1, 0x999999, 0x0000ff, 0x00ff00, 0xffcccc];
                                const colorHex = kColorTable[i] || 0x999999;
                                const color = '#' + colorHex.toString(16).padStart(6, '0');
                                return (<div key={`cluster-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '14px' }}>C{i}</span><div style={{ background: color, width: '20px', height: '20px', border: '1px solid #555', borderRadius: '3px' }}></div></div>);
                            })}
                        </div>
                    </div>
                )}

                {/* Cluster Debug Panel - Inline in side panel */}
                {showClusterDebug && (
                    <div style={{ background: 'rgba(0,0,0,0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #555', marginBottom: '16px' }}>
                        <div style={{ color: '#4c4', fontWeight: 'bold', marginBottom: '8px', fontSize: '16px' }}>🔍 Cluster Inspector</div>
                        {frameInfo && (<div style={{ marginBottom: '8px', fontSize: '14px' }}><div>Frame: {frameInfo.current}/{frameInfo.total}</div><div>Visible Clusters: {frameInfo.visible}</div><div>Epoch: {frameInfo.epoch || 'unknown'}</div></div>)}
                        {selectedPointInfo && (<div style={{ marginTop: '8px', borderTop: '1px solid #444', paddingTop: '8px', fontSize: '13px' }}><div style={{ color: '#ff4', fontWeight: 'bold' }}>Selected Point:</div><div>Record ID: {selectedPointInfo.recordId}</div><div>Row Offset: {selectedPointInfo.rowOffset}</div><div>Cluster ID: {selectedPointInfo.clusterId}</div><div>Color: <span style={{ background: selectedPointInfo.color, padding: '2px 6px', borderRadius: '2px' }}>{selectedPointInfo.color}</span></div><div>Position: {selectedPointInfo.position}</div></div>)}
                        <div style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>Click points on sphere to inspect</div>
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
        
        console.log('✅ Final sphere data processed:', {
            points: records.length,
            clusters: Object.keys(data.entire_cluster_results || {}).length
        });
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
            console.error("Error getting column types:", error);
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
            const sphere_record: SphereRecord = {
                coords: {
                    x: entry["0"],
                    y: entry["1"],
                    z: entry["2"],
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
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
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

export default function FeatrixSphereEmbedded({ initial_data, apiBaseUrl, isRotating, rotationSpeed, animateClusters, pointSize, pointOpacity, onSphereReady }: SphereEmbeddedProps) {
    // Check if we have final sphere data (coords + cluster_results) or just a session ID
    const hasFinalData = initial_data?.coords && initial_data?.coords.length > 0 && initial_data?.entire_cluster_results;
    const sessionId = initial_data?.session?.session_id;
    
    // If we have final sphere data, show the final sphere
    // Otherwise, show training movie (if sessionId provided)
    if (hasFinalData) {
        // Show final sphere with provided data
        return (
            <div className="sphere-embedded-container">
                <div className="mx-auto">
                    <FinalSphereView 
                        data={initial_data}
                        isRotating={isRotating}
                        rotationSpeed={rotationSpeed}
                        animateClusters={animateClusters}
                        pointSize={pointSize}
                        pointOpacity={pointOpacity}
                        onSphereReady={onSphereReady}
                    />
                </div>
            </div>
        );
    } else if (sessionId) {
        // Show training movie for the provided session ID
        return (
            <div className="sphere-embedded-container">
                <div className="mx-auto">
                    <TrainingMovie sessionId={sessionId} apiBaseUrl={apiBaseUrl} />
                </div>
            </div>
        );
    } else {
        // No data and no session ID - show error
        return (
            <div className="sphere-embedded-container">
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                    <p>No data or session ID provided</p>
                    <p style={{ fontSize: '12px', marginTop: '10px' }}>Please provide sphere data or a session ID</p>
                </div>
            </div>
        );
    }
} 