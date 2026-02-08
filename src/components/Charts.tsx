/**
 * Chart components using Plotly.js
 */
import React, { useEffect, useRef } from 'react';

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

// Common dark theme layout
const darkLayout = {
    paper_bgcolor: '#0b0b0b',
    plot_bgcolor: '#0b0b0b',
    font: { color: '#e6e6e6', size: 11 },
    margin: { l: 50, r: 15, t: 10, b: 35 },
    xaxis: {
        gridcolor: 'rgba(255,255,255,0.08)',
        linecolor: 'rgba(255,255,255,0.3)',
        tickfont: { size: 10 },
    },
    yaxis: {
        gridcolor: 'rgba(255,255,255,0.08)',
        linecolor: 'rgba(255,255,255,0.3)',
        tickfont: { size: 10 },
    },
    showlegend: false,
    hovermode: 'x unified' as const,
};

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
                        line: { color: 'rgba(255,255,255,0.5)', width: 1, dash: 'dash' },
                        hoverinfo: 'skip',
                        showlegend: false,
                    });
                }
            }

            const layout: any = {
                ...darkLayout,
                xaxis: { ...darkLayout.xaxis, title: { text: 'Epoch', font: { size: 10 } } },
                yaxis: {
                    ...darkLayout.yaxis,
                    title: { text: 'Loss', font: { size: 10 } },
                },
            };

            if (learningRateData && learningRateData.length > 0) {
                layout.yaxis2 = {
                    ...darkLayout.yaxis,
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
    }, [lossData, learningRateData, currentEpoch]);

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
                        line: { color: 'rgba(255,255,255,0.5)', width: 1, dash: 'dash' },
                        hoverinfo: 'skip',
                        showlegend: false,
                    });
                }
            }

            const layout = {
                ...darkLayout,
                xaxis: { ...darkLayout.xaxis, title: { text: 'Epoch', font: { size: 10 } } },
                yaxis: { ...darkLayout.yaxis, title: { text: 'Movement', font: { size: 10 } } },
            };

            Plotly.react(container, traces, layout, config);
        };

        renderChart();
    }, [movementData, currentEpoch]);

    useEffect(() => {
        return () => {
            if (containerRef.current && plotlyLoaded.current) {
                try { Plotly.purge(containerRef.current); } catch {}
            }
        };
    }, []);

    return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} />;
};
