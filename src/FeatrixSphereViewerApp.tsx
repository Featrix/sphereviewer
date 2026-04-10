import React, { useState, useEffect } from 'react';
import FeatrixSphereEmbedded from './FeatrixSphereEmbedded';
import FeatrixSphereHeader from '../featrix_sphere_header';
import type { SphereViewerProps } from './types';

// API fetching functions (only used when sessionId provided)
async function fetchSessionData(sessionId: string, apiBaseUrl?: string) {
  const baseUrl = apiBaseUrl || 'https://sphere-api.featrix.com';
  const response = await fetch(`${baseUrl}/compute/session/${sessionId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch session data: ${response.statusText}`);
  }
  return response.json();
}

const FeatrixSphereViewerApp: React.FC<SphereViewerProps> = (props) => {
  const {
    data,
    sessionId,
    apiBaseUrl,
    authToken,
    isRotating,
    rotationSpeed,
    animateClusters,
    pointSize,
    pointAlpha,
    pointOpacity,
    onSphereReady,
    mode,
    theme,
    backgroundColor,
    colormap,
    onMaximize,
    // Data callbacks
    onRequestRows,
    onRequestClusterDetail,
    onRequestMorePoints,
    onRequestEpochs,
    // UI event callbacks
    onPointClick,
    onPointsSelected,
    onClusterFocused,
    onFrameChange,
  } = props;

  const [initialData, setInitialData] = useState<any>(data ? null : null);
  const [loading, setLoading] = useState(!data && !!sessionId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If clean data prop is provided, let FeatrixSphereEmbedded handle it directly
    if (data) {
      setLoading(false);
      return;
    }

    // Otherwise, fall back to API loading with sessionId
    if (sessionId) {
      const loadData = async () => {
        try {
          setLoading(true);
          setError(null);
          const apiData = await fetchSessionData(sessionId, apiBaseUrl);
          setInitialData(apiData);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
          setLoading(false);
        }
      };
      loadData();
    } else {
      setError('No data or session ID provided');
      setLoading(false);
    }
  }, [data, sessionId, apiBaseUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sphere viewer...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center text-red-600">
          <p className="text-lg font-semibold mb-2">Error Loading Sphere</p>
          <p className="text-sm">{error}</p>
          {sessionId && (
            <button
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sphere-viewer-container">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <FeatrixSphereHeader />
          <FeatrixSphereEmbedded
            data={data}
            initial_data={initialData || undefined}
            sessionId={sessionId}
            apiBaseUrl={apiBaseUrl}
            authToken={authToken}
            isRotating={isRotating}
            rotationSpeed={rotationSpeed}
            animateClusters={animateClusters}
            pointSize={pointSize}
            pointAlpha={pointAlpha}
            pointOpacity={pointOpacity}
            onSphereReady={onSphereReady}
            mode={mode}
            theme={theme}
            backgroundColor={backgroundColor}
            colormap={colormap}
            onMaximize={onMaximize}
            onRequestRows={onRequestRows}
            onRequestClusterDetail={onRequestClusterDetail}
            onRequestMorePoints={onRequestMorePoints}
            onRequestEpochs={onRequestEpochs}
            onPointClick={onPointClick}
            onPointsSelected={onPointsSelected}
            onClusterFocused={onClusterFocused}
            onFrameChange={onFrameChange}
          />
        </div>
      </div>
    </div>
  );
};

export default FeatrixSphereViewerApp;
