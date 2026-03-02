/**
 * Chart components using Plotly.js
 */
import React, { useEffect, useRef } from 'react';
import { useTheme } from '../ThemeContext';
import type { SphereTheme } from '../theme';

// Declare Plotly as a global (loaded from CDN)
declare const Plotly: any;

// Load Plotly from CDN if not already loaded
const loadPlotly = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (typeof Plotly !== 'undefined') {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.plot.ly/plotly-2.27.0.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Plotly'));
        document.head.appendChild(script);
    });
};

// Theme-aware chart layout
function getChartLayout(theme: SphereTheme) {
    return {
        paper_bgcolor: theme.chartBg,
        plot_bgcolor: theme.chartBg,
        font: { color: theme.chartText, size: 11 },
        margin: { l: 50, r: 15, t: 10, b: 35 },
        xaxis: {
            gridcolor: theme.chartGrid,
            linecolor: theme.chartLine,
            tickfont: { size: 10 },
        },
        yaxis: {
            gridcolor: theme.chartGrid,
            linecolor: theme.chartLine,
            tickfont: { size: 10 },
        },
        showlegend: false,
        hovermode: 'x unified' as const,
    };
}

const config = {
    displayModeBar: false,
    responsive: true,
};

// ============ LOSS PLOT ============
export const LossPlotOverlay: React.FC<{
    lossData: Array<{ epoch: number | string, value: number }>;
    learningRateData?: Array<{ epoch: number | string, value: number }>;
    currentEpoch?: string;
    title?: string;
    style?: React.CSSProperties;
}> = ({ lossData, learningRateData, currentEpoch, style }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const plotlyLoaded = useRef(false);
    const { theme } = useTheme();

    useEffect(() => {
        if (!containerRef.current || !lossData || lossData.length === 0) return;

        const renderChart = async () => {
            try {
                await loadPlotly();
                plotlyLoaded.current = true;
            } catch {
                console.error('Failed to load Plotly');
                return;
            }

            const container = containerRef.current;
            if (!container) return;

            // Parse epochs
            const parseEpoch = (e: number | string) =>
                typeof e === 'string' ? parseInt(e.replace(/^epoch_/i, '')) : e;

            // Sort data
            const sortedLoss = [...lossData].sort((a, b) => parseEpoch(a.epoch) - parseEpoch(b.epoch));
            const epochs = sortedLoss.map(d => parseEpoch(d.epoch));
            const losses = sortedLoss.map(d => d.value);

            const traces: any[] = [
                {
                    x: epochs,
                    y: losses,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Loss',
                    line: { color: '#00e5ff', width: 2 },
                    hovertemplate: 'Epoch %{x}<br>Loss: %{y:.4f}<extra></extra>',
                },
            ];

            // Add learning rate on secondary axis if provided
            if (learningRateData && learningRateData.length > 0) {
                const sortedLR = [...learningRateData].sort((a, b) => parseEpoch(a.epoch) - parseEpoch(b.epoch));
                traces.push({
                    x: sortedLR.map(d => parseEpoch(d.epoch)),
                    y: sortedLR.map(d => d.value),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'LR',
                    yaxis: 'y2',
                    line: { color: '#ff6666', width: 1.5 },
                    hovertemplate: 'LR: %{y:.2e}<extra></extra>',
                });
            }

            // Add current epoch marker
            if (currentEpoch) {
                const currentEpochNum = parseEpoch(currentEpoch);
                if (!isNaN(currentEpochNum)) {
                    traces.push({
                        x: [currentEpochNum, currentEpochNum],
                        y: [Math.min(...losses) * 0.9, Math.max(...losses) * 1.1],
                        type: 'scatter',
                        mode: 'lines',
                        line: { color: theme.chartLine, width: 1, dash: 'dash' },
                        hoverinfo: 'skip',
                        showlegend: false,
                    });
                }
            }

            const baseLayout = getChartLayout(theme);
            const layout: any = {
                ...baseLayout,
                xaxis: { ...baseLayout.xaxis, title: { text: 'Epoch', font: { size: 10 } } },
                yaxis: {
                    ...baseLayout.yaxis,
                    title: { text: 'Loss', font: { size: 10 } },
                },
            };

            if (learningRateData && learningRateData.length > 0) {
                layout.yaxis2 = {
                    ...baseLayout.yaxis,
                    overlaying: 'y',
                    side: 'right',
                    title: { text: 'LR', font: { size: 10 } },
                    tickformat: '.0e',
                };
                layout.margin.r = 50;
            }

            Plotly.react(container, traces, layout, config);
        };

        renderChart();
    }, [lossData, learningRateData, currentEpoch, theme]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (containerRef.current && plotlyLoaded.current) {
                try { Plotly.purge(containerRef.current); } catch {}
            }
        };
    }, []);

    return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} />;
};

// ============ MOVEMENT PLOT ============
export const MovementPlotOverlay: React.FC<{
    movementData: Array<{ epoch: string; mean: number; median: number; p90: number; max: number }>;
    currentEpoch?: string;
    style?: React.CSSProperties;
}> = ({ movementData, currentEpoch, style }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const plotlyLoaded = useRef(false);
    const { theme } = useTheme();

    useEffect(() => {
        if (!containerRef.current || !movementData || movementData.length === 0) return;

        const renderChart = async () => {
            try {
                await loadPlotly();
                plotlyLoaded.current = true;
            } catch {
                console.error('Failed to load Plotly');
                return;
            }

            const container = containerRef.current;
            if (!container) return;

            const parseEpoch = (e: string) => parseInt(e.replace(/^epoch_/i, ''));
            const sorted = [...movementData].sort((a, b) => parseEpoch(a.epoch) - parseEpoch(b.epoch));
            const epochs = sorted.map(d => parseEpoch(d.epoch));

            const traces: any[] = [
                // P90 area fill (background context)
                {
                    x: epochs,
                    y: sorted.map(d => d.p90),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'P90',
                    fill: 'tozeroy',
                    fillcolor: 'rgba(255, 102, 102, 0.12)',
                    line: { color: '#ff6666', width: 1.5 },
                    hovertemplate: 'P90: %{y:.4f}<extra></extra>',
                },
                // Median line (primary metric)
                {
                    x: epochs,
                    y: sorted.map(d => d.median),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Median',
                    line: { color: '#00e5ff', width: 2 },
                    hovertemplate: 'Median: %{y:.4f}<extra></extra>',
                },
            ];

            // Current epoch marker
            if (currentEpoch) {
                const currentEpochNum = parseEpoch(currentEpoch);
                if (!isNaN(currentEpochNum)) {
                    const maxY = Math.max(...sorted.map(d => d.p90)) * 1.1;
                    traces.push({
                        x: [currentEpochNum, currentEpochNum],
                        y: [0, maxY],
                        type: 'scatter',
                        mode: 'lines',
                        line: { color: theme.chartLine, width: 1, dash: 'dash' },
                        hoverinfo: 'skip',
                        showlegend: false,
                    });
                }
            }

            const baseLayout = getChartLayout(theme);
            const layout = {
                ...baseLayout,
                xaxis: { ...baseLayout.xaxis, title: { text: 'Epoch', font: { size: 10 } } },
                yaxis: { ...baseLayout.yaxis, title: { text: 'Movement', font: { size: 10 } } },
            };

            Plotly.react(container, traces, layout, config);
        };

        renderChart();
    }, [movementData, currentEpoch, theme]);

    useEffect(() => {
        return () => {
            if (containerRef.current && plotlyLoaded.current) {
                try { Plotly.purge(containerRef.current); } catch {}
            }
        };
    }, []);

    return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} />;
};

// ============ MOVEMENT HISTOGRAM BY CLUSTER ============
export const MovementHistogramByCluster: React.FC<{
    histogramData: {
        buckets: Array<{ range: string; min: number; max: number; counts: Record<number, number>; total: number }>;
        clusterColors: Record<number, string>;
    } | null;
    style?: React.CSSProperties;
}> = ({ histogramData, style }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const plotlyLoaded = useRef(false);
    const { theme } = useTheme();

    useEffect(() => {
        if (!containerRef.current || !histogramData || histogramData.buckets.length === 0) return;

        const renderChart = async () => {
            try {
                await loadPlotly();
                plotlyLoaded.current = true;
            } catch {
                console.error('Failed to load Plotly');
                return;
            }

            const container = containerRef.current;
            if (!container) return;

            const { buckets, clusterColors } = histogramData;

            // Get all unique cluster IDs
            const clusterIds = new Set<number>();
            buckets.forEach(b => {
                Object.keys(b.counts).forEach(id => clusterIds.add(parseInt(id)));
            });
            const sortedClusterIds = Array.from(clusterIds).sort((a, b) => a - b);

            // Create stacked bar traces for each cluster
            const traces: any[] = sortedClusterIds.map(clusterId => ({
                x: buckets.map(b => b.max.toFixed(3)),
                y: buckets.map(b => b.counts[clusterId] || 0),
                type: 'bar',
                name: `Cluster ${clusterId}`,
                marker: { color: clusterColors[clusterId] || '#888888' },
                hovertemplate: `Cluster ${clusterId}<br>Range: %{x}<br>Count: %{y}<extra></extra>`,
            }));

            const baseLayout = getChartLayout(theme);
            const layout = {
                ...baseLayout,
                barmode: 'stack',
                xaxis: { ...baseLayout.xaxis, title: { text: 'Movement Distance', font: { size: 10 } } },
                yaxis: { ...baseLayout.yaxis, title: { text: 'Point Count', font: { size: 10 } } },
                showlegend: true,
                legend: {
                    orientation: 'h' as const,
                    x: 0.5,
                    xanchor: 'center' as const,
                    y: -0.25,
                    font: { size: 9 },
                    itemwidth: 30,
                },
                margin: { ...baseLayout.margin, b: 55 },
            };

            Plotly.react(container, traces, layout, config);
        };

        renderChart();
    }, [histogramData, theme]);

    useEffect(() => {
        return () => {
            if (containerRef.current && plotlyLoaded.current) {
                try { Plotly.purge(containerRef.current); } catch {}
            }
        };
    }, []);

    if (!histogramData) {
        return <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, fontSize: '11px' }}>No movement data</div>;
    }

    return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} />;
};
