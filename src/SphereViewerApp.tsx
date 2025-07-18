import React, { useState, useEffect } from 'react';
import SphereEmbedded from './SphereEmbedded';
import SphereHeader from '../sphere_header';

interface SphereViewerAppProps {
  sessionId: string;
  apiBaseUrl?: string;
}

// Simple data fetching functions adapted for the embeddable version
async function fetchSessionData(sessionId: string, apiBaseUrl?: string) {
  const baseUrl = apiBaseUrl || 'https://sphere-api.featrix.com';
  const response = await fetch(`${baseUrl}/compute/session/${sessionId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch session data: ${response.statusText}`);
  }
  return response.json();
}

const SphereViewerApp: React.FC<SphereViewerAppProps> = ({ 
  sessionId, 
  apiBaseUrl 
}) => {
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchSessionData(sessionId, apiBaseUrl);
        setInitialData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    if (sessionId) {
      loadData();
    }
  }, [sessionId, apiBaseUrl]);

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
          <button 
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!initialData) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-600">No data available</p>
      </div>
    );
  }

  return (
    <div className="sphere-viewer-container">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <SphereHeader />
          
          <div className="text-sm text-gray-600">
            We'd love to hear what you think. You can always email us at{' '}
            <a 
              href="mailto:hello@featrix.ai?subject=I%20Love%20Embeddings" 
              className="text-blue-600 hover:text-blue-800 underline ml-1"
            >
              hello@featrix.ai
            </a>
            .
          </div>
          
          <SphereEmbedded initial_data={initialData} apiBaseUrl={apiBaseUrl} />
        </div>
      </div>
    </div>
  );
};

export default SphereViewerApp; 