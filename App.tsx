import React, { useState } from 'react';
import Scene from './components/Scene';
import Controls from './components/Controls';
import { AirfoilParams, Point } from './types';

// Default Control Points - High Resolution (12 Points)
// 0: LE (0,0)
// 1-5: Upper Surface
// 6: TE (1,0)
// 7-11: Lower Surface
const DEFAULT_POINTS = [
  { x: 0, y: 0 },       // 0: LE
  { x: 0.15, y: 0.06 }, // 1
  { x: 0.30, y: 0.09 }, // 2
  { x: 0.50, y: 0.10 }, // 3 (Max Thickness approx)
  { x: 0.70, y: 0.08 }, // 4
  { x: 0.90, y: 0.03 }, // 5
  { x: 1, y: 0 },       // 6: TE
  { x: 0.15, y: -0.05 },// 7
  { x: 0.30, y: -0.07 },// 8
  { x: 0.50, y: -0.08 },// 9
  { x: 0.70, y: -0.06 },// 10
  { x: 0.90, y: -0.02 } // 11
];

// Default: NACA 4412 inverted (roughly) or just negative angle for downforce
const DEFAULT_PARAMS: AirfoilParams = {
  camber: 4,
  position: 4,
  thickness: 14,
  angle: -10, // Negative angle for downforce
  posX: 0,
  posY: 0,
  mode: 'naca',
  isEditing: false, // Default to viewing mode
  pauseFlowDuringEdit: false, // Keep flow visible by default
  isFlowActive: true, // Global flow switch on
  controlPoints: DEFAULT_POINTS,
  flowType: 'discrete', // Changed default to particles
  showVortices: true,
  showWireframe: false,
  showHeatmap: false,
  particleCount: 5000,
  flowSpeed: 0.15,
  turbulenceIntensity: 1.0,
  aiProvider: 'gemini',
  localEndpoint: 'http://localhost:8080/v1/chat/completions'
};

const App: React.FC = () => {
  const [params, setParams] = useState<AirfoilParams>(DEFAULT_PARAMS);
  const [history, setHistory] = useState<Point[][]>([]);

  // Function to save current state to history (max 20 steps)
  const saveHistory = () => {
    setHistory(prev => {
      const newHistory = [...prev, params.controlPoints];
      if (newHistory.length > 20) return newHistory.slice(newHistory.length - 20);
      return newHistory;
    });
  };

  // Triggered before a drag starts in Airfoil.tsx
  const handleDragStart = () => {
    saveHistory();
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousPoints = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setParams(prev => ({ ...prev, controlPoints: previousPoints }));
  };

  const handleReset = () => {
    saveHistory(); // Save before reset so it can be undone
    setParams(prev => ({ ...prev, controlPoints: DEFAULT_POINTS }));
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-mono">
      {/* Background Gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pointer-events-none" />
      
      <Controls 
        params={params} 
        setParams={setParams} 
        onUndo={handleUndo}
        onReset={handleReset}
        canUndo={history.length > 0}
        saveHistory={saveHistory}
      />
      
      <Scene 
        params={params} 
        setParams={setParams} 
        onDragStart={handleDragStart}
      />
      
      {/* Attribution/Footer */}
      <div className="absolute bottom-4 right-4 text-slate-600 text-xs pointer-events-none select-none z-0 opacity-50">
        {'>'} SYSTEM_READY: Three.js & Gemini 2.5 Flash / Llama.cpp
      </div>
    </div>
  );
};

export default App;