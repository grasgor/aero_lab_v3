
import React, { useState } from 'react';
import Scene from './components/Scene';
import Controls from './components/Controls';
import { AirfoilParams } from './types';

// Default Control Points approximating a symmetric foil
const DEFAULT_POINTS = [
  { x: 0, y: 0 },       // 0: LE
  { x: 0.25, y: 0.08 }, // 1: Upper 1
  { x: 0.5, y: 0.09 },  // 2: Upper 2
  { x: 0.75, y: 0.06 }, // 3: Upper 3
  { x: 1, y: 0 },       // 4: TE
  { x: 0.25, y: -0.08 },// 5: Lower 1
  { x: 0.5, y: -0.09 }, // 6: Lower 2
  { x: 0.75, y: -0.06 } // 7: Lower 3
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
  isEditing: true,
  controlPoints: DEFAULT_POINTS,
  flowType: 'discrete', // Changed default to particles
  showVortices: true,
  showWireframe: false,
  particleCount: 5000,
  flowSpeed: 0.15
};

const App: React.FC = () => {
  const [params, setParams] = useState<AirfoilParams>(DEFAULT_PARAMS);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-mono">
      {/* Background Gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pointer-events-none" />
      
      <Controls params={params} setParams={setParams} />
      <Scene params={params} setParams={setParams} />
      
      {/* Attribution/Footer */}
      <div className="absolute bottom-4 right-4 text-slate-600 text-xs pointer-events-none select-none z-0 opacity-50">
        {'>'} SYSTEM_READY: grasgor ft. three.js X Gemini
      </div>
    </div>
  );
};

export default App;
