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
import { SphereRecord, SphereRecordIndex, remap_cluster_assignments, render_sphere, initialize_sphere, set_animation_options, set_visual_options, load_training_movie, play_training_movie, stop_training_movie, pause_training_movie, resume_training_movie, step_training_movie_frame, goto_training_movie_frame, compute_cluster_convex_hulls, update_cluster_spotlight, show_search_results, clear_colors, toggle_bounds_box, add_selected_record, change_object_color, clear_selected_objects, set_cluster_color, clear_cluster_colors, change_cluster_count, get_active_cluster_count_key } from '../featrix_sphere_control';
import { v4 as uuid4 } from 'uuid';

// Build timestamp for cache busting verification
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
    const [showModal, setShowModal] = useState(false);
    
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
        
        // Left Y-axis labels (validation loss values) - better formatting and positioning
        ctx.textAlign = 'right';
        ctx.font = '12px Arial';
        ctx.fillStyle = '#00ff88'; // Green color for loss axis
        for (let i = 0; i <= 4; i++) {
            const loss = maxLoss - (i / 4) * (maxLoss - minLoss);
            const y = topPadding + (i / 4) * plotHeight;
            // Smart decimal formatting based on value magnitude
            const formatted = loss < 0.01 ? loss.toFixed(4) : 
                             loss < 0.1 ? loss.toFixed(3) : 
                             loss.toFixed(2);
            ctx.fillText(formatted, leftPadding - 10, y + 4);
        }
        
        // Right Y-axis labels (learning rate values) if provided - YELLOW
        if (sortedLRData.length > 0) {
            ctx.textAlign = 'left';
            ctx.font = '12px Arial';
            ctx.fillStyle = '#ffff00'; // YELLOW color for learning rate axis
            for (let i = 0; i <= 4; i++) {
                const lr = maxLR - (i / 4) * (maxLR - minLR);
                const y = topPadding + (i / 4) * plotHeight;
                // Smart decimal formatting for learning rate
                const formatted = lr < 0.0001 ? lr.toExponential(2) :
                                 lr < 0.01 ? lr.toFixed(5) :
                                 lr < 0.1 ? lr.toFixed(4) :
                                 lr.toFixed(3);
                ctx.fillText(formatted, leftPadding + plotWidth + 10, y + 4);
            }
        }
        
        // Title with better positioning
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(title, width / 2, 20);
        
        // Legend if both datasets are present
        if (sortedLRData.length > 0) {
            ctx.font = '11px Arial';
            ctx.textAlign = 'left';
            // Validation Loss label
            ctx.fillStyle = '#00ff88';
            ctx.fillText('Loss', leftPadding + 10, topPadding + plotHeight + 20);
            // Learning Rate label
            ctx.fillStyle = '#ffaa00';
            ctx.fillText('LR', leftPadding + 60, topPadding + plotHeight + 20);
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
    
    return (
        <>
            <div 
                style={{...style, cursor: 'pointer'}}
                onClick={() => setShowModal(true)}
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
            
            ctx.fillStyle = '#4caf50';
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
        console.log('🎬 COMPONENT_INIT_START:', componentStartTime.current + 'ms');
        hasLoggedInit.current = true;
    }
    const [sphereRef, setSphereRef] = useState<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [frameInfo, setFrameInfo] = useState<{ current: number, total: number, visible: number, epoch?: string, validationLoss?: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(true); // Start playing automatically
    const [frameInput, setFrameInput] = useState<string>('');
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
    const [showSidePanelInFullscreen, setShowSidePanelInFullscreen] = useState(false);
    
    // Rotation control state
    const [rotationEnabled, setRotationEnabled] = useState(true); // Default enabled
    
    // Search state
    const [columnTypes, setColumnTypes] = useState<any>(null);
    const [selectedSearchColumn, setSelectedSearchColumn] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showSearch, setShowSearch] = useState(false);
    const [showBoundsBox, setShowBoundsBox] = useState(false);
    
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
                                // Stop current movie
                                stop_training_movie(sphereRef);
                                
                                // Reload training movie with updated data
                                load_training_movie(sphereRef, updatedTrainingData, latestData.training_metrics || lossData);
                                
                                // Reset to frame 1 and replay
                                goto_training_movie_frame(sphereRef, 1);
                                setIsPlaying(true);
                                play_training_movie(sphereRef);
                                
                                console.log('🔄 Reloaded and restarted training movie with new epochs');
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
        sphereRef.showDynamicPoints = false; // Always disabled - not useful
        sphereRef.showDynamicHulls = showDynamicHulls;
        sphereRef.memoryTrailLength = trailLength;
        sphereRef.spotlightCluster = spotlightCluster;

        // Call the unified compute function with all settings
        compute_cluster_convex_hulls(sphereRef);
        update_cluster_spotlight(sphereRef);
        
    }, [showDynamicHulls, trailLength, spotlightCluster, sphereRef]);

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
            console.error("Error getting column types:", error);
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
        if (!sphereRef || !sphereRef.pointRecordsByID) {
            console.warn('🔍 Search: No sphereRef or pointRecordsByID');
            return [];
        }
        
        // Normalize the query value for boolean matching
        const normalizedQuery = normalizeBoolean(queryValue);
        const isBooleanQuery = normalizedQuery !== null;
        
        let results: any = [];
        let checked = 0;
        for (const record of sphereRef.pointRecordsByID.values()) {
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
        console.log(`🔍 Search: Checked ${checked} records, found ${results.length} matches for "${queryValue}" in column "${queryColumn}" (type: ${queryColumnType})`);
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
    
    // Handle Enter key to create color rule
    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            
            if (!sphereRef || !columnTypes || !selectedSearchColumn || !searchQuery.trim()) {
                return;
            }
            
            // Filter results
            const queryColumnType = columnTypes[selectedSearchColumn];
            const theRecords = filter_record_list(queryColumnType, selectedSearchColumn, searchQuery.trim());
            
            if (theRecords.length === 0) {
                console.warn('🔍 No results found for search query');
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
            setColorRules(prev => [...prev, newRule]);
            
            // Clear search input
            setSearchQuery('');
            setSearchResultStats(null);
            
            console.log(`🎨 Created color rule: "${newRule.query}" in column "${newRule.column}" with color ${newRule.color} for ${newRule.recordIds.length} records`);
        }
    };
    
    // Handle search input with boolean color coding (live preview)
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
    
    // Apply color rules when they change
    useEffect(() => {
        applyColorRules();
    }, [applyColorRules]);
    
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
                height: '770px',
                background: '#2a2a2a',
                color: '#d0d0d0',
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
                        <div style={{ marginBottom: '20px', fontSize: '18px' }}>Loading Training Movie...</div>
                        <div style={{ 
                            width: '40px', 
                            height: '40px', 
                            border: '3px solid #555', 
                            borderTop: '3px solid #d0d0d0',
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
                            Training in progress
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
                            Training Completed
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
                        <div style={{ marginBottom: '20px', fontSize: '18px' }}>Loading Training Movie...</div>
                        <div style={{ 
                            width: '40px', 
                            height: '40px', 
                            border: '3px solid #555', 
                            borderTop: '3px solid #d0d0d0',
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
                background: '#2a2a2a',
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
                <div style={{ fontSize: '18px', marginBottom: '10px' }}>Error loading training movie</div>
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
                background: '#2a2a2a',
                color: '#d0d0d0'
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
            background: '#2a2a2a',
            color: '#d0d0d0',
            overflow: 'hidden'
        }}>
            {/* Sphere Container - ALWAYS FILLS AVAILABLE SPACE */}
            <div style={{
                flex: isFullscreen && !showSidePanelInFullscreen ? '1 1 100%' : '1 1 75%',
                width: isFullscreen && !showSidePanelInFullscreen ? '100%' : '75%',
                height: '100%',
                minHeight: '100vh',
                position: 'relative',
                background: '#2a2a2a',
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'stretch'
            }}>
                {/* Toggle side panel button in fullscreen mode */}
                {isFullscreen && (
                    <button
                        onClick={() => setShowSidePanelInFullscreen(!showSidePanelInFullscreen)}
                        style={{
                            position: 'fixed',
                            top: '10px',
                            right: showSidePanelInFullscreen ? 'calc(25% + 10px)' : '10px',
                            zIndex: 10000,
                            background: 'rgba(42, 42, 42, 0.8)',
                            border: '1px solid #666',
                            color: '#d0d0d0',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            transition: 'right 0.3s ease'
                        }}
                        title={showSidePanelInFullscreen ? "Hide Controls" : "Show Controls"}
                    >
                        {showSidePanelInFullscreen ? '< Hide' : '> Show'}
                    </button>
                )}
                {/* Countdown Overlay - only temporary, positioned over sphere */}
                {showCountdown && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(42, 42, 42, 0.9)',
                        color: '#d0d0d0',
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
                
                {/* ACTUAL 3D SPHERE VIEWER - WebGL container ALWAYS FILLS AVAILABLE SPACE */}
                <div 
                    id="training-movie-3d-container" 
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
                        background: '#2a2a2a'
                    }}>
                        Initializing 3D sphere...
                    </div>
                )}
                </div>
            </div>
            
            {/* Controls Side Panel - Right side, hugging the edge, hidden in fullscreen unless toggled */}
            {(!isFullscreen || showSidePanelInFullscreen) && (
            <div style={{
                flex: '0 0 25%',
                width: '25%',
                height: '100vh',
                background: '#3a3a3a',
                borderLeft: '1px solid #555',
                overflowY: 'auto',
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: '14px',
                color: '#d0d0d0',
                transition: isFullscreen ? 'transform 0.3s ease' : 'none',
                transform: isFullscreen && !showSidePanelInFullscreen ? 'translateX(100%)' : 'translateX(0)'
            }}>
                {/* Build timestamp & frame info */}
                <div className="build-display" style={{
                    marginBottom: '16px',
                    padding: '8px',
                    background: 'rgba(42, 42, 42, 0.8)',
                    borderRadius: '6px',
                    border: '1px solid #666'
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
                                Training in progress
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
                                Training Completed
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

                {/* Loss Plot with Dual Y-Axis (Validation Loss + Learning Rate) */}
                {lossData && (() => {
                    // Debug: log lossData structure
                    if (lossData && !lossData.validation_loss) {
                        console.log('🔍 Loss plot debug - lossData structure:', Object.keys(lossData));
                        console.log('🔍 Loss plot debug - lossData:', lossData);
                    }
                    
                    // Try different possible structures for validation loss
                    let validationLossData = null;
                    if (lossData.validation_loss && Array.isArray(lossData.validation_loss)) {
                        validationLossData = lossData.validation_loss;
                    } else if (lossData.training_info && lossData.training_info.loss_history) {
                        // Handle structure from API: training_metrics.training_info.loss_history
                        validationLossData = lossData.training_info.loss_history.map((item: any) => ({
                            epoch: item.epoch || item.epoch_number || 0,
                            value: item.validation_loss || item.loss || 0
                        }));
                    } else if (Array.isArray(lossData)) {
                        // If lossData itself is an array
                        validationLossData = lossData;
                    }
                    
                    if (!validationLossData || !Array.isArray(validationLossData) || validationLossData.length === 0) {
                        return null;
                    }
                    
                    // Extract learning rate data for dual Y-axis - COMPREHENSIVE EXTRACTION
                    let learningRateData = null;
                    
                    // Debug: log what we have
                    console.log('🔍 Learning rate extraction - lossData keys:', Object.keys(lossData));
                    console.log('🔍 Learning rate extraction - lossData:', lossData);
                    
                    // Try ALL possible structures from API
                    if (lossData.learning_rate && Array.isArray(lossData.learning_rate)) {
                        learningRateData = lossData.learning_rate;
                        console.log('✅ Found learning_rate array:', learningRateData.length);
                    } else if (lossData.training_info) {
                        // Check training_info.loss_history
                        if (lossData.training_info.loss_history && Array.isArray(lossData.training_info.loss_history)) {
                            const lossHistory = lossData.training_info.loss_history;
                            console.log('🔍 Found loss_history with', lossHistory.length, 'items');
                            console.log('🔍 First item sample:', lossHistory[0]);
                            
                            learningRateData = lossHistory
                                .filter((item: any) => 
                                    item.current_learning_rate !== undefined || 
                                    item.learning_rate !== undefined ||
                                    item.lr !== undefined
                                )
                                .map((item: any) => ({
                                    epoch: item.epoch || item.epoch_number || item.epoch_num || 0,
                                    value: item.current_learning_rate || item.learning_rate || item.lr || 0
                                }));
                            console.log('✅ Extracted learning rate from loss_history:', learningRateData.length, 'points');
                        }
                        
                        // Also check training_info.learning_rate_schedule
                        if ((!learningRateData || learningRateData.length === 0) && lossData.training_info.learning_rate_schedule) {
                            const lrSchedule = lossData.training_info.learning_rate_schedule;
                            if (Array.isArray(lrSchedule)) {
                                learningRateData = lrSchedule.map((item: any) => ({
                                    epoch: item.epoch || item.epoch_number || 0,
                                    value: item.value || item.lr || item.learning_rate || 0
                                }));
                                console.log('✅ Extracted learning rate from learning_rate_schedule:', learningRateData.length, 'points');
                            }
                        }
                    } else if (Array.isArray(lossData) && lossData.length > 0) {
                        // If lossData is an array of loss_history items
                        const firstItem = lossData[0];
                        if (firstItem.current_learning_rate !== undefined || firstItem.learning_rate !== undefined || firstItem.lr !== undefined) {
                            learningRateData = lossData
                                .filter((item: any) => 
                                    item.current_learning_rate !== undefined || 
                                    item.learning_rate !== undefined ||
                                    item.lr !== undefined
                                )
                                .map((item: any) => ({
                                    epoch: item.epoch || item.epoch_number || item.epoch_num || 0,
                                    value: item.current_learning_rate || item.learning_rate || item.lr || 0
                                }));
                            console.log('✅ Extracted learning rate from array:', learningRateData.length, 'points');
                        }
                    }
                    
                    // Check if lossData itself IS training_metrics (common case)
                    if ((!learningRateData || learningRateData.length === 0)) {
                        // Try direct access - lossData might BE training_metrics
                        if (lossData.learning_rate && Array.isArray(lossData.learning_rate)) {
                            learningRateData = lossData.learning_rate;
                            console.log('✅ Found learning_rate directly in lossData:', learningRateData.length);
                        }
                        
                        // Check nested training_metrics
                        if ((!learningRateData || learningRateData.length === 0) && lossData.training_metrics) {
                            const tm = lossData.training_metrics;
                            if (tm.learning_rate && Array.isArray(tm.learning_rate)) {
                                learningRateData = tm.learning_rate;
                                console.log('✅ Found learning_rate in training_metrics:', learningRateData.length);
                            } else if (tm.training_info && tm.training_info.loss_history) {
                                const lossHistory = tm.training_info.loss_history;
                                learningRateData = lossHistory
                                    .filter((item: any) => 
                                        item.current_learning_rate !== undefined || 
                                        item.learning_rate !== undefined ||
                                        item.lr !== undefined
                                    )
                                    .map((item: any) => ({
                                        epoch: item.epoch || item.epoch_number || 0,
                                        value: item.current_learning_rate || item.learning_rate || item.lr || 0
                                    }));
                                console.log('✅ Extracted learning rate from training_metrics.training_info.loss_history:', learningRateData.length, 'points');
                            }
                        }
                        
                        // Deep search in nested objects
                        if ((!learningRateData || learningRateData.length === 0)) {
                            const deepSearch = (obj: any, depth = 0): any[] => {
                                if (depth > 3) return [];
                                if (!obj || typeof obj !== 'object') return [];
                                
                                // Check if this object has learning rate data
                                if (Array.isArray(obj) && obj.length > 0) {
                                    const first = obj[0];
                                    if (first && (first.current_learning_rate !== undefined || first.learning_rate !== undefined || first.lr !== undefined)) {
                                        return obj
                                            .filter((item: any) => 
                                                item.current_learning_rate !== undefined || 
                                                item.learning_rate !== undefined ||
                                                item.lr !== undefined
                                            )
                                            .map((item: any) => ({
                                                epoch: item.epoch || item.epoch_number || item.epoch_num || 0,
                                                value: item.current_learning_rate || item.learning_rate || item.lr || 0
                                            }));
                                    }
                                }
                                
                                // Recursively search
                                for (const key in obj) {
                                    if (key.toLowerCase().includes('learning') || key.toLowerCase().includes('lr') || key.toLowerCase().includes('rate')) {
                                        const result = deepSearch(obj[key], depth + 1);
                                        if (result && result.length > 0) return result;
                                    }
                                }
                                
                                return [];
                            };
                            
                            const deepResult = deepSearch(lossData);
                            if (deepResult && deepResult.length > 0) {
                                learningRateData = deepResult;
                                console.log('✅ Found learning rate via deep search:', learningRateData.length, 'points');
                            }
                        }
                    }
                    
                    if (learningRateData && learningRateData.length > 0) {
                        console.log('✅ Rendering dual Y-axis plot with validation loss and learning rate');
                    } else {
                        console.warn('⚠️ No learning rate data found - showing only validation loss');
                    }
                    
                    return (
                        <div style={{ marginBottom: '16px' }}>
                            <LossPlotOverlay 
                                lossData={validationLossData} 
                                learningRateData={learningRateData && learningRateData.length > 0 ? learningRateData : undefined}
                                currentEpoch={frameInfo?.epoch} 
                                title="Validation Loss"
                                style={{
                                    width: '100%',
                                    height: '120px',
                                    pointerEvents: 'none'
                                }}
                            />
                        </div>
                    );
                })()}

                {/* Frame Controls */}
                {frameInfo && frameInfo.total > 0 && (
                    <div style={{
                        background: 'rgba(42, 42, 42, 0.6)',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #666',
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
                            <span style={{ color: '#d0d0d0', fontSize: '14px', minWidth: '45px', flexShrink: 0 }}>Frame:</span>
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
                            <span style={{ color: '#d0d0d0', fontSize: '14px', minWidth: '60px', textAlign: 'right', flexShrink: 0 }}>
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
                            <button onClick={handleStepBackward} style={{ background: '#555', border: '1px solid #666', color: '#d0d0d0', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', flexShrink: 0 }} title="Previous Frame">⏮</button>
                            <button onClick={handlePlayPause} style={{ background: isPlaying ? '#c44' : '#4c4', border: '1px solid #666', color: '#d0d0d0', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', minWidth: '50px', fontWeight: 'bold', flexShrink: 0 }} title={isPlaying ? "Pause" : "Play"}>{isPlaying ? '⏸' : '▶'}</button>
                            <button onClick={handleStepForward} style={{ background: '#555', border: '1px solid #666', color: '#d0d0d0', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', flexShrink: 0 }} title="Next Frame">⏭</button>
                            <div style={{ margin: '0 4px', color: '#888', flexShrink: 0 }}>|</div>
                            <input type="number" value={frameInput} onChange={(e) => setFrameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGotoFrame()} placeholder="#" style={{ background: '#444', border: '1px solid #666', color: '#d0d0d0', padding: '6px 8px', borderRadius: '4px', width: '60px', fontSize: '14px', flexShrink: 0 }} min="1" max={frameInfo?.total || 1} />
                            <button onClick={handleGotoFrame} style={{ background: '#555', border: '1px solid #666', color: '#d0d0d0', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', flexShrink: 0 }} title="Go to Frame">✓</button>
                            <div style={{ margin: '0 4px', color: '#888', flexShrink: 0 }}>|</div>
                            <button onClick={handleStop} style={{ background: '#633', border: '1px solid #666', color: '#d0d0d0', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', flexShrink: 0 }} title="Stop">⏹</button>
                            <button onClick={handleReplay} style={{ background: '#555', border: '1px solid #666', color: '#d0d0d0', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', flexShrink: 0 }} title="Replay">↻</button>
                        </div>
                    </div>
                )}

                {/* Search & Bounds Box Controls */}
                <div style={{ background: 'rgba(42, 42, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #666', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => setShowSearch(!showSearch)} style={{ background: showSearch ? '#4c4' : '#555', border: '1px solid #666', color: '#d0d0d0', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }} title="Toggle Search">Search</button>
                        <button onClick={() => { setShowBoundsBox(!showBoundsBox); if (sphereRef) { toggle_bounds_box(sphereRef, !showBoundsBox); render_sphere(sphereRef); } }} style={{ background: showBoundsBox ? '#4c4' : '#555', border: '1px solid #666', color: '#d0d0d0', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }} title="Toggle Bounds Box">Bounds</button>
                    </div>
                    {showBoundsBox && sphereRef && sphereRef.boundsBoxVolumeUtilization !== undefined && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #555', fontSize: '13px', color: '#00ff00' }}>
                            Volume Utilization: <strong>{sphereRef.boundsBoxVolumeUtilization.toFixed(2)}%</strong>
                            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                                Unit sphere occupies {sphereRef.boundsBoxVolumeUtilization.toFixed(2)}% of bounding box volume
                            </div>
                        </div>
                    )}
                </div>

                {/* Search Panel - Inline in side panel */}
                {showSearch && columnTypes && Object.keys(columnTypes).length > 0 && (
                    <div style={{ background: 'rgba(42, 42, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #666', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <label style={{ color: '#d0d0d0', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px' }}>
                                    Column:
                                    <select value={selectedSearchColumn} onChange={(e) => setSelectedSearchColumn(e.target.value)} style={{ marginLeft: '4px', fontSize: '13px', padding: '4px 6px', backgroundColor: '#555', color: '#d0d0d0', border: '1px solid #666', borderRadius: '3px', cursor: 'pointer' }}>
                                        {Object.keys(columnTypes).map((col) => (<option key={col} value={col}>{col}</option>))}
                                    </select>
                                </label>
                                {(() => {
                                    // Get placeholder text based on column type
                                    const colType = selectedSearchColumn ? columnTypes[selectedSearchColumn] : null;
                                    let placeholder = 'Type to search...';
                                    if (colType === 'set') {
                                        placeholder = 'Type exact value...';
                                    } else if (colType === 'scalar') {
                                        placeholder = 'Use: =5, >10, <5, !=null, null, etc.';
                                    }
                                    
                                    // Check if column contains boolean-like values
                                    let hasBooleanValues = false;
                                    if (sphereRef && sphereRef.pointRecordsByID && selectedSearchColumn) {
                                        const sampleValues = new Set<string>();
                                        for (const record of sphereRef.pointRecordsByID.values()) {
                                            const val = record.original[selectedSearchColumn];
                                            if (val !== undefined) {
                                                if (isBooleanLike(val)) {
                                                    hasBooleanValues = true;
                                                    break;
                                                }
                                                sampleValues.add(String(val));
                                                if (sampleValues.size >= 10) break;
                                            }
                                        }
                                    }
                                    
                                    return (
                                        <input 
                                            type="text" 
                                            value={searchQuery} 
                                            onChange={handleSearchInput}
                                            onKeyDown={handleSearchKeyDown}
                                            placeholder={placeholder + ' (Press Enter to create color rule)'}
                                            style={{ background: '#444', border: '1px solid #666', color: '#d0d0d0', padding: '6px 10px', borderRadius: '3px', fontSize: '14px', flex: 1, minWidth: '150px' }} 
                                        />
                                    );
                                })()}
                                {searchQuery && (<button onClick={() => { 
                                    setSearchQuery(''); 
                                    setSearchResultStats(null);
                                    applyColorRules();
                                }} style={{ background: '#633', border: '1px solid #666', color: '#d0d0d0', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '13px' }} title="Clear Search">✕</button>)}
                            </div>
                            
                            {/* Color Rules List */}
                            {colorRules.length > 0 && (
                                <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(42, 42, 42, 0.8)', border: '1px solid #666', borderRadius: '4px' }}>
                                    <div style={{ color: '#d0d0d0', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>Color Rules ({colorRules.length}):</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                        {colorRules.map((rule) => (
                                            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px' }}>
                                                <div style={{ width: '20px', height: '20px', background: rule.color, border: '1px solid #666', borderRadius: '3px', flexShrink: 0 }}></div>
                                                <div style={{ flex: 1, fontSize: '12px', color: '#d0d0d0' }}>
                                                    <strong>{rule.column}</strong>: "{rule.query}" ({rule.recordIds.length} records)
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        setColorRules(prev => prev.filter(r => r.id !== rule.id));
                                                    }}
                                                    style={{ 
                                                        background: '#633', 
                                                        border: '1px solid #666', 
                                                        color: '#d0d0d0', 
                                                        padding: '4px 8px', 
                                                        borderRadius: '3px', 
                                                        cursor: 'pointer', 
                                                        fontSize: '11px',
                                                        flexShrink: 0
                                                    }} 
                                                    title="Delete Rule"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setColorRules([]);
                                        }}
                                        style={{ 
                                            marginTop: '8px', 
                                            width: '100%', 
                                            background: '#633', 
                                            border: '1px solid #666', 
                                            color: '#d0d0d0', 
                                            padding: '6px', 
                                            borderRadius: '3px', 
                                            cursor: 'pointer', 
                                            fontSize: '12px' 
                                        }}
                                    >
                                        Clear All Rules
                                    </button>
                                </div>
                            )}
                            
                            {/* Help text for boolean columns */}
                            {(() => {
                                if (!selectedSearchColumn || !sphereRef || !sphereRef.pointRecordsByID) return null;
                                
                                // Check if this column has boolean-like values
                                const sampleValues = new Set<string>();
                                let hasBoolean = false;
                                for (const record of sphereRef.pointRecordsByID.values()) {
                                    const val = record.original[selectedSearchColumn];
                                    if (val !== undefined) {
                                        if (isBooleanLike(val)) {
                                            hasBoolean = true;
                                        }
                                        sampleValues.add(String(val));
                                        if (sampleValues.size >= 20) break;
                                    }
                                }
                                
                                if (hasBoolean) {
                                    return (
                                        <div style={{ padding: '8px', background: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: '4px', fontSize: '12px', color: '#4caf50' }}>
                                            <strong>Boolean column detected:</strong> Try: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '2px' }}>true</code>, <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '2px' }}>1</code>, <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '2px' }}>yes</code> or <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '2px' }}>false</code>, <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '2px' }}>0</code>, <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '2px' }}>no</code>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                            
                            {/* Color Key for Boolean Search Results */}
                            {searchResultStats && searchResultStats.isBoolean && (
                                <div style={{ padding: '8px', background: 'rgba(42, 42, 42, 0.8)', border: '1px solid #666', borderRadius: '4px', fontSize: '12px' }}>
                                    <div style={{ color: '#d0d0d0', fontWeight: 'bold', marginBottom: '6px' }}>Search Results:</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '16px', height: '16px', background: '#00ff00', border: '1px solid #666', borderRadius: '2px' }}></div>
                                            <span style={{ color: '#d0d0d0' }}>Yes/True: <strong>{searchResultStats.yes}</strong></span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '16px', height: '16px', background: '#ff0000', border: '1px solid #666', borderRadius: '2px' }}></div>
                                            <span style={{ color: '#d0d0d0' }}>No/False: <strong>{searchResultStats.no}</strong></span>
                                        </div>
                                        {searchResultStats.unknown > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '16px', height: '16px', background: '#888888', border: '1px solid #666', borderRadius: '2px' }}></div>
                                                <span style={{ color: '#d0d0d0' }}>Unknown: <strong>{searchResultStats.unknown}</strong></span>
                                                <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={hideUnknown} 
                                                        onChange={(e) => setHideUnknown(e.target.checked)}
                                                        style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                                                    />
                                                    Hide
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            
                            {/* Column Distribution/Vocabulary */}
                            {columnVocabulary && (
                                <div style={{ padding: '8px', background: 'rgba(42, 42, 42, 0.8)', border: '1px solid #666', borderRadius: '4px', fontSize: '12px' }}>
                                    {columnVocabulary.type === 'scalar' && columnVocabulary.distribution && (
                                        <div>
                                            <div style={{ color: '#d0d0d0', fontWeight: 'bold', marginBottom: '6px' }}>
                                                Distribution
                                                {columnVocabulary.min !== undefined && columnVocabulary.max !== undefined && (
                                                    <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#aaa', marginLeft: '8px' }}>
                                                        ({columnVocabulary.min.toFixed(2)} - {columnVocabulary.max.toFixed(2)})
                                                    </span>
                                                )}
                                            </div>
                                            {columnVocabulary.mean !== undefined && columnVocabulary.median !== undefined && (
                                                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px' }}>
                                                    Mean: {columnVocabulary.mean.toFixed(2)} | Median: {columnVocabulary.median.toFixed(2)}
                                                </div>
                                            )}
                                            <DistributionChart 
                                                distribution={columnVocabulary.distribution}
                                                min={columnVocabulary.min || 0}
                                                max={columnVocabulary.max || 0}
                                                searchValue={searchQuery ? parseFloat(searchQuery) : null}
                                            />
                                        </div>
                                    )}
                                    {columnVocabulary.type !== 'scalar' && columnVocabulary.vocabulary && (
                                        <div>
                                            <div style={{ color: '#d0d0d0', fontWeight: 'bold', marginBottom: '6px' }}>
                                                Vocabulary ({columnVocabulary.vocabulary.length} unique values)
                                            </div>
                                            <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {columnVocabulary.vocabulary.map((val, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            setSearchQuery(val);
                                                            const fakeEvent = { target: { value: val } } as React.ChangeEvent<HTMLInputElement>;
                                                            handleSearchInput(fakeEvent);
                                                        }}
                                                        style={{
                                                            background: searchQuery === val ? '#4c4' : '#555',
                                                            border: '1px solid #666',
                                                            color: '#d0d0d0',
                                                            padding: '2px 6px',
                                                            borderRadius: '3px',
                                                            cursor: 'pointer',
                                                            fontSize: '11px',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        title={`Click to search for: ${val}`}
                                                    >
                                                        {val.length > 20 ? val.substring(0, 20) + '...' : val}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Example Queries */}
                            <div style={{ borderTop: '1px solid #666', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ color: '#aaa', fontSize: '13px', marginBottom: '4px' }}>Example values from data:</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {(() => {
                                        const examples: string[] = [];
                                        if (selectedSearchColumn && columnTypes[selectedSearchColumn]) {
                                            const colType = columnTypes[selectedSearchColumn];
                                            const sampleValues = new Set<string>();
                                            
                                            if (sphereRef && sphereRef.pointRecordsByID) {
                                                for (const record of sphereRef.pointRecordsByID.values()) {
                                                    const val = record.original[selectedSearchColumn];
                                                    if (val !== undefined) {
                                                        sampleValues.add(String(val));
                                                        if (sampleValues.size >= 8) break; // Get more examples
                                                    }
                                                }
                                            }
                                            
                                            if (colType === 'set' || colType === 'scalar') {
                                                // For set/scalar, show actual values
                                                examples.push(...Array.from(sampleValues).slice(0, 8));
                                            } else if (colType === 'string') {
                                                // For strings, show first few unique values
                                                examples.push(...Array.from(sampleValues).slice(0, 5));
                                            }
                                        }
                                        return examples.length > 0 ? examples.map((ex, idx) => (
                                            <button key={idx} onClick={() => { 
                                                setSearchQuery(ex); 
                                                // Trigger search using the same handler
                                                if (sphereRef && columnTypes && selectedSearchColumn) {
                                                    const fakeEvent = { target: { value: ex } } as React.ChangeEvent<HTMLInputElement>;
                                                    handleSearchInput(fakeEvent);
                                                }
                                            }} style={{ background: '#555', border: '1px solid #777', color: '#d0d0d0', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '13px' }} title={`Click to search for: ${ex}`}>{ex.length > 15 ? ex.substring(0, 15) + '...' : ex}</button>
                                        )) : (
                                            <div style={{ color: '#888', fontSize: '12px', fontStyle: 'italic' }}>No sample values found</div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Visual Controls */}
                {frameInfo && (
                    <div style={{ background: 'rgba(42, 42, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #666', marginBottom: '16px' }}>
                        <div style={{ color: '#d0d0d0', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>Visual Controls</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: frameInfo.visible >= 4 ? '#d0d0d0' : '#888', fontSize: '14px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input type="checkbox" checked={showDynamicHulls} onChange={(e) => { console.log('🔮 Cluster spheres toggled:', e.target.checked, 'clusters:', frameInfo.visible); setShowDynamicHulls(e.target.checked); }} style={{ marginRight: '8px', cursor: 'pointer', width: '16px', height: '16px' }} disabled={frameInfo.visible < 4} />
                                Show Cluster Spheres
                                <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>({frameInfo.visible} clusters - translucent spheres around each cluster)</span>
                            </label>
                            <div style={{ marginTop: '8px', borderTop: '1px solid #666', paddingTop: '8px' }}>
                                <label style={{ color: '#d0d0d0', fontSize: '14px', display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                    Trail Length:
                                    <input type="range" min="2" max="15" value={trailLength} onChange={(e) => { const newLength = parseInt(e.target.value); console.log('🛤️ Trail length changed:', newLength); setTrailLength(newLength); }} style={{ marginLeft: '8px', marginRight: '8px', cursor: 'pointer', flex: 1 }} />
                                    <span style={{ fontSize: '14px', color: '#aaa', minWidth: '20px' }}>{trailLength}</span>
                                </label>
                            </div>
                            <div style={{ marginTop: '8px', borderTop: '1px solid #666', paddingTop: '8px' }}>
                                <label style={{ color: '#d0d0d0', fontSize: '14px', display: 'flex', alignItems: 'center' }}>
                                    Focus Cluster:
                                    <select value={spotlightCluster} onChange={(e) => { const cluster = parseInt(e.target.value); console.log('🎯 Spotlight cluster changed:', cluster); setSpotlightCluster(cluster); if (sphereRef) { sphereRef.spotlightCluster = cluster; update_cluster_spotlight(sphereRef); render_sphere(sphereRef); } }} style={{ marginLeft: '8px', fontSize: '13px', padding: '4px 6px', backgroundColor: '#555', color: '#d0d0d0', border: '1px solid #666', borderRadius: '3px', cursor: 'pointer', flex: 1 }}>
                                        <option value={-1}>Off</option>
                                        {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => (<option key={i} value={i}>C{i}</option>))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Other Controls */}
                <div style={{ background: 'rgba(42, 42, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #666', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={() => setShowClusterDebug(!showClusterDebug)} style={{ background: showClusterDebug ? '#4c4' : '#555', border: '1px solid #666', color: '#d0d0d0', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }} title="Toggle Cluster Inspector">Debug</button>
                        <button onClick={() => setShowColorLegend(!showColorLegend)} style={{ background: showColorLegend ? '#4c4' : '#555', border: '1px solid #666', color: '#d0d0d0', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }} title="Toggle Color Legend">Colors</button>
                        <button onClick={toggleFullscreen} style={{ background: isFullscreen ? '#4c4' : '#555', border: '1px solid #666', color: '#d0d0d0', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }} title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>{isFullscreen ? 'Exit' : 'Full'}</button>
                        <button onClick={() => setRotationEnabled(!rotationEnabled)} style={{ background: rotationEnabled ? '#4c4' : '#c44', border: '1px solid #666', color: '#d0d0d0', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }} title={rotationEnabled ? "Disable Rotation" : "Enable Rotation"}>{rotationEnabled ? 'On' : 'Off'}</button>
                    </div>
                </div>

                {/* Color Legend - Inline in side panel */}
                {showColorLegend && frameInfo && (
                    <div style={{ background: 'rgba(42, 42, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #666', marginBottom: '16px' }}>
                        <div style={{ color: '#4c4', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center', fontSize: '16px' }}>Cluster Colors</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {frameInfo.visible > 0 && Array.from({length: frameInfo.visible}, (_, i) => {
                                // Clusters are 0-based, so cluster 0 uses color index 0
                                const kColorTable = [0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0xbcf60c, 0xfabebe, 0x008080, 0xe6beff, 0x9a6324, 0xfffac8, 0x800000, 0xaaffc3, 0x808000, 0xffd8b1, 0x999999, 0x0000ff, 0x00ff00, 0xffcccc];
                                const defaultColorHex = kColorTable[i] || 0x999999;
                                // Check for custom color
                                const customColorHex = sphereRef?.customClusterColors?.get(i);
                                const colorHex = customColorHex || defaultColorHex;
                                const color = '#' + colorHex.toString(16).padStart(6, '0');
                                return (
                                    <div key={`cluster-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '12px' }}>C{i}</span>
                                        <input 
                                            type="color" 
                                            value={color}
                                            onChange={(e) => {
                                                if (sphereRef) {
                                                    const newColor = e.target.value;
                                                    set_cluster_color(sphereRef, i, newColor);
                                                    // Force re-render
                                                    render_sphere(sphereRef);
                                                }
                                            }}
                                            style={{ 
                                                width: '30px', 
                                                height: '30px', 
                                                border: '1px solid #555', 
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
                                background: '#633', 
                                border: '1px solid #666', 
                                color: '#d0d0d0', 
                                padding: '6px', 
                                borderRadius: '3px', 
                                cursor: 'pointer', 
                                fontSize: '12px' 
                            }}
                        >
                            Reset to Default Colors
                        </button>
                    </div>
                )}

                {/* Cluster Debug Panel - Inline in side panel */}
                {showClusterDebug && (
                    <div style={{ background: 'rgba(42, 42, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid #666', marginBottom: '16px' }}>
                        <div style={{ color: '#4c4', fontWeight: 'bold', marginBottom: '8px', fontSize: '16px' }}>Cluster Inspector</div>
                        {frameInfo && (<div style={{ marginBottom: '8px', fontSize: '14px' }}><div>Frame: {frameInfo.current}/{frameInfo.total}</div><div>Visible Clusters: {frameInfo.visible}</div><div>Epoch: {frameInfo.epoch || 'unknown'}</div></div>)}
                        {selectedPointInfo && (<div style={{ marginTop: '8px', borderTop: '1px solid #444', paddingTop: '8px', fontSize: '13px' }}><div style={{ color: '#ff4', fontWeight: 'bold' }}>Selected Point:</div><div>Record ID: {selectedPointInfo.recordId}</div><div>Row Offset: {selectedPointInfo.rowOffset}</div><div>Cluster ID: {selectedPointInfo.clusterId}</div><div>Color: <span style={{ background: selectedPointInfo.color, padding: '2px 6px', borderRadius: '2px' }}>{selectedPointInfo.color}</span></div><div>Position: {selectedPointInfo.position}</div></div>)}
                        <div style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>Click points on sphere to inspect</div>
                    </div>
                )}
            </div>
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