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
import { fetch_session_data, fetch_session_projections, fetch_training_metrics, fetch_session_status, fetch_single_epoch, setRetryStatusCallback } from './embed-data-access';
import { SphereRecord, SphereRecordIndex, remap_cluster_assignments, render_sphere, initialize_sphere, set_animation_options, set_visual_options, load_training_movie, play_training_movie, stop_training_movie, pause_training_movie, resume_training_movie, step_training_movie_frame, goto_training_movie_frame, compute_cluster_convex_hulls, update_cluster_spotlight, show_search_results, clear_colors, toggle_bounds_box, add_selected_record, change_object_color, clear_selected_objects, set_cluster_color, clear_cluster_colors, change_cluster_count, get_active_cluster_count_key, compute_embedding_convex_hull, toggle_embedding_hull, toggle_great_circles, register_event_listener, set_cluster_color_mode, compute_epoch_movement_stats } from '../featrix_sphere_control';
import { v4 as uuid4 } from 'uuid';
import CollapsibleSection from './components/CollapsibleSection';

// Build timestamp for cache busting verification - set at module load time
const BUILD_TIMESTAMP = new Date().toISOString();

// Loss Plot Screen Overlay Component - MUCH BETTER VERSION with Dual Y-Axis Support and Zoom
const LossPlotOverlay: React.FC<{
    lossData: Array<{ epoch: number | string, value: number }>,
    learningRateData?: Array<{ epoch: number | string, value: number }>,
    currentEpoch?: string,
    title?: string,
    style?: React.CSSProperties
}> = ({ lossData, learningRateData, currentEpoch, title = 'Validation Loss', style }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const modalCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [showModal, setShowModal] = useState(false);

    // Hover state for tooltip
    const [hoverInfo, setHoverInfo] = useState<{
        x: number;
        y: number;
        epoch: number;
        loss: number;
        lr?: number;
    } | null>(null);
    
    // Zoom and pan state
    const [zoomState, setZoomState] = useState({
        epochMin: 0,
        epochMax: 0,
        lossMin: 0,
        lossMax: 0,
        lrMin: 0,
        lrMax: 0,
        isZoomed: false
    });
    
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
    const [dragEnd, setDragEnd] = useState<{ x: number, y: number } | null>(null);
    
    // Initialize zoom state with full data range
    useEffect(() => {
        if (!lossData || lossData.length === 0) return;
        
        const epochs = lossData.map(d => typeof d.epoch === 'string' ? parseInt(d.epoch) : d.epoch);
        const losses = lossData.map(d => d.value);
        const minEpoch = Math.min(...epochs);
        const maxEpoch = Math.max(...epochs);
        let minLoss = Math.min(...losses);
        let maxLoss = Math.max(...losses);
        
        const lossRange = maxLoss - minLoss;
        if (lossRange < 0.01) {
            minLoss -= 0.001;
            maxLoss += 0.001;
        } else {
            minLoss -= lossRange * 0.05;
            maxLoss += lossRange * 0.05;
        }
        
        let minLR = 0;
        let maxLR = 1;
        if (learningRateData && learningRateData.length > 0) {
            const lrValues = learningRateData.map(d => d.value);
            minLR = Math.min(...lrValues);
            maxLR = Math.max(...lrValues);
            const lrRange = maxLR - minLR;
            if (lrRange < 0.0001) {
                minLR -= 0.00001;
                maxLR += 0.00001;
            } else {
                minLR -= lrRange * 0.05;
                maxLR += lrRange * 0.05;
            }
        }
        
        setZoomState(prev => {
            if (!prev.isZoomed) {
                return {
                    epochMin: minEpoch,
                    epochMax: maxEpoch,
                    lossMin: minLoss,
                    lossMax: maxLoss,
                    lrMin: minLR,
                    lrMax: maxLR,
                    isZoomed: false
                };
            }
            return prev;
        });
    }, [lossData, learningRateData]);
    
    // Handle mouse wheel zoom
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const leftPadding = 70;
        const rightPadding = learningRateData && learningRateData.length > 0 ? 70 : 20;
        const topPadding = 35;
        const bottomPadding = 35;
        const plotWidth = canvas.width - leftPadding - rightPadding;
        const plotHeight = canvas.height - topPadding - bottomPadding;
        
        // Check if mouse is over plot area
        if (x < leftPadding || x > leftPadding + plotWidth || y < topPadding || y > topPadding + plotHeight) {
            return;
        }
        
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        
        setZoomState(prev => {
            if (!prev.isZoomed) {
                // Initialize from full range
                const epochs = lossData.map(d => typeof d.epoch === 'string' ? parseInt(d.epoch) : d.epoch);
                const losses = lossData.map(d => d.value);
                const minEpoch = Math.min(...epochs);
                const maxEpoch = Math.max(...epochs);
                let minLoss = Math.min(...losses);
                let maxLoss = Math.max(...losses);
                const lossRange = maxLoss - minLoss;
                if (lossRange < 0.01) {
                    minLoss -= 0.001;
                    maxLoss += 0.001;
                } else {
                    minLoss -= lossRange * 0.05;
                    maxLoss += lossRange * 0.05;
                }
                
                let minLR = 0, maxLR = 1;
                if (learningRateData && learningRateData.length > 0) {
                    const lrValues = learningRateData.map(d => d.value);
                    minLR = Math.min(...lrValues);
                    maxLR = Math.max(...lrValues);
                    const lrRange = maxLR - minLR;
                    if (lrRange < 0.0001) {
                        minLR -= 0.00001;
                        maxLR += 0.00001;
                    } else {
                        minLR -= lrRange * 0.05;
                        maxLR += lrRange * 0.05;
                    }
                }
                
                prev = {
                    epochMin: minEpoch,
                    epochMax: maxEpoch,
                    lossMin: minLoss,
                    lossMax: maxLoss,
                    lrMin: minLR,
                    lrMax: maxLR,
                    isZoomed: false
                };
            }
            
            // Calculate mouse position in data coordinates
            const epochAtMouse = prev.epochMin + ((x - leftPadding) / plotWidth) * (prev.epochMax - prev.epochMin);
            const lossAtMouse = prev.lossMax - ((y - topPadding) / plotHeight) * (prev.lossMax - prev.lossMin);
            
            // Zoom around mouse position
            const epochRange = prev.epochMax - prev.epochMin;
            const lossRange = prev.lossMax - prev.lossMin;
            const newEpochRange = epochRange / zoomFactor;
            const newLossRange = lossRange / zoomFactor;
            
            const epochCenter = epochAtMouse;
            const lossCenter = lossAtMouse;
            
            return {
                epochMin: epochCenter - newEpochRange / 2,
                epochMax: epochCenter + newEpochRange / 2,
                lossMin: lossCenter - newLossRange / 2,
                lossMax: lossCenter + newLossRange / 2,
                lrMin: prev.lrMin,
                lrMax: prev.lrMax,
                isZoomed: true
            };
        });
    };
    
    // Handle mouse down for drag selection
    const handleMouseDown = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const leftPadding = 70;
        const rightPadding = learningRateData && learningRateData.length > 0 ? 70 : 20;
        const topPadding = 35;
        const plotWidth = canvas.width - leftPadding - rightPadding;
        const plotHeight = canvas.height - topPadding - 35;
        
        // Check if mouse is over plot area
        if (x >= leftPadding && x <= leftPadding + plotWidth && y >= topPadding && y <= topPadding + plotHeight) {
            setIsDragging(true);
            setDragStart({ x, y });
            setDragEnd(null);
        }
    };
    
    // Handle mouse move for drag selection
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !dragStart) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        setDragEnd({ x, y });
    };
    
    // Handle mouse up to complete zoom selection
    const handleMouseUp = () => {
        if (!isDragging || !dragStart || !dragEnd) {
            setIsDragging(false);
            setDragStart(null);
            setDragEnd(null);
            return;
        }
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const leftPadding = 70;
        const rightPadding = learningRateData && learningRateData.length > 0 ? 70 : 20;
        const topPadding = 35;
        const bottomPadding = 35;
        const plotWidth = canvas.width - leftPadding - rightPadding;
        const plotHeight = canvas.height - topPadding - bottomPadding;
        
        // Convert drag coordinates to data coordinates
        const x1 = Math.max(leftPadding, Math.min(leftPadding + plotWidth, dragStart.x));
        const y1 = Math.max(topPadding, Math.min(topPadding + plotHeight, dragStart.y));
        const x2 = Math.max(leftPadding, Math.min(leftPadding + plotWidth, dragEnd.x));
        const y2 = Math.max(topPadding, Math.min(topPadding + plotHeight, dragEnd.y));
        
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        
        // Only zoom if selection is large enough
        if (width > 20 && height > 20) {
            setZoomState(prev => {
                const epochMin = prev.epochMin + ((Math.min(x1, x2) - leftPadding) / plotWidth) * (prev.epochMax - prev.epochMin);
                const epochMax = prev.epochMin + ((Math.max(x1, x2) - leftPadding) / plotWidth) * (prev.epochMax - prev.epochMin);
                const lossMax = prev.lossMax - ((Math.min(y1, y2) - topPadding) / plotHeight) * (prev.lossMax - prev.lossMin);
                const lossMin = prev.lossMax - ((Math.max(y1, y2) - topPadding) / plotHeight) * (prev.lossMax - prev.lossMin);
                
                return {
                    epochMin,
                    epochMax,
                    lossMin,
                    lossMax,
                    lrMin: prev.lrMin,
                    lrMax: prev.lrMax,
                    isZoomed: true
                };
            });
        }
        
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
    };
    
    // Reset zoom
    const handleResetZoom = () => {
        const epochs = lossData.map(d => typeof d.epoch === 'string' ? parseInt(d.epoch) : d.epoch);
        const losses = lossData.map(d => d.value);
        const minEpoch = Math.min(...epochs);
        const maxEpoch = Math.max(...epochs);
        let minLoss = Math.min(...losses);
        let maxLoss = Math.max(...losses);
        
        const lossRange = maxLoss - minLoss;
        if (lossRange < 0.01) {
            minLoss -= 0.001;
            maxLoss += 0.001;
        } else {
            minLoss -= lossRange * 0.05;
            maxLoss += lossRange * 0.05;
        }
        
        let minLR = 0;
        let maxLR = 1;
        if (learningRateData && learningRateData.length > 0) {
            const lrValues = learningRateData.map(d => d.value);
            minLR = Math.min(...lrValues);
            maxLR = Math.max(...lrValues);
            const lrRange = maxLR - minLR;
            if (lrRange < 0.0001) {
                minLR -= 0.00001;
                maxLR += 0.00001;
            } else {
                minLR -= lrRange * 0.05;
                maxLR += lrRange * 0.05;
            }
        }
        
        setZoomState({
            epochMin: minEpoch,
            epochMax: maxEpoch,
            lossMin: minLoss,
            lossMax: maxLoss,
            lrMin: minLR,
            lrMax: maxLR,
            isZoomed: false
        });
    };
    
    // Helper function to draw graph to any canvas - use useCallback to memoize
    const drawGraph = useCallback((canvas: HTMLCanvasElement, isModal: boolean = false) => {
        if (!canvas || !lossData || lossData.length === 0) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const { width, height } = canvas;
        // Scale padding for modal
        const scale = isModal ? 1.5 : 1;
        const leftPadding = Math.round(70 * scale);   // More space for left Y-axis labels
        const rightPadding = learningRateData && learningRateData.length > 0 ? Math.round(70 * scale) : Math.round(20 * scale); // Space for right Y-axis if needed
        const topPadding = Math.round(35 * scale);    // Space for title
        const bottomPadding = Math.round(35 * scale); // Space for X-axis labels
        const plotWidth = width - leftPadding - rightPadding;
        const plotHeight = height - topPadding - bottomPadding;
        
        // Enable anti-aliasing for smooth lines
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Clear canvas with proper background
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(0, 0, width, height);
        
        // Find min/max values for validation loss
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
        
        // Find min/max values for learning rate if provided
        let minLR = 0;
        let maxLR = 1;
        if (learningRateData && learningRateData.length > 0) {
            const lrValues = learningRateData.map(d => d.value);
            minLR = Math.min(...lrValues);
            maxLR = Math.max(...lrValues);
            const lrRange = maxLR - minLR;
            if (lrRange < 0.0001) {
                minLR -= 0.00001;
                maxLR += 0.00001;
            } else {
                minLR -= lrRange * 0.05;
                maxLR += lrRange * 0.05;
            }
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
        // Y-axis (left) - Validation Loss
        ctx.moveTo(leftPadding, topPadding);
        ctx.lineTo(leftPadding, topPadding + plotHeight);
        // Y-axis (right) - Learning Rate
        if (learningRateData && learningRateData.length > 0) {
            ctx.moveTo(leftPadding + plotWidth, topPadding);
            ctx.lineTo(leftPadding + plotWidth, topPadding + plotHeight);
        }
        ctx.stroke();
        
        // CRITICAL FIX: Sort loss data by epoch number before plotting!
        const sortedLossData = [...lossData].sort((a, b) => {
            const epochA = typeof a.epoch === 'string' ? parseInt(a.epoch) : a.epoch;
            const epochB = typeof b.epoch === 'string' ? parseInt(b.epoch) : b.epoch;
            return epochA - epochB;
        });
        
        // Sort learning rate data if provided
        let sortedLRData: Array<{ epoch: number | string, value: number }> = [];
        if (learningRateData && learningRateData.length > 0) {
            sortedLRData = [...learningRateData].sort((a, b) => {
                const epochA = typeof a.epoch === 'string' ? parseInt(a.epoch) : a.epoch;
                const epochB = typeof b.epoch === 'string' ? parseInt(b.epoch) : b.epoch;
                return epochA - epochB;
            });
        }
        
        // Draw smooth validation loss curve with gradient
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
        
        // Draw learning rate curve if provided (using right Y-axis) - SEPARATE YELLOW LINE
        if (sortedLRData.length > 0) {
            // Make learning rate line VERY visible - YELLOW CURVE
            ctx.strokeStyle = '#ffff00'; // BRIGHT YELLOW for learning rate
            ctx.lineWidth = 5; // THICK line
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowColor = '#ffff00';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            
            sortedLRData.forEach((point, i) => {
                const epoch = typeof point.epoch === 'string' ? parseInt(point.epoch) : point.epoch;
                const x = leftPadding + ((epoch - minEpoch) / (maxEpoch - minEpoch)) * plotWidth;
                // Map to right Y-axis (inverted like left axis)
                const y = topPadding + (1 - (point.value - minLR) / (maxLR - minLR)) * plotHeight;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            ctx.shadowBlur = 0; // Reset shadow
            
            // Draw learning rate data points for visibility - YELLOW
            ctx.fillStyle = '#ffff00';
            sortedLRData.forEach((point, i) => {
                if (i % 2 === 0) { // Show every 2nd point for better visibility
                    const epoch = typeof point.epoch === 'string' ? parseInt(point.epoch) : point.epoch;
                    const x = leftPadding + ((epoch - minEpoch) / (maxEpoch - minEpoch)) * plotWidth;
                    const y = topPadding + (1 - (point.value - minLR) / (maxLR - minLR)) * plotHeight;
                    
                    ctx.beginPath();
                    ctx.arc(x, y, 5, 0, 2 * Math.PI);
                    ctx.fill();
                    // White outline for contrast
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            });
        }
        
        // Draw data points for validation loss - make them more visible
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
        
        // Draw current epoch cursor with glow effect - ALWAYS VISIBLE during animation
        if (currentEpoch) {
            // Parse epoch - handle both "epoch_1" format and numeric formats
            let currentEpochNum: number;
            if (typeof currentEpoch === 'string') {
                // Remove "epoch_" prefix if present, then parse
                const cleaned = currentEpoch.replace(/^epoch_/i, '');
                currentEpochNum = parseInt(cleaned);
            } else {
                currentEpochNum = currentEpoch;
            }
            
            // Skip if invalid epoch number
            if (isNaN(currentEpochNum)) {
                return;
            }
            
            // Calculate cursor X position based on epoch
            const epochRange = maxEpoch - minEpoch;
            const x = epochRange > 0 
                ? leftPadding + ((currentEpochNum - minEpoch) / epochRange) * plotWidth
                : leftPadding + plotWidth / 2;
            
            // Only draw cursor if it's within the visible range
            if (x >= leftPadding && x <= leftPadding + plotWidth) {
                // Enhanced glow effect for better visibility
                ctx.shadowColor = '#ff4444';
                ctx.shadowBlur = 15;
                ctx.strokeStyle = '#ff4444';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x, topPadding);
                ctx.lineTo(x, topPadding + plotHeight);
                ctx.stroke();
                
                // Reset shadow
                ctx.shadowBlur = 0;
                
                // Helper function to parse epoch number
                const parseEpoch = (epoch: number | string): number => {
                    if (typeof epoch === 'string') {
                        const cleaned = epoch.replace(/^epoch_/i, '');
                        return parseInt(cleaned);
                    }
                    return epoch;
                };
                
                // Find closest validation loss point (exact match or closest)
                let currentPoint = lossData.find(d => {
                    const epoch = parseEpoch(d.epoch);
                    return epoch === currentEpochNum;
                });
                
                // If no exact match, find closest epoch
                if (!currentPoint && sortedLossData.length > 0) {
                    let closest = sortedLossData[0];
                    let minDiff = Math.abs(parseEpoch(closest.epoch) - currentEpochNum);
                    for (const point of sortedLossData) {
                        const epoch = parseEpoch(point.epoch);
                        const diff = Math.abs(epoch - currentEpochNum);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closest = point;
                        }
                    }
                    currentPoint = closest;
                }
                
                if (currentPoint) {
                    const lossValue = currentPoint.value;
                    const y = topPadding + (1 - (lossValue - minLoss) / (maxLoss - minLoss)) * plotHeight;
                    
                    // Draw validation loss marker
                    ctx.fillStyle = '#ff4444';
                    ctx.beginPath();
                    ctx.arc(x, y, 6, 0, 2 * Math.PI);
                    ctx.fill();
                    
                    // Draw white outline for better visibility
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Value label with background for readability - MUCH BIGGER
                    const lossText = lossValue < 0.01 ? lossValue.toFixed(4) : 
                                    lossValue < 0.1 ? lossValue.toFixed(3) : 
                                    lossValue.toFixed(2);
                    
                    // Draw BIG background rectangle for text with padding
                    const fontSize = 18 * scale; // Scale with modal
                    const padding = 12 * scale;
                    
                    // Set font BEFORE measuring text
                    ctx.font = `bold ${fontSize}px Arial`;
                    const textWidth = ctx.measureText(`Loss: ${lossText}`).width;
                    const boxWidth = Math.max(120 * scale, textWidth + padding * 2);
                    const boxHeight = fontSize + padding * 2;
                    const boxX = x - boxWidth / 2;
                    const boxY = Math.max(10 * scale, y - boxHeight - 15 * scale);
                    
                    // Draw background with border
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
                    ctx.fillRect(boxX - 2, boxY - 2, boxWidth + 4, boxHeight + 4);
                    ctx.strokeStyle = '#00ff88';
                    ctx.lineWidth = 2 * scale;
                    ctx.strokeRect(boxX - 2, boxY - 2, boxWidth + 4, boxHeight + 4);
                    
                    // Draw validation loss label - BIG TEXT
                    ctx.fillStyle = '#00ff88';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Loss: ${lossText}`, x, boxY + fontSize + padding / 2);
                }
                
                // Find closest learning rate point
                if (sortedLRData.length > 0) {
                    let currentLRPoint = sortedLRData.find(d => {
                        const epoch = parseEpoch(d.epoch);
                        return epoch === currentEpochNum;
                    });
                    
                    // If no exact match, find closest epoch
                    if (!currentLRPoint) {
                        let closest = sortedLRData[0];
                        let minDiff = Math.abs(parseEpoch(closest.epoch) - currentEpochNum);
                        for (const point of sortedLRData) {
                            const epoch = parseEpoch(point.epoch);
                            const diff = Math.abs(epoch - currentEpochNum);
                            if (diff < minDiff) {
                                minDiff = diff;
                                closest = point;
                            }
                        }
                        currentLRPoint = closest;
                    }
                    
                    if (currentLRPoint) {
                        const lrValue = currentLRPoint.value;
                        const lrY = topPadding + (1 - (lrValue - minLR) / (maxLR - minLR)) * plotHeight;
                        
                        // Draw learning rate marker - BIGGER - YELLOW
                        ctx.fillStyle = '#ffff00';
                        ctx.beginPath();
                        ctx.arc(x, lrY, 8 * scale, 0, 2 * Math.PI);
                        ctx.fill();
                        
                        // Draw black outline for contrast
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 3 * scale;
                        ctx.stroke();
                        
                        // Format learning rate value
                        const lrText = lrValue < 0.0001 ? lrValue.toExponential(2) :
                                       lrValue < 0.01 ? lrValue.toFixed(5) :
                                       lrValue < 0.1 ? lrValue.toFixed(4) :
                                       lrValue.toFixed(3);
                        
                        // Draw BIG background rectangle for learning rate text
                        const lrFontSize = 18 * scale;
                        const lrPadding = 12 * scale;
                        
                        // Set font BEFORE measuring text
                        ctx.font = `bold ${lrFontSize}px Arial`;
                        const lrTextWidth = ctx.measureText(`LR: ${lrText}`).width;
                        const lrBoxWidth = Math.max(120 * scale, lrTextWidth + lrPadding * 2);
                        const lrBoxHeight = lrFontSize + lrPadding * 2;
                        const lrBoxX = x - lrBoxWidth / 2;
                        // Position below loss callout if they overlap, otherwise above marker
                        const lrBoxY = (lrY < y && Math.abs(lrY - y) < 50 * scale) 
                            ? Math.max(10 * scale, lrY + 20 * scale)
                            : Math.max(10 * scale, lrY - lrBoxHeight - 15 * scale);
                        
                        // Draw background with border - YELLOW
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
                        ctx.fillRect(lrBoxX - 2, lrBoxY - 2, lrBoxWidth + 4, lrBoxHeight + 4);
                        ctx.strokeStyle = '#ffff00';
                        ctx.lineWidth = 2 * scale;
                        ctx.strokeRect(lrBoxX - 2, lrBoxY - 2, lrBoxWidth + 4, lrBoxHeight + 4);
                        
                        // Draw learning rate label - BIG TEXT - YELLOW
                        ctx.fillStyle = '#ffff00';
                        ctx.textAlign = 'center';
                        ctx.fillText(`LR: ${lrText}`, x, lrBoxY + lrFontSize + lrPadding / 2);
                    }
                }
            }
        }
        
        // Draw labels with better formatting - LARGER FONTS
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'center';

        // X-axis labels (epochs)
        for (let i = 0; i <= 5; i++) {
            const epoch = minEpoch + (i / 5) * (maxEpoch - minEpoch);
            const x = leftPadding + (i / 5) * plotWidth;
            ctx.fillText(Math.round(epoch).toString(), x, height - 8);
        }

        // Left Y-axis labels (validation loss values) - LARGER
        ctx.textAlign = 'right';
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#00ff88'; // Green color for loss axis
        for (let i = 0; i <= 4; i++) {
            const loss = maxLoss - (i / 4) * (maxLoss - minLoss);
            const y = topPadding + (i / 4) * plotHeight;
            // Smart decimal formatting based on value magnitude
            const formatted = loss < 0.01 ? loss.toFixed(4) :
                             loss < 0.1 ? loss.toFixed(3) :
                             loss.toFixed(2);
            ctx.fillText(formatted, leftPadding - 10, y + 5);
        }

        // Right Y-axis labels (learning rate values) if provided - LARGER
        if (sortedLRData.length > 0) {
            ctx.textAlign = 'left';
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = '#ffff00'; // YELLOW color for learning rate axis
            for (let i = 0; i <= 4; i++) {
                const lr = maxLR - (i / 4) * (maxLR - minLR);
                const y = topPadding + (i / 4) * plotHeight;
                // Smart decimal formatting for learning rate
                const formatted = lr < 0.0001 ? lr.toExponential(2) :
                                 lr < 0.01 ? lr.toFixed(5) :
                                 lr < 0.1 ? lr.toFixed(4) :
                                 lr.toFixed(3);
                ctx.fillText(formatted, leftPadding + plotWidth + 10, y + 5);
            }
        }

        // Title with better positioning - LARGER
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(title, width / 2, 18);

        // Legend if both datasets are present - LARGER
        if (sortedLRData.length > 0) {
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'left';
            // Validation Loss label
            ctx.fillStyle = '#00ff88';
            ctx.fillText('Loss', leftPadding + 10, topPadding + plotHeight + 22);
            // Learning Rate label
            ctx.fillStyle = '#ffaa00';
            ctx.fillText('LR', leftPadding + 70, topPadding + plotHeight + 22);
        }
    }, [lossData, learningRateData, currentEpoch, title]);
    
    // Draw to main canvas
    useEffect(() => {
        if (canvasRef.current) {
            drawGraph(canvasRef.current, false);
        }
    }, [drawGraph]);
    
    // Draw to modal canvas when modal is open
    useEffect(() => {
        if (showModal && modalCanvasRef.current) {
            drawGraph(modalCanvasRef.current, true);
        }
    }, [showModal, drawGraph]);

    // Handle hover for tooltip
    const handleHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !lossData || lossData.length === 0) {
            setHoverInfo(null);
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        const leftPadding = 70;
        const rightPadding = learningRateData && learningRateData.length > 0 ? 70 : 20;
        const topPadding = 35;
        const plotWidth = canvas.width - leftPadding - rightPadding;
        const plotHeight = canvas.height - topPadding - 35;

        // Check if mouse is over plot area
        if (x < leftPadding || x > leftPadding + plotWidth || y < topPadding || y > topPadding + plotHeight) {
            setHoverInfo(null);
            return;
        }

        // Calculate epoch at mouse position
        const epochs = lossData.map(d => typeof d.epoch === 'string' ? parseInt(d.epoch) : d.epoch);
        const minEpoch = Math.min(...epochs);
        const maxEpoch = Math.max(...epochs);
        const epochAtMouse = minEpoch + ((x - leftPadding) / plotWidth) * (maxEpoch - minEpoch);

        // Find closest data point
        let closestPoint = lossData[0];
        let closestDist = Infinity;
        lossData.forEach(point => {
            const epoch = typeof point.epoch === 'string' ? parseInt(point.epoch) : point.epoch;
            const dist = Math.abs(epoch - epochAtMouse);
            if (dist < closestDist) {
                closestDist = dist;
                closestPoint = point;
            }
        });

        const closestEpoch = typeof closestPoint.epoch === 'string' ? parseInt(closestPoint.epoch) : closestPoint.epoch;

        // Find learning rate at same epoch if available
        let lrValue: number | undefined;
        if (learningRateData && learningRateData.length > 0) {
            const lrPoint = learningRateData.find(p => {
                const e = typeof p.epoch === 'string' ? parseInt(p.epoch) : p.epoch;
                return e === closestEpoch;
            });
            if (lrPoint) lrValue = lrPoint.value;
        }

        // Convert to screen coordinates for tooltip positioning
        setHoverInfo({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            epoch: closestEpoch,
            loss: closestPoint.value,
            lr: lrValue
        });
    }, [lossData, learningRateData]);

    const handleMouseLeave = useCallback(() => {
        setHoverInfo(null);
    }, []);

    return (
        <>
            <div
                ref={containerRef}
                style={{...style, cursor: 'pointer', position: 'relative'}}
                onClick={() => setShowModal(true)}
                onMouseMove={handleHover}
                onMouseLeave={handleMouseLeave}
                title="Click to enlarge graph"
            >
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

                {/* Vertical cursor line on hover */}
                {hoverInfo && (
                    <div style={{
                        position: 'absolute',
                        left: `${hoverInfo.x}px`,
                        top: '23%',
                        width: '1px',
                        height: '54%',
                        background: 'rgba(255,255,255,0.6)',
                        pointerEvents: 'none'
                    }} />
                )}

                {/* Tooltip on hover */}
                {hoverInfo && (
                    <div style={{
                        position: 'absolute',
                        left: `${Math.min(hoverInfo.x + 10, (containerRef.current?.offsetWidth || 200) - 120)}px`,
                        top: `${Math.max(10, hoverInfo.y - 60)}px`,
                        background: '#1e1e1e',
                        border: '1px solid #2a2a2a',
                        color: '#e0e0e0',
                        fontSize: '11px',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        pointerEvents: 'none',
                        zIndex: 100,
                        whiteSpace: 'nowrap'
                    }}>
                        <div><strong>Epoch:</strong> {hoverInfo.epoch}</div>
                        <div><strong>Loss:</strong> {hoverInfo.loss.toFixed(4)}</div>
                        {hoverInfo.lr !== undefined && (
                            <div><strong>LR:</strong> {hoverInfo.lr.toExponential(2)}</div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Modal Popover */}
            {showModal && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.9)',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px'
                    }}
                    onClick={() => setShowModal(false)}
                >
                    <div 
                        style={{
                            background: '#2a2a2a',
                            borderRadius: '12px',
                            padding: '20px',
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            position: 'relative',
                            border: '2px solid #555'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setShowModal(false)}
                            style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                background: '#c44',
                                border: '1px solid #666',
                                color: '#fff',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '18px',
                                fontWeight: 'bold',
                                zIndex: 10001
                            }}
                            title="Close"
                        >
                            ✕
                        </button>
                        <canvas 
                            ref={modalCanvasRef}
                            width="1200"
                            height="600"
                            style={{ 
                                width: '100%', 
                                height: '100%',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.2)',
                                maxWidth: '1200px',
                                maxHeight: '600px'
                            }}
                        />
                    </div>
                </div>
            )}
        </>
    );
};

// Movement Plot Overlay - shows how far points moved between epochs to evaluate convergence
const MovementPlotOverlay: React.FC<{
    movementData: Array<{ epoch: string, mean: number, median: number, p90: number, max: number }>,
    currentEpoch?: string,
    style?: React.CSSProperties
}> = ({ movementData, currentEpoch, style }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [showModal, setShowModal] = useState(false);
    const [hoverInfo, setHoverInfo] = useState<{
        x: number;
        epoch: number;
        mean: number;
        median: number;
        p90: number;
    } | null>(null);

    const drawGraph = useCallback((canvas: HTMLCanvasElement) => {
        if (!canvas || !movementData || movementData.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas;
        const leftPadding = 60;
        const rightPadding = 20;
        const topPadding = 30;
        const bottomPadding = 30;
        const plotWidth = width - leftPadding - rightPadding;
        const plotHeight = height - topPadding - bottomPadding;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(0, 0, width, height);

        // Parse epoch numbers
        const epochs = movementData.map(d => parseInt(d.epoch.replace('epoch_', '')));
        const minEpoch = Math.min(...epochs);
        const maxEpoch = Math.max(...epochs);
        const epochRange = maxEpoch - minEpoch || 1;

        // Find Y range from p90 values (mean and median will fit within this)
        const p90Values = movementData.map(d => d.p90);
        const meanValues = movementData.map(d => d.mean);
        let maxY = Math.max(...p90Values) * 1.1;
        if (maxY === 0) maxY = 1;
        const minY = 0;

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = topPadding + (i / 4) * plotHeight;
            ctx.beginPath();
            ctx.moveTo(leftPadding, y);
            ctx.lineTo(leftPadding + plotWidth, y);
            ctx.stroke();
        }
        for (let i = 0; i <= 5; i++) {
            const x = leftPadding + (i / 5) * plotWidth;
            ctx.beginPath();
            ctx.moveTo(x, topPadding);
            ctx.lineTo(x, topPadding + plotHeight);
            ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(leftPadding, topPadding + plotHeight);
        ctx.lineTo(leftPadding + plotWidth, topPadding + plotHeight);
        ctx.moveTo(leftPadding, topPadding);
        ctx.lineTo(leftPadding, topPadding + plotHeight);
        ctx.stroke();

        // Helper to map data to canvas coords
        const toX = (epoch: number) => leftPadding + ((epoch - minEpoch) / epochRange) * plotWidth;
        const toY = (val: number) => topPadding + (1 - (val - minY) / (maxY - minY)) * plotHeight;

        // Draw p90 line (faint)
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        movementData.forEach((d, i) => {
            const x = toX(epochs[i]);
            const y = toY(d.p90);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Draw median line
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        movementData.forEach((d, i) => {
            const x = toX(epochs[i]);
            const y = toY(d.median);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Draw mean line (primary)
        const gradient = ctx.createLinearGradient(0, topPadding, 0, topPadding + plotHeight);
        gradient.addColorStop(0, '#00ccff');
        gradient.addColorStop(1, '#0088aa');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        movementData.forEach((d, i) => {
            const x = toX(epochs[i]);
            const y = toY(d.mean);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Current epoch cursor
        if (currentEpoch) {
            const currentEpochNum = parseInt(currentEpoch.replace(/^epoch_/i, ''));
            if (!isNaN(currentEpochNum) && currentEpochNum >= minEpoch && currentEpochNum <= maxEpoch) {
                const x = toX(currentEpochNum);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(x, topPadding);
                ctx.lineTo(x, topPadding + plotHeight);
                ctx.stroke();
                ctx.setLineDash([]);

                // Find matching data point for callout
                const matchIdx = movementData.findIndex(d => d.epoch === currentEpoch || parseInt(d.epoch.replace('epoch_', '')) === currentEpochNum);
                if (matchIdx >= 0) {
                    const d = movementData[matchIdx];
                    const meanY = toY(d.mean);
                    // Dot on the mean line
                    ctx.fillStyle = '#00ccff';
                    ctx.beginPath();
                    ctx.arc(x, meanY, 5, 0, 2 * Math.PI);
                    ctx.fill();
                    // Callout text
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${d.mean.toFixed(4)}`, x, Math.max(topPadding + 12, meanY - 10));
                }
            }
        }

        // X-axis labels - LARGER
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const epoch = minEpoch + (i / 5) * epochRange;
            const x = leftPadding + (i / 5) * plotWidth;
            ctx.fillText(Math.round(epoch).toString(), x, height - 6);
        }

        // Y-axis labels - LARGER
        ctx.textAlign = 'right';
        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = '#00ccff';
        for (let i = 0; i <= 4; i++) {
            const val = maxY - (i / 4) * (maxY - minY);
            const y = topPadding + (i / 4) * plotHeight;
            ctx.fillText(val < 0.01 ? val.toExponential(1) : val.toFixed(3), leftPadding - 8, y + 4);
        }

        // Title - LARGER
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Point Movement (epoch-to-epoch)', width / 2, 18);

        // Legend - LARGER
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#00ccff';
        ctx.fillText('mean', leftPadding + 10, topPadding + plotHeight + 20);
        ctx.fillStyle = '#ffaa00';
        ctx.fillText('median', leftPadding + 55, topPadding + plotHeight + 20);
        ctx.fillStyle = 'rgba(255,100,100,0.7)';
        ctx.fillText('p90', leftPadding + 110, topPadding + plotHeight + 20);
    }, [movementData, currentEpoch]);

    useEffect(() => {
        if (canvasRef.current) {
            drawGraph(canvasRef.current);
        }
    }, [drawGraph]);

    // Hover handler
    const handleHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !movementData || movementData.length === 0) {
            setHoverInfo(null);
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const x = (e.clientX - rect.left) * scaleX;

        const leftPadding = 60;
        const rightPadding = 20;
        const plotWidth = canvas.width - leftPadding - rightPadding;

        if (x < leftPadding || x > leftPadding + plotWidth) {
            setHoverInfo(null);
            return;
        }

        const epochs = movementData.map(d => parseInt(d.epoch.replace('epoch_', '')));
        const minEpoch = Math.min(...epochs);
        const maxEpoch = Math.max(...epochs);
        const epochRange = maxEpoch - minEpoch || 1;
        const epochAtMouse = minEpoch + ((x - leftPadding) / plotWidth) * epochRange;

        // Find closest data point
        let closestIdx = 0;
        let closestDist = Infinity;
        epochs.forEach((epoch, i) => {
            const dist = Math.abs(epoch - epochAtMouse);
            if (dist < closestDist) {
                closestDist = dist;
                closestIdx = i;
            }
        });

        const d = movementData[closestIdx];
        setHoverInfo({
            x: e.clientX - rect.left,
            epoch: epochs[closestIdx],
            mean: d.mean,
            median: d.median,
            p90: d.p90
        });
    }, [movementData]);

    const handleMouseLeave = useCallback(() => {
        setHoverInfo(null);
    }, []);

    return (
        <div
            ref={containerRef}
            style={{...style, position: 'relative', cursor: 'pointer'}}
            onMouseMove={handleHover}
            onMouseLeave={handleMouseLeave}
            onClick={() => setShowModal(true)}
            title="Click to enlarge"
        >
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

            {/* Vertical cursor line */}
            {hoverInfo && (
                <div style={{
                    position: 'absolute',
                    left: `${hoverInfo.x}px`,
                    top: '20%',
                    width: '1px',
                    height: '60%',
                    background: 'rgba(255,255,255,0.6)',
                    pointerEvents: 'none'
                }} />
            )}

            {/* Tooltip */}
            {hoverInfo && (
                <div style={{
                    position: 'absolute',
                    left: `${Math.min(hoverInfo.x + 10, (containerRef.current?.offsetWidth || 200) - 100)}px`,
                    top: '10px',
                    background: '#1e1e1e',
                    border: '1px solid #2a2a2a',
                    color: '#e0e0e0',
                    fontSize: '11px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 100,
                    whiteSpace: 'nowrap'
                }}>
                    <div><strong>Epoch:</strong> {hoverInfo.epoch}</div>
                    <div style={{color: '#00ccff'}}><strong>Mean:</strong> {hoverInfo.mean.toFixed(4)}</div>
                    <div style={{color: '#ffaa00'}}><strong>Median:</strong> {hoverInfo.median.toFixed(4)}</div>
                    <div style={{color: 'rgba(255,100,100,0.9)'}}><strong>P90:</strong> {hoverInfo.p90.toFixed(4)}</div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.9)',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px'
                    }}
                    onClick={() => setShowModal(false)}
                >
                    <div
                        style={{
                            background: '#2a2a2a',
                            borderRadius: '12px',
                            padding: '20px',
                            maxWidth: '90vw',
                            position: 'relative',
                            border: '2px solid #555'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setShowModal(false)}
                            style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                background: '#c44',
                                border: '1px solid #666',
                                color: '#fff',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '18px',
                                fontWeight: 'bold'
                            }}
                        >
                            ✕
                        </button>
                        <div style={{fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#fff'}}>
                            Point Movement (epoch-to-epoch)
                        </div>
                        <canvas
                            ref={(el) => {
                                if (el && showModal) {
                                    // Draw enlarged graph
                                    const ctx = el.getContext('2d');
                                    if (ctx) {
                                        el.width = 1000;
                                        el.height = 400;
                                        drawGraph(el);
                                    }
                                }
                            }}
                            width="1000"
                            height="400"
                            style={{
                                width: '100%',
                                maxWidth: '1000px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.2)'
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

// Distribution Chart Component for Scalar Columns
const DistributionChart: React.FC<{
    distribution: Array<{ bin: number, count: number }>;
    min: number;
    max: number;
    searchValue: number | null;
}> = ({ distribution, min, max, searchValue }) => {
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
            
            ctx.fillStyle = '#64b5f6';
            ctx.fillRect(x, y, barWidth - 1, barHeight);
        });
        
        // Draw search value marker
        if (searchValue !== null && !isNaN(searchValue) && searchValue >= min && searchValue <= max) {
            const normalizedPos = (searchValue - min) / (max - min);
            const x = padding + normalizedPos * chartWidth;
            
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, padding);
            ctx.lineTo(x, padding + chartHeight);
            ctx.stroke();
            
            // Draw marker dot
            ctx.fillStyle = '#ff4444';
            ctx.beginPath();
            ctx.arc(x, padding + chartHeight, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw axis labels
        ctx.fillStyle = '#aaa';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(min.toFixed(2), padding, height - 2);
        ctx.textAlign = 'right';
        ctx.fillText(max.toFixed(2), width - padding, height - 2);
        
        if (searchValue !== null && !isNaN(searchValue) && searchValue >= min && searchValue <= max) {
            const normalizedPos = (searchValue - min) / (max - min);
            const x = padding + normalizedPos * chartWidth;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff4444';
            ctx.fillText(searchValue.toFixed(2), x, padding - 2);
        }
    }, [distribution, min, max, searchValue]);
    
    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ width: '100%', height: `${height}px`, border: '1px solid #666', borderRadius: '3px' }}
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
    containerRef?: React.RefObject<HTMLDivElement>,
    onLoadingProgress?: (loaded: number, total: number) => void,
    pointSize?: number,
    pointAlpha?: number
}> = ({ trainingData, sessionProjections, lossData, onReady, onFrameUpdate, onPointInspected, rotationEnabled = true, containerRef, onLoadingProgress, pointSize = 0.05, pointAlpha = 0.5 }) => {
    const internalContainerRef = useRef<HTMLDivElement>(null);
    const actualContainerRef = containerRef || internalContainerRef;
    const sphereRef = useRef<any>(null);

    useEffect(() => {
        if (!actualContainerRef.current || !trainingData) {
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
            sphereRef.current = initialize_sphere(actualContainerRef.current, recordList, batchSize, onLoadingProgress || undefined);
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
            
            // Set up training movie visual options
            set_animation_options(sphereRef.current, rotationEnabled, 0.02, false, sphereRef.current.jsonData);
            set_visual_options(sphereRef.current, 0.025, 0.9);
            
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
            
            // Start playing the training movie
            play_training_movie(sphereRef.current, 10);
            // Notify parent that sphere is ready
            if (onReady) {
                onReady(sphereRef.current);
            }
        }
    }, [trainingData, sessionProjections, onReady, onLoadingProgress, pointSize, pointAlpha, rotationEnabled]);

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
                // Cleanup resize observer
                if ((sphereRef.current as any).__resizeObserver) {
                    (sphereRef.current as any).__resizeObserver.disconnect();
                }
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
        hasLoggedInit.current = true;
    }
    const [sphereRef, setSphereRef] = useState<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const outerContainerRef = useRef<HTMLDivElement>(null);
    const [frameInfo, setFrameInfo] = useState<{ current: number, total: number, visible: number, epoch?: string, validationLoss?: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(true); // Start playing automatically
    const [frameInput, setFrameInput] = useState<string>('');
    const [showDynamicHulls, setShowDynamicHulls] = useState(false);
    const [trailLength, setTrailLength] = useState(12); // Default 12 epochs
    const [spotlightCluster, setSpotlightCluster] = useState<number>(-1); // -1 = off, 0+ = cluster number
    const [clusterColorMode, setClusterColorMode] = useState<'final' | 'per-epoch'>('final');
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

    // Thumbnail mode - hide all controls when container is small
    // Default to FALSE so sidebar shows immediately, ResizeObserver will hide if needed
    const [isThumbnail, setIsThumbnail] = useState(false);

    // Detect thumbnail mode from OUTER container size
    useEffect(() => {
        if (!outerContainerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            const width = entry.contentRect.width;
            const height = entry.contentRect.height;
            const isThumbnailMode = width < 800 || height < 600;
            console.log('📐 Container size:', width, 'x', height, '→ thumbnail:', isThumbnailMode);
            setIsThumbnail(isThumbnailMode);
        });
        resizeObserver.observe(outerContainerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

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

    // Rotation control state
    const [rotationEnabled, setRotationEnabled] = useState(true); // Default enabled
    
    // Point visual controls - optimized for performance
    const [pointSize, setPointSize] = useState(0.01); // Default point size per spec
    const [pointAlpha, setPointAlpha] = useState(0.50); // 50% alpha
    const [loadingProgress, setLoadingProgress] = useState<{ loaded: number, total: number } | null>(null);
    
    // Movement histogram state
    const [movementData, setMovementData] = useState<Array<{ epoch: string, mean: number, median: number, p90: number, max: number }>>([]);
    const [showMovementPlot, setShowMovementPlot] = useState(true); // Show by default

    // Playback overlay visibility state
    const [overlayVisible, setOverlayVisible] = useState(false);
    const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const overlayInteractingRef = useRef(false);
    const mobileLastTapRef = useRef<number>(0);

    const showOverlay = useCallback(() => {
        setOverlayVisible(true);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        if (!overlayInteractingRef.current) {
            overlayTimerRef.current = setTimeout(() => {
                if (!overlayInteractingRef.current) {
                    setOverlayVisible(false);
                }
            }, 2000);
        }
    }, []);

    // Mobile: Show overlay briefly (3s auto-hide)
    const showOverlayMobile = useCallback(() => {
        setOverlayVisible(true);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => {
            setOverlayVisible(false);
        }, 3000);
    }, []);

    // Mobile: Tap to toggle overlay
    const handleCanvasTap = useCallback(() => {
        const now = Date.now();
        // Debounce rapid taps
        if (now - mobileLastTapRef.current < 300) return;
        mobileLastTapRef.current = now;

        if (overlayVisible) {
            setOverlayVisible(false);
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        } else {
            showOverlayMobile();
        }
    }, [overlayVisible, showOverlayMobile]);

    const handleCanvasMouseMove = useCallback(() => {
        showOverlay();
    }, [showOverlay]);

    const handleCanvasMouseLeave = useCallback(() => {
        if (!overlayInteractingRef.current) {
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => {
                if (!overlayInteractingRef.current) {
                    setOverlayVisible(false);
                }
            }, 500);
        }
    }, []);

    const handleOverlayInteractionStart = useCallback(() => {
        overlayInteractingRef.current = true;
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        setOverlayVisible(true);
    }, []);

    const handleOverlayInteractionEnd = useCallback(() => {
        overlayInteractingRef.current = false;
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => {
            if (!overlayInteractingRef.current) {
                setOverlayVisible(false);
            }
        }, 2000);
    }, []);

    // Search state
    const [columnTypes, setColumnTypes] = useState<any>(null);
    const [selectedSearchColumn, setSelectedSearchColumn] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showSearch, setShowSearch] = useState(false);
    const [showBoundsBox, setShowBoundsBox] = useState(false);
    const [showGreatCircles, setShowGreatCircles] = useState(false);
    const [showModelCard, setShowModelCard] = useState(false);
    
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
                                resume_training_movie(sphereRefForCountdown.current);
                                setIsPlaying(true);
                            } else {
                                // No sphere reference available after countdown
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
                setLoadingStep('Fetching training epochs...');
                setLoadingDetail('');

                // Helper to format bytes
                const formatBytes = (bytes: number) => {
                    if (bytes < 1024) return `${bytes} B`;
                    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                };

                // TRAINING MOVIE: Load from API with retry logic for 504/500 errors
                let apiTrainingData;
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount <= maxRetries) {
                    try {
                        apiTrainingData = await fetch_training_metrics(
                            sessionId,
                            apiBaseUrl,
                            10000,
                            (info) => {
                                if (info.phase === 'downloading') {
                                    const progress = info.totalBytes
                                        ? `${formatBytes(info.bytesLoaded)} / ${formatBytes(info.totalBytes)}`
                                        : `Downloaded ${formatBytes(info.bytesLoaded)}`;
                                    setLoadingDetail(progress);
                                } else if (info.phase === 'parsing') {
                                    setLoadingStep('Parsing epoch data...');
                                    setLoadingDetail(formatBytes(info.bytesLoaded));
                                }
                            }
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
                if (!apiTrainingData) throw new Error('Failed to load training data after retries');

                if (apiTrainingData && apiTrainingData.epoch_projections) {
                    const epochCount = Object.keys(apiTrainingData.epoch_projections).length;
                    const firstEpochKey = Object.keys(apiTrainingData.epoch_projections)[0];
                    const pointCount = apiTrainingData.epoch_projections[firstEpochKey]?.coords?.length || 0;
                    setLoadingStep('Fetching full projections...');
                    setLoadingDetail(`${epochCount} epochs, ${pointCount} points per epoch`);

                    // Try to fetch final projections for cluster results AND full dataset
                    let clusterResults = {};
                    let fullProjectionsCoords: any[] = [];
                    try {
                        const baseUrl = apiBaseUrl || (window.location.hostname === 'localhost'
                            ? window.location.origin + '/proxy/featrix'
                            : 'https://sphere-api.featrix.com');
                        const projectionsResponse = await fetch(`${baseUrl}/compute/session/${sessionId}/projections?limit=10000`);
                        if (projectionsResponse.ok) {
                            const projectionsData = await projectionsResponse.json();
                            if (projectionsData.projections?.entire_cluster_results) {
                                clusterResults = projectionsData.projections.entire_cluster_results;
                                console.log('Found cluster results in final projections:', Object.keys(clusterResults).length, 'cluster counts');
                            }
                            if (projectionsData.projections?.coords) {
                                fullProjectionsCoords = projectionsData.projections.coords;
                            }
                        }
                    } catch (err) {
                        console.error('Error fetching full projections:', err);
                    }

                    setLoadingStep('Processing data...');
                    setLoadingDetail(`${epochCount} epochs, ${pointCount} points` + (fullProjectionsCoords.length > 0 ? `, ${fullProjectionsCoords.length} full projection rows` : ''));

                    setTrainingData(apiTrainingData.epoch_projections);
                    // Use API data for session projections with cluster results AND full dataset coords
                    const usingFullProjections = fullProjectionsCoords.length > 0;
                    const sessionData = {
                        ...apiTrainingData,
                        entire_cluster_results: clusterResults,
                        // CRITICAL: Use full dataset coords if available, otherwise fall back to sampled
                        coords: usingFullProjections ? fullProjectionsCoords : (apiTrainingData.epoch_projections[Object.keys(apiTrainingData.epoch_projections)[0]]?.coords || [])
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
                } else {
                    console.error('No epoch_projections in API response');
                    throw new Error('No training movie data from API');
                }
            } catch (err) {
                console.error('Error loading training movie:', err);
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
                    // Training complete, stop polling
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
                                // Stop current movie
                                stop_training_movie(sphereRef);
                                
                                // Reload training movie with updated data
                                load_training_movie(sphereRef, updatedTrainingData, latestData.training_metrics || lossData, sessionProjections);
                                
                                // Reset to frame 1 and replay
                                goto_training_movie_frame(sphereRef, 1);
                                setIsPlaying(true);
                                play_training_movie(sphereRef);
                                
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
        
        // Check immediately on mount
        checkForNewEpochs();

        return () => {
            clearInterval(pollInterval);
            clearInterval(countdownInterval);
        };
    }, [sessionId, apiBaseUrl, trainingData, sphereRef]);

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

        // Call the unified compute function with all settings
        compute_cluster_convex_hulls(sphereRef);
        update_cluster_spotlight(sphereRef);
        render_sphere(sphereRef);

    }, [showDynamicHulls, trailLength, spotlightCluster, sphereRef]);

    // Sync cluster color mode to sphere
    useEffect(() => {
        if (!sphereRef) return;
        set_cluster_color_mode(sphereRef, clusterColorMode);
    }, [clusterColorMode, sphereRef]);

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

    // Listen for fullscreen changes (user pressing ESC) and resize sphere
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isCurrentlyFullscreen);
            
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
    }, [sphereRef]);
    
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
    
    // Filter record list for search with improved boolean handling
    const filter_record_list = (queryColumnType: any, queryColumn: any, queryValue: any) => {
        if (!sphereRef || !sphereRef.current || !sphereRef.current.pointRecordsByID) {
            return [];
        }
        
        // Normalize the query value for boolean matching
        const normalizedQuery = normalizeBoolean(queryValue);
        const isBooleanQuery = normalizedQuery !== null;
        
        let results: any = [];
        let checked = 0;
        for (const record of sphereRef.current.pointRecordsByID.values()) {
            checked++;
            const columnValue = record.original[queryColumn];
            if (columnValue === undefined) continue;
            
            let matches = false;
            
            if (queryColumnType === 'string') {
                const value = String(columnValue).toLowerCase();
                const query = String(queryValue).toLowerCase();
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
                const value = String(columnValue).toLowerCase();
                const query = String(queryValue).toLowerCase();
                if (isBooleanQuery) {
                    // For boolean-like queries, try to match normalized boolean values
                    const normalizedValue = normalizeBoolean(columnValue);
                    if (normalizedValue !== null && normalizedValue === normalizedQuery) {
                        matches = true;
                    } else if (!normalizedValue) {
                        // Fallback to exact match if value isn't boolean-like
                        matches = value === query;
                    }
                } else {
                    matches = value === query;
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
        vocabulary?: string[]; // For non-scalars
        min?: number;
        max?: number;
        mean?: number;
        median?: number;
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
        if (!sphereRef || !sphereRef.current) {
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
    
    // Handle search input with boolean color coding (live preview)
    const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        setSearchQuery(inputValue);
        
        if (!sphereRef) {
            return;
        }

        if (!columnTypes || !selectedSearchColumn) {
            return;
        }
        
        // If empty, just show color rules
        if (inputValue === "") {
            applyColorRules();
            setSearchResultStats(null);
            return;
        }
        
        // Filter results for preview
        const queryColumnType = columnTypes[selectedSearchColumn];
        const theRecords = filter_record_list(queryColumnType, selectedSearchColumn, inputValue);
        
        // Apply color rules first, then show preview
        applyColorRules();
        
        // Check if this is a boolean query
        const normalizedQuery = normalizeBoolean(inputValue);
        const isBooleanQuery = normalizedQuery !== null;
        
        // Categorize results for boolean columns (preview only)
        if (isBooleanQuery && theRecords.length > 0) {
            let yesCount = 0;
            let noCount = 0;
            let unknownCount = 0;
            
            for (const record of theRecords) {
                const columnValue = record.original[selectedSearchColumn];
                const normalizedValue = normalizeBoolean(columnValue);
                
                if (normalizedValue === null) {
                    unknownCount++;
                } else if (normalizedValue === 'true') {
                    yesCount++;
                } else {
                    noCount++;
                }
            }
            
            setSearchResultStats({
                yes: yesCount,
                no: noCount,
                unknown: unknownCount,
                isBoolean: true
            });
        } else {
            setSearchResultStats({
                yes: 0,
                no: 0,
                unknown: 0,
                isBoolean: false
            });
        }
    };
    
    // Note: Color rules are applied when colorRules.length changes (see above useEffect)
    
    // Fetch vocabulary/distribution when column changes
    useEffect(() => {
        if (!selectedSearchColumn || !sphereRef || !sphereRef.current || !sphereRef.current.pointRecordsByID || !columnTypes) {
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
        for (const record of sphereRef.current.pointRecordsByID.values()) {
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
            
            const min = Math.min(...numericValues);
            const max = Math.max(...numericValues);
            const sorted = [...numericValues].sort((a, b) => a - b);
            const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
            const median = sorted.length % 2 === 0
                ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                : sorted[Math.floor(sorted.length / 2)];
            
            // Create histogram with 20 bins
            const numBins = 20;
            const binWidth = (max - min) / numBins;
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
                min,
                max,
                mean,
                median
            });
        } else {
            // For set/string columns, show vocabulary (unique values)
            const uniqueValues = Array.from(new Set(values.map(v => String(v)))).sort();
            setColumnVocabulary({
                type: colType as 'set' | 'string',
                vocabulary: uniqueValues.slice(0, 100) // Limit to 100 for performance
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
        return (
            <div className="training-progress-display" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: '#2a2a2a',
                color: '#d0d0d0',
                position: 'relative'
            }}>
                <div style={{
                    position: 'absolute',
                    ...(isMobile ? { bottom: '10px', left: '10px' } : { top: '10px', right: '10px' }),
                    fontSize: isMobile ? '10px' : '12px',
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
                        <div style={{ marginBottom: '20px', fontSize: '18px' }}>
                            {retryStatus ? 'Server Unavailable - Retrying...' : 'Loading Training Movie...'}
                        </div>
                        {retryStatus ? (
                            <>
                                <div style={{
                                    fontSize: '48px',
                                    fontWeight: 'bold',
                                    color: '#ff6b6b',
                                    marginBottom: '10px',
                                    fontFamily: 'monospace'
                                }}>
                                    {retryStatus.nextRetryIn}s
                                </div>
                                <div style={{ fontSize: '14px', color: '#ff6b6b', marginBottom: '8px' }}>
                                    {retryStatus.error}
                                </div>
                                <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px' }}>
                                    Attempt {retryStatus.attempt} | Total wait: {Math.floor(retryStatus.totalElapsed / 60)}m {retryStatus.totalElapsed % 60}s
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    border: '3px solid #555',
                                    borderTop: '3px solid #d0d0d0',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    marginBottom: '15px'
                                }}></div>
                                <div style={{ fontSize: '14px', color: '#00ccff', marginBottom: '8px' }}>
                                    {loadingStep}
                                </div>
                                {loadingDetail && (
                                    <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px' }}>
                                        {loadingDetail}
                                    </div>
                                )}
                            </>
                        )}
                        <div style={{ fontSize: '14px', color: '#ccc', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Session: {isMobile && sessionId.length > 20 ? sessionId.slice(0, 8) + '...' + sessionId.slice(-4) : sessionId}</div>
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                            Fetching from {apiBaseUrl || 'default API'}
                        </div>
                    </>
                )}
                {trainingStatus === 'training' && (
                    <>
                        <div style={{ marginBottom: '20px', fontSize: '18px', color: '#64b5f6' }}>
                            Training in progress
                        </div>
                        <div style={{ fontSize: '14px', color: '#b0b0b0', marginBottom: '10px' }}>
                            Will check for new frames in {nextCheckCountdown} seconds
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '5px', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            Session: {isMobile && sessionId.length > 20 ? sessionId.slice(0, 8) + '...' + sessionId.slice(-4) : sessionId}
                        </div>
                    </>
                )}
                {trainingStatus === 'completed' && (
                    <>
                        <div style={{ marginBottom: '20px', fontSize: '18px', color: '#64b5f6' }}>
                            Training Completed
                        </div>
                        <div style={{ fontSize: '14px', color: '#ccc', marginBottom: '10px' }}>
                            All epochs loaded
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '5px', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
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
                                    color: '#ff6b6b',
                                    marginBottom: '10px',
                                    fontFamily: 'monospace'
                                }}>
                                    {retryStatus.nextRetryIn}s
                                </div>
                                <div style={{ fontSize: '14px', color: '#ff6b6b', marginBottom: '8px' }}>
                                    {retryStatus.error}
                                </div>
                                <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px' }}>
                                    Attempt {retryStatus.attempt} | Total wait: {Math.floor(retryStatus.totalElapsed / 60)}m {retryStatus.totalElapsed % 60}s
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    border: '3px solid #555',
                                    borderTop: '3px solid #d0d0d0',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    marginBottom: '15px'
                                }}></div>
                                <div style={{ fontSize: '14px', color: '#00ccff', marginBottom: '8px' }}>
                                    {loadingStep}
                                </div>
                                {loadingDetail && (
                                    <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px' }}>
                                        {loadingDetail}
                                    </div>
                                )}
                            </>
                        )}
                        <div style={{ fontSize: '14px', color: '#ccc', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Session: {isMobile && sessionId.length > 20 ? sessionId.slice(0, 8) + '...' + sessionId.slice(-4) : sessionId}</div>
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
                height: '100vh',
                background: '#2a2a2a',
                color: '#ff4444',
                position: 'relative'
            }}>
                <div style={{
                    position: 'absolute',
                    ...(isMobile ? { bottom: '10px', left: '10px' } : { top: '10px', right: '10px' }),
                    fontSize: isMobile ? '10px' : '12px',
                    color: '#ff6b6b',
                    fontFamily: 'monospace',
                    background: 'rgba(255, 107, 107, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '4px'
                }}>
                    Build: {BUILD_TIMESTAMP.slice(0, 16)}
                </div>
                <div style={{ fontSize: '18px', marginBottom: '10px' }}>Error loading training movie</div>
                <div style={{ fontSize: '14px', marginTop: '10px', textAlign: 'center', maxWidth: '80vw', wordBreak: 'break-word' as const }}>{error}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
                    Failed during: {loadingStep}
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '5px', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    Session: {isMobile && sessionId.length > 20 ? sessionId.slice(0, 8) + '...' + sessionId.slice(-4) : sessionId} | API: {apiBaseUrl || 'default'}
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
                background: '#2a2a2a',
                color: '#d0d0d0'
            }}>
                No training movie data available
            </div>
        );
    }

    return (
        <div ref={outerContainerRef} className="training-progress-display" style={{
            display: 'grid',
            gridTemplateRows: isThumbnail ? '1fr' : '44px 1fr',
            gridTemplateColumns: isThumbnail || isMobile ? '1fr' : (isWideScreen ? '400px 1fr' : '360px 1fr'),
            width: '100%',
            height: '100vh',
            background: '#1e1e1e',
            color: '#e0e0e0',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            {/* Top Control Strip - spans full width */}
            {!isThumbnail && (
            <div style={{
                gridColumn: '1 / -1',
                height: '44px',
                background: '#141414',
                borderBottom: '1px solid #2a2a2a',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
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
                                background: '#222222',
                                border: '1px solid #2a2a2a',
                                color: '#b0b0b0',
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
                        color: '#b0b0b0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {isMobile && sessionId.length > 20 ? sessionId.slice(0, 12) + '...' : sessionId}
                    </span>
                </div>

                {/* Center: Frame X/Y and status */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                }}>
                    {frameInfo && !isMobile && (
                        <span style={{ fontSize: '12px', color: '#e0e0e0' }}>
                            Frame {frameInfo.current} / {frameInfo.total}
                            {frameInfo.epoch && (
                                <span style={{ color: '#b0b0b0', marginLeft: '8px' }}>
                                    (Epoch {frameInfo.epoch.toString().replace('epoch_', '')})
                                </span>
                            )}
                        </span>
                    )}
                    {frameInfo && isMobile && (
                        <span style={{ fontSize: '11px', color: '#e0e0e0' }}>
                            {frameInfo.current}/{frameInfo.total}
                        </span>
                    )}
                    {trainingStatus === 'training' && (
                        <span style={{ fontSize: '11px', color: '#64b5f6' }}>In Progress</span>
                    )}
                    {trainingStatus === 'completed' && !isMobile && (
                        <span style={{ fontSize: '11px', color: '#b0b0b0' }}>Completed</span>
                    )}
                </div>

                {/* Right: Play/Pause (mobile) + Rotate toggle */}
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                    {/* Mobile: Playback play/pause always visible */}
                    {isMobile && (
                        <button
                            onClick={() => {
                                if (isPlaying) {
                                    pause_training_movie(sphereRef);
                                    setIsPlaying(false);
                                } else {
                                    resume_training_movie(sphereRef);
                                    setIsPlaying(true);
                                }
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: isPlaying ? '#64b5f6' : '#b0b0b0',
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
                    <button
                        onClick={() => setRotationEnabled(!rotationEnabled)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: rotationEnabled ? '#64b5f6' : '#b0b0b0',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title={rotationEnabled ? "Pause Rotation" : "Resume Rotation"}
                    >
                        {rotationEnabled ? '\u21BB' : '\u21BA'}
                    </button>
                </div>
            </div>
            )}

            {/* Left Sidebar - Desktop */}
            {!isMobile && !isThumbnail && (
            <div style={{
                width: isWideScreen ? '400px' : '360px',
                background: '#181818',
                borderRight: '1px solid #2a2a2a',
                padding: 0,
                overflowY: 'auto',
                fontSize: '12px',
            }}>
                {/* Header Bar - Always visible with current epoch */}
                <div style={{
                    padding: '12px 16px',
                    background: '#1a1a1a',
                    borderBottom: '1px solid #2a2a2a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {frameInfo && (
                            <>
                                <span style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#e0e0e0',
                                }}>
                                    Epoch {frameInfo.epoch?.toLocaleString() ?? '—'}
                                </span>
                                <span style={{
                                    fontSize: '11px',
                                    color: '#8a8a8a',
                                }}>
                                    Frame {frameInfo.current} / {frameInfo.total}
                                </span>
                            </>
                        )}
                        {!frameInfo && (
                            <span style={{ fontSize: '12px', color: '#8a8a8a' }}>Loading...</span>
                        )}
                    </div>
                </div>

                {/* Panel 1: CLUSTER CONTROLS */}
                <CollapsibleSection title="CLUSTER CONTROLS" defaultOpen={false}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* Cluster Coloring dropdown */}
                        <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Cluster Coloring</span>
                            <select
                                value={clusterColorMode}
                                onChange={(e) => setClusterColorMode(e.target.value as 'final' | 'per-epoch')}
                                style={{
                                    fontSize: '12px',
                                    padding: '4px 8px',
                                    backgroundColor: '#202020',
                                    color: '#e0e0e0',
                                    border: '1px solid #2a2a2a',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    width: '140px',
                                }}
                            >
                                <option value="final">Final Frame</option>
                                <option value="per-epoch">Per-Epoch</option>
                            </select>
                        </label>

                        {/* Focus Cluster dropdown */}
                        {frameInfo && (
                            <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Focus Cluster</span>
                                <select
                                    value={spotlightCluster}
                                    onChange={(e) => {
                                        const cluster = parseInt(e.target.value);
                                        setSpotlightCluster(cluster);
                                        if (sphereRef) {
                                            sphereRef.spotlightCluster = cluster;
                                            update_cluster_spotlight(sphereRef);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{
                                        fontSize: '12px',
                                        padding: '4px 8px',
                                        backgroundColor: '#202020',
                                        color: '#e0e0e0',
                                        border: '1px solid #2a2a2a',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        width: '140px',
                                    }}
                                >
                                    <option value={-1}>None</option>
                                    {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => (
                                        <option key={i} value={i}>Cluster {i}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {/* Show Cluster Spheres checkbox */}
                        {frameInfo && (
                            <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={showDynamicHulls}
                                    onChange={(e) => setShowDynamicHulls(e.target.checked)}
                                    disabled={frameInfo.visible < 4}
                                    style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: '#64b5f6' }}
                                />
                                <span style={{ color: frameInfo.visible >= 4 ? '#b0b0b0' : '#555' }}>Show Cluster Spheres</span>
                            </label>
                        )}

                        {/* Cluster color swatches (if showColorLegend) */}
                        {showColorLegend && frameInfo && frameInfo.visible > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginBottom: '6px' }}>Cluster Colors</div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {Array.from({length: frameInfo.visible}, (_, i) => {
                                        const kColorTable = [0x4C78A8, 0x72B7B2, 0xF58518, 0xE45756, 0x54A24B, 0xB279A2, 0xFF9DA6, 0x9D755D, 0xBAB0AC, 0x79706E, 0xD37295, 0x8F6D31];
                                        const defaultColorHex = kColorTable[i] || 0x999999;
                                        const customColorHex = sphereRef?.customClusterColors?.get(i);
                                        const colorHex = customColorHex || defaultColorHex;
                                        const color = '#' + colorHex.toString(16).padStart(6, '0');
                                        return (
                                            <div key={`cluster-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                <span style={{ fontSize: '10px', color: '#b0b0b0' }}>C{i}</span>
                                                <input
                                                    type="color"
                                                    value={color}
                                                    onChange={(e) => {
                                                        if (sphereRef && sphereRef.current) {
                                                            const newColor = e.target.value;
                                                            set_cluster_color(sphereRef.current, i, newColor);
                                                            render_sphere(sphereRef.current);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '24px',
                                                        height: '24px',
                                                        border: '1px solid #2a2a2a',
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
                                        if (sphereRef && sphereRef.current) {
                                            clear_cluster_colors(sphereRef.current);
                                            render_sphere(sphereRef.current);
                                        }
                                    }}
                                    style={{
                                        marginTop: '8px',
                                        width: '100%',
                                        background: '#2a2a2a',
                                        border: 'none',
                                        color: '#b0b0b0',
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
                            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #2a2a2a' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginTop: '14px', marginBottom: '6px' }}>Cluster Inspector</div>
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
                                        return <div style={{ fontSize: '12px', color: '#b0b0b0' }}>No cluster data ({totalPoints} points)</div>;
                                    }

                                    return (
                                        <div style={{ fontSize: '11px', fontFamily: 'monospace', maxHeight: '120px', overflowY: 'auto' }}>
                                            {Array.from(clusterCounts.entries()).sort((a, b) => a[0] - b[0]).map(([cluster, count]) => (
                                                <div key={cluster} style={{ marginBottom: '2px', color: '#b0b0b0' }}>
                                                    C{cluster}: {count} points
                                                </div>
                                            ))}
                                            {pointsWithoutCluster > 0 && (
                                                <div style={{ marginTop: '4px', color: '#b0b0b0' }}>{pointsWithoutCluster} unassigned</div>
                                            )}
                                        </div>
                                    );
                                })()}
                                {selectedPointInfo && (
                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #2a2a2a', fontSize: '11px' }}>
                                        <div style={{ color: '#e0e0e0', fontWeight: 'bold', marginBottom: '4px' }}>Selected Point</div>
                                        <div style={{ color: '#b0b0b0' }}>Row: {selectedPointInfo.rowOffset}</div>
                                        <div style={{ color: '#b0b0b0' }}>Cluster: {selectedPointInfo.clusterId}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </CollapsibleSection>

                {/* Panel 2: MODEL INFO (default CLOSED) */}
                <CollapsibleSection title="MODEL INFO" defaultOpen={false}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* Training status text */}
                        <div style={{ fontSize: '12px', color: '#b0b0b0' }}>
                            {trainingStatus === 'training' && (
                                <span style={{ color: '#64b5f6' }}>Training in progress</span>
                            )}
                            {trainingStatus === 'completed' && (
                                <span>Training completed</span>
                            )}
                            {!trainingStatus && <span>Status unknown</span>}
                        </div>

                        {/* Frame X/Y count */}
                        {frameInfo && (
                            <div style={{ fontSize: '12px', color: '#b0b0b0' }}>
                                Frame {frameInfo.current} / {frameInfo.total}
                            </div>
                        )}

                        {/* Validation Loss chart */}
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
                                    <LossPlotOverlay
                                        lossData={validationLossData}
                                        learningRateData={learningRateData && learningRateData.length > 0 ? learningRateData : undefined}
                                        currentEpoch={frameInfo?.epoch}
                                        title="Validation Loss"
                                        style={{ width: '100%', height: '100px', pointerEvents: 'none' }}
                                    />
                                </div>
                            );
                        })()}

                        {/* Point Movement chart */}
                        {movementData.length > 0 && (
                            <div>
                                <MovementPlotOverlay
                                    movementData={movementData}
                                    currentEpoch={frameInfo?.epoch}
                                    style={{ width: '100%', height: '100px', pointerEvents: 'none' }}
                                />
                            </div>
                        )}

                        {/* View Model Card button */}
                        <button
                            onClick={() => setShowModelCard(true)}
                            style={{
                                marginTop: '8px',
                                background: '#222222',
                                border: '1px solid #2a2a2a',
                                color: '#b0b0b0',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                width: '100%',
                            }}
                        >
                            View Model Card
                        </button>
                    </div>
                </CollapsibleSection>

                {/* Panel 3: SEARCH (default CLOSED) */}
                <CollapsibleSection title="SEARCH" defaultOpen={false}>
                    {columnTypes && Object.keys(columnTypes).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Column selector */}
                            <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Column</span>
                                <select
                                    value={selectedSearchColumn}
                                    onChange={(e) => setSelectedSearchColumn(e.target.value)}
                                    style={{
                                        fontSize: '12px',
                                        padding: '4px 8px',
                                        backgroundColor: '#202020',
                                        color: '#e0e0e0',
                                        border: '1px solid #2a2a2a',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        width: '160px',
                                    }}
                                >
                                    {Object.keys(columnTypes).map((col) => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            </label>

                            {/* Search input */}
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={handleSearchInput}
                                    onKeyDown={handleSearchKeyDown}
                                    placeholder="Search..."
                                    style={{
                                        flex: 1,
                                        background: '#2a2a2a',
                                        border: '1px solid #2a2a2a',
                                        color: '#e0e0e0',
                                        padding: '6px 10px',
                                        borderRadius: '3px',
                                        fontSize: '12px',
                                    }}
                                />
                                <button
                                    onClick={handleSearchSubmit}
                                    disabled={!searchQuery.trim()}
                                    style={{
                                        background: searchQuery.trim() ? '#64b5f6' : '#2a2a2a',
                                        border: 'none',
                                        color: searchQuery.trim() ? '#141414' : '#b0b0b0',
                                        padding: '6px 12px',
                                        borderRadius: '3px',
                                        cursor: searchQuery.trim() ? 'pointer' : 'not-allowed',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
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
                                            background: '#2a2a2a',
                                            border: 'none',
                                            color: '#b0b0b0',
                                            padding: '6px 8px',
                                            borderRadius: '3px',
                                            cursor: 'pointer',
                                            fontSize: '11px',
                                        }}
                                    >
                                        X
                                    </button>
                                )}
                            </div>

                            {/* Color Rules */}
                            {colorRules.length > 0 && (
                                <div style={{ marginTop: '8px' }}>
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginBottom: '6px' }}>
                                        Color Rules ({colorRules.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                                        {colorRules.map((rule) => (
                                            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px', background: '#181818', borderRadius: '3px' }}>
                                                <div style={{ width: '14px', height: '14px', background: rule.color, borderRadius: '2px', flexShrink: 0 }} />
                                                <div style={{ flex: 1, fontSize: '11px', color: '#b0b0b0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {rule.column}: {rule.query} ({rule.recordIds.length})
                                                </div>
                                                <button
                                                    onClick={() => setColorRules(prev => prev.filter(r => r.id !== rule.id))}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#b0b0b0',
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
                                            background: '#2a2a2a',
                                            border: 'none',
                                            color: '#b0b0b0',
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

                            {/* Column vocabulary for quick selection */}
                            {columnVocabulary && columnVocabulary.type !== 'scalar' && columnVocabulary.vocabulary && (
                                <div style={{ marginTop: '4px' }}>
                                    <div style={{ fontSize: '11px', color: '#b0b0b0', marginBottom: '4px' }}>Values:</div>
                                    <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {columnVocabulary.vocabulary.slice(0, 20).map((val, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setSearchQuery(val);
                                                    const fakeEvent = { target: { value: val } } as React.ChangeEvent<HTMLInputElement>;
                                                    handleSearchInput(fakeEvent);
                                                }}
                                                style={{
                                                    background: '#222222',
                                                    border: searchQuery === val ? '1px solid #64b5f6' : '1px solid #2a2a2a',
                                                    color: searchQuery === val ? '#64b5f6' : '#b0b0b0',
                                                    padding: '2px 6px',
                                                    borderRadius: '3px',
                                                    cursor: 'pointer',
                                                    fontSize: '10px',
                                                }}
                                            >
                                                {val.length > 15 ? val.substring(0, 15) + '...' : val}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Distribution chart for scalar columns */}
                            {columnVocabulary && columnVocabulary.type === 'scalar' && columnVocabulary.distribution && (
                                <div style={{ marginTop: '4px' }}>
                                    <DistributionChart
                                        distribution={columnVocabulary.distribution}
                                        min={columnVocabulary.min || 0}
                                        max={columnVocabulary.max || 0}
                                        searchValue={searchQuery ? parseFloat(searchQuery) : null}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ fontSize: '12px', color: '#b0b0b0' }}>No searchable columns</div>
                    )}
                </CollapsibleSection>

                {/* Panel 4: SETTINGS */}
                <CollapsibleSection title="SETTINGS" defaultOpen={false}>
                    {/* Rendering group - first subgroup gets less top margin */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginTop: '0', marginBottom: '6px' }}>Rendering</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Point Size</span>
                                <select
                                    value={pointSize}
                                    onChange={(e) => {
                                        const newSize = parseFloat(e.target.value);
                                        setPointSize(newSize);
                                        if (sphereRef) {
                                            set_visual_options(sphereRef, newSize, pointAlpha);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{
                                        fontSize: '12px',
                                        padding: '4px 8px',
                                        backgroundColor: '#202020',
                                        color: '#e0e0e0',
                                        border: '1px solid #2a2a2a',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        width: '100px',
                                    }}
                                >
                                    <option value={0.01}>0.01</option>
                                    <option value={0.02}>0.02</option>
                                    <option value={0.04}>0.04</option>
                                    <option value={0.06}>0.06</option>
                                    <option value={0.08}>0.08</option>
                                    <option value={0.10}>0.10</option>
                                    <option value={0.15}>0.15</option>
                                </select>
                            </label>
                            <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                                    style={{
                                        fontSize: '12px',
                                        padding: '4px 8px',
                                        backgroundColor: '#202020',
                                        color: '#e0e0e0',
                                        border: '1px solid #2a2a2a',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        width: '100px',
                                    }}
                                >
                                    <option value={0.25}>25%</option>
                                    <option value={0.50}>50%</option>
                                    <option value={0.75}>75%</option>
                                    <option value={1.00}>100%</option>
                                </select>
                            </label>
                            <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Trail Length</span>
                                <select
                                    value={trailLength}
                                    onChange={(e) => setTrailLength(parseInt(e.target.value))}
                                    style={{
                                        fontSize: '12px',
                                        padding: '4px 8px',
                                        backgroundColor: '#202020',
                                        color: '#e0e0e0',
                                        border: '1px solid #2a2a2a',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        width: '100px',
                                    }}
                                >
                                    <option value={2}>2 frames</option>
                                    <option value={5}>5 frames</option>
                                    <option value={8}>8 frames</option>
                                    <option value={10}>10 frames</option>
                                    <option value={15}>15 frames</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    {/* Geometry Overlays group - subsequent subgroup gets more top margin */}
                    <div>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginTop: '14px', marginBottom: '6px' }}>Geometry Overlays</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', gap: '6px', marginLeft: '4px' }}>
                                <button
                                    onClick={() => {
                                        setShowBoundsBox(!showBoundsBox);
                                        if (sphereRef) {
                                            toggle_bounds_box(sphereRef, !showBoundsBox);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        background: '#222222',
                                        border: showBoundsBox ? '1px solid #64b5f6' : '1px solid #2a2a2a',
                                        color: showBoundsBox ? '#64b5f6' : '#b0b0b0',
                                        padding: '8px 12px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                    }}
                                >
                                    Bounds
                                </button>
                                <button
                                    onClick={() => {
                                        if (sphereRef) {
                                            toggle_embedding_hull(sphereRef, !sphereRef.showEmbeddingHull);
                                            render_sphere(sphereRef);
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        background: '#222222',
                                        border: sphereRef?.showEmbeddingHull ? '1px solid #64b5f6' : '1px solid #2a2a2a',
                                        color: sphereRef?.showEmbeddingHull ? '#64b5f6' : '#b0b0b0',
                                        padding: '8px 12px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                    }}
                                >
                                    Hull
                                </button>
                            </div>

                            {/* Show Great Circles checkbox (only when bounds is shown) */}
                            {showBoundsBox && (
                                <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
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
                                        style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: '#64b5f6' }}
                                    />
                                    <span>Show Great Circles</span>
                                </label>
                            )}

                            {/* Sphere Coverage display (only when bounds is shown) */}
                            {showBoundsBox && sphereRef && sphereRef.boundsBoxVolumeUtilization !== undefined && (
                                <div style={{ fontSize: '12px', color: '#b0b0b0', padding: '8px', background: '#181818', borderRadius: '4px' }}>
                                    Sphere Coverage: <span style={{ color: '#e0e0e0' }}>{sphereRef.boundsBoxVolumeUtilization.toFixed(2)}%</span>
                                </div>
                            )}
                        </div>
                    </div>
                </CollapsibleSection>
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
                            background: 'rgba(0, 0, 0, 0.6)',
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
                    background: '#181818',
                    borderRight: '1px solid #2a2a2a',
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
                        background: '#141414',
                        borderBottom: '1px solid #2a2a2a',
                        flexShrink: 0,
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {frameInfo ? (
                                <>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#e0e0e0' }}>
                                        Epoch {frameInfo.epoch?.toLocaleString() ?? '—'}
                                    </span>
                                    <span style={{ fontSize: '10px', color: '#8a8a8a' }}>
                                        Frame {frameInfo.current} / {frameInfo.total}
                                    </span>
                                </>
                            ) : (
                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>Controls</span>
                            )}
                        </div>
                        <button
                            onClick={() => setShowMobilePanel(false)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#b0b0b0',
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
                        {/* Panel 1: CLUSTER CONTROLS */}
                        <CollapsibleSection title="CLUSTER CONTROLS" defaultOpen={false}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>Cluster Coloring</span>
                                    <select
                                        value={clusterColorMode}
                                        onChange={(e) => setClusterColorMode(e.target.value as 'final' | 'per-epoch')}
                                        style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#202020', color: '#e0e0e0', border: '1px solid #2a2a2a', borderRadius: '3px', cursor: 'pointer', width: '120px' }}
                                    >
                                        <option value="final">Final Frame</option>
                                        <option value="per-epoch">Per-Epoch</option>
                                    </select>
                                </label>
                                {frameInfo && (
                                    <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>Focus Cluster</span>
                                        <select
                                            value={spotlightCluster}
                                            onChange={(e) => {
                                                const cluster = parseInt(e.target.value);
                                                setSpotlightCluster(cluster);
                                                if (sphereRef) {
                                                    sphereRef.spotlightCluster = cluster;
                                                    update_cluster_spotlight(sphereRef);
                                                    render_sphere(sphereRef);
                                                }
                                            }}
                                            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#202020', color: '#e0e0e0', border: '1px solid #2a2a2a', borderRadius: '3px', cursor: 'pointer', width: '120px' }}
                                        >
                                            <option value={-1}>None</option>
                                            {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => (
                                                <option key={i} value={i}>Cluster {i}</option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            </div>
                        </CollapsibleSection>

                        {/* Panel 2: SETTINGS */}
                        <CollapsibleSection title="SETTINGS" defaultOpen={false}>
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginTop: '0', marginBottom: '6px' }}>Rendering</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>Point Size</span>
                                        <select
                                            value={pointSize}
                                            onChange={(e) => {
                                                const newSize = parseFloat(e.target.value);
                                                setPointSize(newSize);
                                                if (sphereRef) {
                                                    set_visual_options(sphereRef, newSize, pointAlpha);
                                                    render_sphere(sphereRef);
                                                }
                                            }}
                                            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#202020', color: '#e0e0e0', border: '1px solid #2a2a2a', borderRadius: '3px', cursor: 'pointer', width: '80px' }}
                                        >
                                            <option value={0.01}>0.01</option>
                                            <option value={0.02}>0.02</option>
                                            <option value={0.04}>0.04</option>
                                            <option value={0.06}>0.06</option>
                                        </select>
                                    </label>
                                    <label style={{ color: '#b0b0b0', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                                            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#202020', color: '#e0e0e0', border: '1px solid #2a2a2a', borderRadius: '3px', cursor: 'pointer', width: '80px' }}
                                        >
                                            <option value={0.25}>25%</option>
                                            <option value={0.50}>50%</option>
                                            <option value={0.75}>75%</option>
                                            <option value={1.00}>100%</option>
                                        </select>
                                    </label>
                                </div>
                            </div>
                        </CollapsibleSection>
                    </div>
                </div>
            </>
            )}

            {/* Sphere Container - fills remaining space */}
            <div style={{
                position: 'relative',
                background: '#232323',
                minHeight: 0,
                overflow: 'hidden',
            }}>
                {/* Countdown Overlay - only temporary, positioned over sphere */}
                {showCountdown && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(20, 20, 20, 0.95)',
                        color: '#e0e0e0',
                        padding: '30px 50px',
                        borderRadius: '12px',
                        fontSize: '32px',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                        border: '2px solid #64b5f6',
                        textAlign: 'center',
                        boxShadow: '0 0 30px rgba(100, 181, 246, 0.3)',
                        zIndex: 2000,
                        pointerEvents: 'none'
                    }}>
                        {countdownText}
                    </div>
                )}
                
                {/* Gesture hints overlay for mobile */}
                {showGestureHints && isMobile && !isThumbnail && (
                    <div
                        onClick={() => setShowGestureHints(false)}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.6)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '28px',
                            zIndex: 1500,
                            color: '#fff',
                            fontFamily: 'system-ui, sans-serif',
                            fontSize: '16px',
                        }}
                    >
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', marginBottom: '4px' }}>&#9757; Drag</div>
                            <div style={{ color: '#aaa' }}>Rotate sphere</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', marginBottom: '4px' }}>&#128076; Pinch</div>
                            <div style={{ color: '#aaa' }}>Zoom in / out</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', marginBottom: '4px' }}>&#128073; Tap</div>
                            <div style={{ color: '#aaa' }}>Select point</div>
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
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
                        display: 'flex',
                        alignItems: 'stretch',
                        justifyContent: 'stretch'
                    }}
                >
                    <div 
                        ref={containerRef} 
                        style={{ 
                            width: '100%', 
                            height: '100%',
                            minWidth: '100%',
                            minHeight: '100%',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            background: 'transparent',
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                            flex: '1 1 100%'
                        }}
                    />
                {trainingData ? (
                    <TrainingMovieSphere
                        onLoadingProgress={(loaded, total) => setLoadingProgress({ loaded, total })}
                        pointSize={pointSize}
                        pointAlpha={pointAlpha}
                        trainingData={trainingData}
                        sessionProjections={sessionProjections}
                        lossData={lossData}
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
                            
                            // Start with paused state for countdown
                            setIsPlaying(false);
                            
                            // Pause the sphere initially
                            if (sphere) {
                                pause_training_movie(sphere);
                            }
                            
                            
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
                        background: '#2a2a2a'
                    }}>
                        Initializing 3D sphere...
                    </div>
                )}

                {/* Playback Overlay - YouTube/QuickTime style floating controls */}
                {/* Hide on mobile when drawer is open */}
                {frameInfo && frameInfo.total > 0 && !(isMobile && showMobilePanel) && (
                    <div
                        onMouseEnter={!isMobile ? handleOverlayInteractionStart : undefined}
                        onMouseLeave={!isMobile ? handleOverlayInteractionEnd : undefined}
                        onTouchStart={isMobile ? handleOverlayInteractionStart : undefined}
                        onTouchEnd={isMobile ? handleOverlayInteractionEnd : undefined}
                        style={{
                            position: 'absolute',
                            bottom: isMobile ? 'calc(24px + env(safe-area-inset-bottom, 0px))' : '24px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 100,
                            opacity: overlayVisible ? 1 : 0,
                            pointerEvents: overlayVisible ? 'auto' : 'none',
                            transition: 'opacity 200ms ease',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '6px',
                            width: isMobile ? 'calc(100% - 32px)' : 'min(90%, 600px)',
                            maxWidth: '600px',
                            background: 'rgba(0, 0, 0, 0.55)',
                            backdropFilter: 'blur(8px)',
                            borderRadius: '10px',
                            padding: '12px 16px 8px',
                        }}
                    >
                        {/* Scrub slider */}
                        <div
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                            onWheel={(e) => {
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
                            <input
                                type="range"
                                min="1"
                                max={frameInfo.total}
                                value={frameInfo.current}
                                onChange={handleScrub}
                                style={{
                                    flex: 1,
                                    cursor: 'pointer',
                                    height: '4px',
                                    accentColor: '#00ccff',
                                }}
                            />
                        </div>

                        {/* Transport buttons + frame counter */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}
                        >
                            <button onClick={() => { if (sphereRef) { goto_training_movie_frame(sphereRef, 1); setIsPlaying(false); setFrameInput('1'); } }} style={{ background: 'none', border: 'none', color: '#d0d0d0', fontSize: '16px', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }} title="First Frame">⏮</button>
                            <button onClick={handleStepBackward} style={{ background: 'none', border: 'none', color: '#d0d0d0', fontSize: '16px', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }} title="Previous Frame">⏪</button>
                            <button onClick={handlePlayPause} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '20px', cursor: 'pointer', padding: '4px 10px', lineHeight: 1 }} title={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? '⏸' : '▶'}</button>
                            <button onClick={handleStepForward} style={{ background: 'none', border: 'none', color: '#d0d0d0', fontSize: '16px', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }} title="Next Frame">⏩</button>
                            <button onClick={() => { if (sphereRef && frameInfo) { goto_training_movie_frame(sphereRef, frameInfo.total); setIsPlaying(false); setFrameInput(frameInfo.total.toString()); } }} style={{ background: 'none', border: 'none', color: '#d0d0d0', fontSize: '16px', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }} title="Last Frame">⏭</button>
                            <span style={{ color: '#b0b0b0', fontSize: '12px', marginLeft: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap' as const }}>
                                {frameInfo.current}/{frameInfo.total}{frameInfo.epoch ? ` E${frameInfo.epoch.toString().replace('epoch_', '')}` : ''}
                            </span>
                        </div>
                    </div>
                )}
                </div>
            </div>

            {/* Floating Data Inspector */}
            {showDataInspector && selectedPoints.length > 0 && !isThumbnail && (
                <div
                    style={{
                        position: 'fixed',
                        left: `${inspectorPosition.x}px`,
                        top: `${inspectorPosition.y}px`,
                        background: 'rgba(20, 20, 20, 0.95)',
                        border: '2px solid #4c4',
                        borderRadius: '8px',
                        padding: '12px',
                        minWidth: '400px',
                        maxWidth: '800px',
                        maxHeight: '80vh',
                        zIndex: 20000,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
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
                            borderBottom: '1px solid #444',
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
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={hideNulls}
                                    onChange={(e) => setHideNulls(e.target.checked)}
                                />
                                Hide nulls
                            </label>
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
                                    background: '#555',
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

                    {/* Data table */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '12px',
                            fontFamily: 'monospace'
                        }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#1a1a1a', zIndex: 1 }}>
                                <tr>
                                    <th style={{
                                        padding: '6px 8px',
                                        textAlign: 'left',
                                        borderBottom: '2px solid #444',
                                        color: '#4cf',
                                        fontWeight: 'bold'
                                    }}>Field</th>
                                    {selectedPoints.map((point, idx) => (
                                        <th key={point.recordId} style={{
                                            padding: '6px 8px',
                                            textAlign: 'left',
                                            borderBottom: '2px solid #444',
                                            borderLeft: '1px solid #333',
                                            color: point.color || '#ff4',
                                            fontWeight: 'bold',
                                            minWidth: '120px'
                                        }}>
                                            <div>Point {idx + 1}</div>
                                            <div style={{ fontSize: '10px', color: '#888' }}>Row {point.rowOffset}</div>
                                            <div style={{ fontSize: '10px', color: '#888' }}>Cluster {point.clusterId}</div>
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

                                    const sortedFields = Array.from(allFields).sort();

                                    return sortedFields.map(field => {
                                        // Check if all values are null
                                        const allNull = selectedPoints.every(point => {
                                            const val = point.data?.[field];
                                            return val === null || val === undefined || val === '';
                                        });

                                        // Skip if hiding nulls and all values are null
                                        if (hideNulls && allNull) return null;

                                        return (
                                            <tr key={field} style={{ borderBottom: '1px solid #333' }}>
                                                <td style={{
                                                    padding: '6px 8px',
                                                    color: '#888',
                                                    fontWeight: 'bold',
                                                    verticalAlign: 'top'
                                                }}>{field}</td>
                                                {selectedPoints.map(point => {
                                                    const value = point.data?.[field];
                                                    const displayValue = value === null || value === undefined ? 'null' : String(value);
                                                    const isNull = value === null || value === undefined;

                                                    return (
                                                        <td key={point.recordId} style={{
                                                            padding: '6px 8px',
                                                            color: isNull ? '#666' : '#ddd',
                                                            borderLeft: '1px solid #333',
                                                            verticalAlign: 'top',
                                                            wordBreak: 'break-word'
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
                            background: 'rgba(0, 0, 0, 0.7)',
                            zIndex: 10000,
                        }}
                    />
                    {/* Modal Dialog */}
                    <div style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: '#1e1e1e',
                        border: '1px solid #2a2a2a',
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
                            borderBottom: '1px solid #2a2a2a',
                            background: '#181818',
                        }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#e0e0e0' }}>Model Card</span>
                            <button
                                onClick={() => setShowModelCard(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#b0b0b0',
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
                            {/* Placeholder for ModelCard component */}
                            <div style={{ color: '#b0b0b0', fontSize: '14px' }}>
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginBottom: '6px' }}>Session ID</div>
                                    <div style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>{sessionId}</div>
                                </div>
                                {frameInfo && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginBottom: '6px' }}>Training Progress</div>
                                        <div style={{ color: '#e0e0e0' }}>{frameInfo.total} epochs completed</div>
                                    </div>
                                )}
                                {trainingStatus && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginBottom: '6px' }}>Status</div>
                                        <div style={{ color: trainingStatus === 'completed' ? '#64b5f6' : '#e0e0e0' }}>
                                            {trainingStatus === 'completed' ? 'Training Complete' : 'Training In Progress'}
                                        </div>
                                    </div>
                                )}
                                {sphereRef?.recordList && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginBottom: '6px' }}>Data Points</div>
                                        <div style={{ color: '#e0e0e0' }}>{sphereRef.recordList.length} points</div>
                                    </div>
                                )}
                                {frameInfo && frameInfo.visible > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginBottom: '6px' }}>Clusters</div>
                                        <div style={{ color: '#e0e0e0' }}>{frameInfo.visible} clusters identified</div>
                                    </div>
                                )}
                                {lossData?.training_info?.model_parameters !== undefined && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8a8a', marginBottom: '6px' }}>Model Parameters</div>
                                        <div style={{ color: '#e0e0e0' }}>{lossData.training_info.model_parameters.toLocaleString()}</div>
                                    </div>
                                )}
                            </div>
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