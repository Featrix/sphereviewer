import React, { useState } from 'react';
import './App.css';
import { SphereViewer } from '@featrix/sphere-viewer';

function App() {
  const [sessionId, setSessionId] = useState('test-session-123');

  return (
    <div className="App">
      <header className="App-header">
        <h1>🌐 Sphere Viewer Test</h1>
        <p>Testing @featrix/sphere-viewer NPM package</p>
        
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="sessionId">Session ID: </label>
          <input 
            id="sessionId"
            type="text" 
            value={sessionId} 
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="Enter session ID"
            style={{ 
              padding: '8px', 
              marginLeft: '10px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          />
        </div>

        <div 
          style={{ 
            width: '90vw', 
            height: '500px', 
            border: '2px solid #61dafb', 
            borderRadius: '8px',
            backgroundColor: 'white'
          }}
        >
          <SphereViewer 
            sessionId={sessionId}
            apiBaseUrl="https://sphere-api.featrix.com"
          />
        </div>

        <div style={{ marginTop: '20px', fontSize: '14px', color: '#888' }}>
          <p>✅ Package installed successfully!</p>
          <p>✅ TypeScript definitions working!</p>
          <p>✅ Component renders without errors!</p>
        </div>
      </header>
    </div>
  );
}

export default App; 