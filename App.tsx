import React, { useState } from 'react';
import Scene from './components/Scene';
import Controls from './components/Controls';
import { AirfoilParams, Point } from './types';

// Default Control Points - High Resolution (12 Points)
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

const DEFAULT_SYSTEM_PROMPT = `Act as a senior Automotive Aerodynamicist. Analyze the provided rear spoiler configuration and scenario.

Provide a structured analysis in JSON format suitable for a professional CFD dashboard.

Evaluate the following metrics on a 0-10 scale (unless specified otherwise):
- downforce: 0 (None) to 10 (Extreme).
- drag: 0 (Airbrake) to 10 (Slippery).
- stability: 0 (Unstable) to 10 (Planted).
- liftToDrag: A numerical ratio.
- flowComplexity: 0 (Laminar) to 100 (Complex).

Provide concise text fields:
- summary: Max 12 words.
- recommendation: Max 8 words.
- extensiveReport: A detailed paragraph (approx 60 words) on boundary layer, separation, and suitability for the user's scenario.

Return ONLY the JSON object. No markdown, no preamble.`;

const DEFAULT_NACA_DESIGN_PROMPT = `Act as an Aerodynamic Engineer. The user wants to configure a vehicle spoiler to achieve a specific goal. Your task is to return the optimal parameter values for a NACA 4-digit airfoil. Focus ONLY on the parameters 'camber', 'position', 'thickness', and 'angle'.`;
const DEFAULT_FREEFORM_DESIGN_PROMPT = `Act as a senior F1 Aerodynamicist. Generate the key geometric points for a car spoiler cross-section based on the user's description. You need to define the Upper (Suction) and Lower (Pressure) surfaces separately using 4-6 keypoints each.`;

// Default: NACA 4412 inverted (roughly) or just negative angle for downforce
const DEFAULT_PARAMS: AirfoilParams = {
  camber: 4,
  position: 4,
  thickness: 14,
  angle: -10, 
  posX: 0,
  posY: 0,
  mode: 'naca',
  isEditing: false, 
  pauseFlowDuringEdit: false, 
  isFlowActive: true, 
  controlPoints: DEFAULT_POINTS,
  flowType: 'discrete', 
  showVortices: true,
  showWireframe: false,
  showHeatmap: false,
  particleCount: 5000,
  flowSpeed: 0.15,
  turbulenceIntensity: 1.0,
  aiProvider: 'gemini',
  localEndpoint: 'http://localhost:3001/v1/chat/completions',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  nacaDesignSystemPrompt: DEFAULT_NACA_DESIGN_PROMPT,
  freeformDesignSystemPrompt: DEFAULT_FREEFORM_DESIGN_PROMPT,
};

const App: React.FC = () => {
  const [params, setParams] = useState<AirfoilParams>(DEFAULT_PARAMS);
  const [history, setHistory] = useState<Point[][]>([]);

  const saveHistory = () => {
    setHistory(prev => {
      const newHistory = [...prev, params.controlPoints];
      if (newHistory.length > 20) return newHistory.slice(newHistory.length - 20);
      return newHistory;
    });
  };

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
    saveHistory(); 
    setParams(prev => ({ ...prev, controlPoints: DEFAULT_POINTS }));
  };

  // MESH TOOLS
  const handleSubdivide = () => {
    saveHistory();
    setParams(prev => {
      const pts = prev.controlPoints;
      // Identify TE
      let teIndex = 0;
      let maxX = -Infinity;
      pts.forEach((p, i) => { if (p.x > maxX) { maxX = p.x; teIndex = i; } });

      const newPoints: Point[] = [];
      
      // Subdivide Upper: 0 to TE
      for (let i = 0; i < teIndex; i++) {
        newPoints.push(pts[i]);
        // Interpolate
        newPoints.push({
          x: (pts[i].x + pts[i+1].x) / 2,
          y: (pts[i].y + pts[i+1].y) / 2
        });
      }
      newPoints.push(pts[teIndex]); // Add TE

      // Subdivide Lower: TE+1 to End
      // Need to handle the connection logic? The array stores lower points independently.
      // But visually they connect LE -> Lower -> TE.
      // In array: [LE, Upper..., TE, LowerStart..., LowerEnd]
      // The lower surface usually connects LE -> LowerStart and LowerEnd -> TE in visual logic.
      // Here we just subdivide the existing list of intermediate lower points.
      if (pts.length > teIndex + 1) {
         for (let i = teIndex + 1; i < pts.length; i++) {
            // Look ahead if possible, else just push
            if (i < pts.length - 1) {
                newPoints.push(pts[i]);
                newPoints.push({
                    x: (pts[i].x + pts[i+1].x) / 2,
                    y: (pts[i].y + pts[i+1].y) / 2
                });
            } else {
                newPoints.push(pts[i]);
            }
         }
      }

      return { ...prev, controlPoints: newPoints };
    });
  };

  const handleSmooth = () => {
    saveHistory();
    setParams(prev => {
      const pts = prev.controlPoints;
      // Identify TE
      let teIndex = 0;
      let maxX = -Infinity;
      pts.forEach((p, i) => { if (p.x > maxX) { maxX = p.x; teIndex = i; } });

      // Laplacian smooth: p[i] = (p[i-1] + p[i] + p[i+1]) / 3
      // We pin LE (0) and TE (teIndex)
      const newPoints = pts.map(p => ({...p}));
      
      // Smooth Upper Surface (1 to teIndex - 1)
      for (let i = 1; i < teIndex; i++) {
         newPoints[i].x = (pts[i-1].x + pts[i].x + pts[i+1].x) / 3;
         newPoints[i].y = (pts[i-1].y + pts[i].y + pts[i+1].y) / 3;
      }

      // Smooth Lower Surface
      // Lower surface range: teIndex + 1 to end.
      // To smooth correctly, we need to consider neighbors.
      // Neighbors of teIndex+1? It connects to LE (0) and teIndex+2.
      // Neighbors of last point? It connects to TE (teIndex) and last-1.
      // For simplicity in this array structure, let's just smooth the internal list elements relative to each other
      // and assume standard array neighbors.
      for (let i = teIndex + 2; i < pts.length - 1; i++) {
         newPoints[i].x = (pts[i-1].x + pts[i].x + pts[i+1].x) / 3;
         newPoints[i].y = (pts[i-1].y + pts[i].y + pts[i+1].y) / 3;
      }
      
      return { ...prev, controlPoints: newPoints };
    });
  };

  const handleDeletePoint = (index: number) => {
      setParams(prev => {
          const pts = prev.controlPoints;
          // Prevent deleting LE (0) or TE (max X)
          let teIndex = 0;
          let maxX = -Infinity;
          pts.forEach((p, i) => { if (p.x > maxX) { maxX = p.x; teIndex = i; } });

          if (index === 0 || index === teIndex) {
              console.warn("Cannot delete Leading Edge or Trailing Edge points.");
              return prev;
          }
          if (pts.length <= 4) return prev; // Min points safety

          saveHistory();
          const newPoints = pts.filter((_, i) => i !== index);
          return { ...prev, controlPoints: newPoints };
      });
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-mono">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pointer-events-none" />
      
      <Controls 
        params={params} 
        setParams={setParams} 
        onUndo={handleUndo}
        onReset={handleReset}
        canUndo={history.length > 0}
        saveHistory={saveHistory}
        onSubdivide={handleSubdivide}
        onSmooth={handleSmooth}
        defaultSystemPrompt={DEFAULT_SYSTEM_PROMPT}
        defaultNacaSystemPrompt={DEFAULT_NACA_DESIGN_PROMPT}
        defaultFreeformSystemPrompt={DEFAULT_FREEFORM_DESIGN_PROMPT}
      />
      
      <Scene 
        params={params} 
        setParams={setParams} 
        onDragStart={handleDragStart}
        onDeletePoint={handleDeletePoint}
      />
      
      <div className="absolute bottom-4 right-4 text-slate-600 text-xs pointer-events-none select-none z-0 opacity-50">
        {'>'} SYSTEM_READY: Three.js & Gemini 2.5 Flash / Llama.cpp
      </div>
    </div>
  );
};

export default App;