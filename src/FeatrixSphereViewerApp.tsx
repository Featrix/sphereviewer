import React, { useState, useEffect } from 'react';
import FeatrixSphereEmbedded from './FeatrixSphereEmbedded';
import FeatrixSphereHeader from '../featrix_sphere_header';

interface FeatrixSphereViewerAppProps {
  data?: any;           // New: Direct data input
  sessionId?: string;   // Legacy: API-based loading
  apiBaseUrl?: string;
  // Animation controls
  isRotating?: boolean;
  rotationSpeed?: number;
  animateClusters?: boolean;
  // Visual controls
  pointSize?: number;
  pointOpacity?: number;
  // Callbacks
  onSphereReady?: (sphereRef: any) => void;
}

// API fetching functions (only used when sessionId provided)
async function fetchSessionData(sessionId: string, apiBaseUrl?: string) {
  const baseUrl = apiBaseUrl || 'https://sphere-api.featrix.com';
  const response = await fetch(`${baseUrl}/compute/session/${sessionId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch session data: ${response.statusText}`);
  }
  return response.json();
}

const FeatrixSphereViewerApp: React.FC<FeatrixSphereViewerAppProps> = ({ 
  data,
  sessionId, 
  apiBaseUrl,
  isRotating,
  rotationSpeed,
  animateClusters,
  pointSize,
  pointOpacity,
  onSphereReady
}) => {
  const [initialData, setInitialData] = useState(data || null);
  const [loading, setLoading] = useState(!data); // Don't load if data provided
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If data is provided directly, use it
    if (data) {
      setInitialData(data);
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

  if (error) {
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

  if (!initialData) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center text-gray-600">
          <p className="text-lg font-semibold mb-2">No Data Available</p>
          <p className="text-sm">
            {data ? 'Invalid data format provided' : 'No data or session ID provided'}
          </p>
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
            initial_data={initialData} 
            apiBaseUrl={apiBaseUrl}
            isRotating={isRotating}
            rotationSpeed={rotationSpeed}
            animateClusters={animateClusters}
            pointSize={pointSize}
            pointOpacity={pointOpacity}
            onSphereReady={onSphereReady}
          />
        </div>
      </div>
    </div>
  );
};

export default FeatrixSphereViewerApp; 