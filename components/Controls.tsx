import React, { useState, useEffect } from 'react';
import { AirfoilParams, AnalysisResult, Preset } from '../types';
import { analyzeAirfoil, optimizeAirfoil, generateProfilePoints } from '../services/geminiService';
import { exportToOBJ } from '../utils/export';

interface ControlsProps {
  params: AirfoilParams;
  setParams: React.Dispatch<React.SetStateAction<AirfoilParams>>;
  onUndo?: () => void;
  onReset?: () => void;
  canUndo?: boolean;
  saveHistory?: () => void;
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (val: number) => void;
  tooltip: string;
  disabled?: boolean;
  activeId: string | null;
  onActivate: (id: string) => void;
}

// Templates for AI Generation
const AI_TEMPLATES = [
  { label: "High Downforce", prompt: "Generate a high downforce wing profile for maximum cornering grip." },
  { label: "Low Drag / Speed", prompt: "Create a low drag, streamlined profile for maximum top speed on straights." },
  { label: "GT3 Racing", prompt: "Design a balanced GT3-spec racing wing with good downforce and efficiency." }
];

const AI_SHAPE_PRESETS = [
  "Aggressive GT Wing",
  "F1 Style High Downforce", 
  "NASCAR Blade Spoiler",
  "Low Drag Speedtail"
];

const SliderWithTooltip: React.FC<SliderProps> = ({ 
  id,
  label, 
  value, 
  min, 
  max, 
  step, 
  onChange, 
  tooltip, 
  unit = "",
  disabled = false,
  activeId,
  onActivate
}) => {
  const isActive = id === activeId;

  return (
    <div 
      className={`space-y-1 transition-all duration-300 ease-out rounded-lg p-2 -mx-2 ${
        isActive 
          ? 'bg-cyan-950/40 border border-cyan-500/30 shadow-[inset_0_0_20px_rgba(6,182,212,0.05)] translate-x-1' 
          : 'border border-transparent hover:bg-white/5'
      } ${disabled ? 'opacity-30 pointer-events-none' : ''}`}
      onPointerDown={() => onActivate(id)}
    >
      <div className="flex justify-between text-xs items-center">
        <div className="group relative flex items-center gap-2 cursor-help">
          <label className={`font-semibold text-[10px] uppercase tracking-wider transition-colors ${isActive ? 'text-cyan-400' : 'text-slate-400'}`}>
            {label}
          </label>
          
          {/* Modern Tooltip */}
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 w-56 p-3 bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-xl text-xs text-slate-300 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none rounded-lg">
            <span className="block border-b border-slate-700 mb-1 pb-1 font-bold text-cyan-400">PARAMETER INFO</span>
            {tooltip}
          </div>
        </div>
        <span className={`font-mono text-[10px] transition-colors ${isActive ? 'text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'text-cyan-400/70'}`}>
          {value.toFixed(step < 0.1 ? 2 : 0)}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onFocus={() => onActivate(id)}
        className="w-full accent-cyan-500 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer hover:bg-slate-600 transition-colors"
        disabled={disabled}
      />
    </div>
  );
};

// Helper component for the dashboard bars
const StatBar: React.FC<{ label: string; value: number; colorClass: string }> = ({ label, value, colorClass }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-slate-400">
      <span>{label}</span>
      <span className="text-cyan-400 font-mono">{value.toFixed(1)}</span>
    </div>
    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden relative">
      <div 
        className={`h-full ${colorClass} shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-500 ease-out`} 
        style={{ width: `${value * 10}%` }}
      />
    </div>
  </div>
);

// Reusable AI Provider Control
const AiProviderControl: React.FC<{ params: AirfoilParams; updateParam: (k: keyof AirfoilParams, v: any) => void; compact?: boolean }> = ({ params, updateParam, compact }) => (
  <div className={`flex flex-col gap-2 ${compact ? 'mt-2 pt-2 border-t border-white/5' : ''}`}>
      <div className="flex bg-slate-900 rounded p-0.5 border border-white/10">
        <button
          onClick={() => updateParam('aiProvider', 'gemini')}
          className={`flex-1 py-1 px-2 rounded text-[9px] font-bold transition-colors ${params.aiProvider === 'gemini' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Cloud (Gemini)
        </button>
        <button
          onClick={() => updateParam('aiProvider', 'local')}
          className={`flex-1 py-1 px-2 rounded text-[9px] font-bold transition-colors ${params.aiProvider === 'local' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Local (LLM)
        </button>
      </div>
      {params.aiProvider === 'local' && (
          <input
              type="text"
              value={params.localEndpoint}
              onChange={(e) => updateParam('localEndpoint', e.target.value)}
              placeholder="http://localhost:8080/v1..."
              className="w-full bg-slate-950 border border-emerald-500/30 rounded px-2 py-1 text-[9px] text-emerald-300 placeholder-emerald-700/50 focus:outline-none focus:border-emerald-500"
          />
      )}
  </div>
);


const Controls: React.FC<ControlsProps> = ({ params, setParams, onUndo, onReset, canUndo, saveHistory }) => {
  const [analysis, setAnalysis] = useState<AnalysisResult>({ 
    loading: false, 
    error: undefined
  });

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [isDisplayCollapsed, setIsDisplayCollapsed] = useState(false); // Default to open for visibility
  
  // New States for AI Features
  const [analysisScenario, setAnalysisScenario] = useState("General Performance");
  const [aiDesignGoal, setAiDesignGoal] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  // Sculpt AI States
  const [shapePrompt, setShapePrompt] = useState("");
  const [isGeneratingShape, setIsGeneratingShape] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('aeroFlowPresets');
    if (saved) {
      try {
        setPresets(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load presets", e);
      }
    }
  }, []);

  const updateParam = (key: keyof AirfoilParams, value: number | string | boolean | any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handleAnalyze = async () => {
    setAnalysis({ loading: true });
    const result = await analyzeAirfoil(params, analysisScenario);
    if (result) {
      setAnalysis({ loading: false, data: result });
    } else {
      setAnalysis({ loading: false, error: "CONNECTION_FAILED" });
    }
  };

  const handleOptimize = async () => {
     if (!aiDesignGoal.trim()) return;
     if (saveHistory) saveHistory(); // Save before optimization
     setIsOptimizing(true);
     const result = await optimizeAirfoil(aiDesignGoal, params);
     if (result) {
        setParams(prev => ({
           ...prev,
           camber: result.camber ?? prev.camber,
           position: result.position ?? prev.position,
           thickness: result.thickness ?? prev.thickness,
           angle: result.angle ?? prev.angle,
           mode: 'naca' // Force back to NACA for parametric edits
        }));
     }
     setIsOptimizing(false);
  };
  
  const handleGenerateShape = async () => {
      if (!shapePrompt.trim()) return;
      if (saveHistory) saveHistory(); // Save before generation
      setIsGeneratingShape(true);
      const points = await generateProfilePoints(shapePrompt, params);
      if (points && points.length > 5) {
          setParams(prev => ({
              ...prev,
              mode: 'freeform',
              controlPoints: points
          }));
      }
      setIsGeneratingShape(false);
  };

  const applyShapePreset = (type: 'ducktail' | 'gtwing' | 'teardrop') => {
      if (saveHistory) saveHistory(); // Save before preset
      // Hardcoded 12-point approximate shapes
      let points = [...params.controlPoints];
      if (type === 'ducktail') {
          points = [
            {x:0,y:0}, {x:0.2,y:0.05}, {x:0.4,y:0.08}, {x:0.6,y:0.09}, {x:0.8,y:0.15}, {x:0.95,y:0.20}, 
            {x:1,y:0.20}, // High TE
            {x:0.2,y:-0.05}, {x:0.4,y:-0.08}, {x:0.6,y:-0.05}, {x:0.8,y:0.0}, {x:0.95,y:0.1}
          ];
      } else if (type === 'gtwing') {
          points = [
            {x:0,y:0}, {x:0.2,y:0.05}, {x:0.4,y:0.08}, {x:0.6,y:0.08}, {x:0.8,y:0.06}, {x:0.9,y:0.04},
            {x:1,y:0},
            {x:0.2,y:-0.15}, {x:0.4,y:-0.18}, {x:0.6,y:-0.15}, {x:0.8,y:-0.10}, {x:0.9,y:-0.05}
          ];
      } else if (type === 'teardrop') {
          points = [
            {x:0,y:0}, {x:0.1,y:0.15}, {x:0.3,y:0.15}, {x:0.5,y:0.10}, {x:0.7,y:0.05}, {x:0.9,y:0.02},
            {x:1,y:0},
            {x:0.1,y:-0.15}, {x:0.3,y:-0.15}, {x:0.5,y:-0.10}, {x:0.7,y:-0.05}, {x:0.9,y:-0.02}
          ];
      }
      setParams(prev => ({ ...prev, mode: 'freeform', controlPoints: points }));
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const newPreset: Preset = {
      id: Date.now().toString(),
      name: presetName.toUpperCase().replace(/\s+/g, '_'),
      params: { ...params },
      date: Date.now()
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem('aeroFlowPresets', JSON.stringify(updated));
    setPresetName("");
  };

  const handleLoadPreset = (preset: Preset) => {
    if (saveHistory) saveHistory();
    setParams(preset.params);
  };

  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem('aeroFlowPresets', JSON.stringify(updated));
  };

  const nacaCode = `NACA ${Math.round(params.camber)}${Math.round(params.position)}${Math.round(params.thickness).toString().padStart(2, '0')}`;

  return (
    <>
      {/* MAIN CONTROL PANEL CONTAINER (LEFT) */}
      <div className={`absolute top-4 left-4 z-10 w-80 font-sans text-xs transition-transform duration-300 ease-in-out ${isCollapsed ? '-translate-x-[calc(100%+2rem)]' : 'translate-x-0'}`}>
        
        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute top-0 -right-8 translate-x-full bg-slate-900/80 backdrop-blur-md border border-white/10 border-l-0 rounded-r-lg p-2 text-cyan-400 hover:text-white shadow-lg transition-colors flex items-center justify-center"
          title={isCollapsed ? "Expand Controls" : "Collapse Controls"}
        >
           {isCollapsed ? (
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
               <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
             </svg>
           ) : (
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
               <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
             </svg>
           )}
        </button>

        <div className="flex flex-col gap-4 max-h-[95vh]">
          {/* Main Control Unit */}
          <div className="bg-slate-950/80 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl overflow-y-auto custom-scrollbar max-h-[65vh] transition-colors duration-300">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-2">
                 {/* UNIVERSAL FLOW TOGGLE */}
                 <button 
                    onClick={() => updateParam('isFlowActive', !params.isFlowActive)}
                    className="group relative focus:outline-none"
                    title={params.isFlowActive ? "Stop Simulation" : "Start Simulation"}
                 >
                    <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor] transition-all duration-300 ${params.isFlowActive ? 'bg-cyan-500 text-cyan-500 animate-pulse' : 'bg-red-500/50 text-red-500'}`}></div>
                    <div className={`absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${params.isFlowActive ? 'bg-cyan-400 blur-sm' : 'bg-red-400 blur-sm'}`}></div>
                 </button>
                 
                 <h1 className="text-sm font-bold text-slate-100 tracking-wide cursor-default">
                   AERO_LAB <span className="text-cyan-500">V3</span>
                 </h1>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {params.mode === 'naca' ? nacaCode : "CUSTOM GEO"}
              </div>
            </div>
            
            <div className="p-4 space-y-6">
              {/* Mode Toggle */}
              <div className="bg-slate-900 p-1 rounded-lg flex">
                <button 
                  onClick={() => updateParam('mode', 'naca')}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all duration-200 ${
                    params.mode === 'naca' 
                      ? 'bg-cyan-950 text-cyan-400 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  NACA PARAMETRIC
                </button>
                <button 
                  onClick={() => updateParam('mode', 'freeform')}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all duration-200 ${
                    params.mode === 'freeform' 
                      ? 'bg-cyan-950 text-cyan-400 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  FREEFORM
                </button>
              </div>

              {/* AI Design Assistant - Only visible in NACA mode */}
              {params.mode === 'naca' && (
                <div className="border border-violet-500/30 bg-violet-950/10 rounded-lg p-3 space-y-2">
                   <div className="flex items-center justify-between mb-1">
                       <div className="flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-violet-400">
                          <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576L8.279 5.044A.75.75 0 019 4.5zM18 15a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 15z" clipRule="evenodd" />
                          </svg>
                          <span className="text-[10px] font-bold text-violet-300 uppercase">AI Design Assistant</span>
                       </div>
                   </div>
                   
                   <AiProviderControl params={params} updateParam={updateParam} />
                   
                   {/* Quick Templates */}
                   <div className="flex flex-wrap gap-1.5 mb-1 pt-1">
                      {AI_TEMPLATES.map((template) => (
                          <button
                              key={template.label}
                              onClick={() => setAiDesignGoal(template.prompt)}
                              className="px-2 py-1 bg-violet-900/40 hover:bg-violet-600/50 border border-violet-500/20 rounded text-[9px] text-violet-200 transition-colors"
                              title="Click to populate prompt"
                          >
                              {template.label}
                          </button>
                      ))}
                   </div>
  
                   <textarea 
                      value={aiDesignGoal}
                      onChange={(e) => setAiDesignGoal(e.target.value)}
                      placeholder="Describe your goal (e.g. 'High downforce for cornering')..."
                      className="w-full bg-slate-900/80 border border-violet-500/20 rounded p-2 text-[10px] text-slate-300 focus:border-violet-500 focus:outline-none resize-none h-16"
                   />
                   <button 
                      onClick={handleOptimize}
                      disabled={isOptimizing || !aiDesignGoal}
                      className="w-full py-1.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/50 text-violet-200 text-[10px] font-bold rounded transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                   >
                      {isOptimizing ? (
                         <>
                           <div className="w-2 h-2 bg-violet-300 rounded-full animate-bounce"></div>
                           <span>Optimizing via {params.aiProvider === 'local' ? 'Local' : 'Cloud'}...</span>
                         </>
                      ) : "Generate Configuration"}
                   </button>
                </div>
              )}

              {/* Geometry Section */}
              <div className="space-y-5">
                 <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/10"></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Geometry</span>
                    <div className="h-px flex-1 bg-white/10"></div>
                 </div>

                 {params.mode === 'freeform' ? (
                    <div className="space-y-3">
                        {/* AI SHAPE GENERATOR (Redesigned to match AI Design Assistant) */}
                        <div className="border border-violet-500/30 bg-violet-950/10 rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-violet-400">
                                        <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436-.067.052-.134.104-.201.158-.823 1.906-2.173 3.578-3.894 4.78-2.298 1.606-5.03 2.226-7.72 2.226a.75.75 0 01-.75-.75v-1.5c0-2.69.62-5.422 2.226-7.72.802-1.147 1.854-2.13 3.09-2.933a20.152 20.152 0 01.158-.201z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-[10px] font-bold text-violet-300 uppercase">AI Shape Generator</span>
                                </div>
                            </div>

                            <AiProviderControl params={params} updateParam={updateParam} />

                            <div className="flex flex-wrap gap-1.5 mb-1 pt-1">
                                {AI_SHAPE_PRESETS.map((preset) => (
                                    <button
                                        key={preset}
                                        onClick={() => setShapePrompt(preset)}
                                        className="px-2 py-1 bg-violet-900/40 hover:bg-violet-600/50 border border-violet-500/20 rounded text-[9px] text-violet-200 transition-colors"
                                        title="Click to populate prompt"
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                value={shapePrompt}
                                onChange={(e) => setShapePrompt(e.target.value)}
                                placeholder="Describe shape (e.g. 'Aggressive ducktail')..."
                                className="w-full bg-slate-900/80 border border-violet-500/20 rounded p-2 text-[10px] text-slate-300 focus:border-violet-500 focus:outline-none resize-none h-12"
                            />
                            
                            <button
                                onClick={handleGenerateShape}
                                disabled={isGeneratingShape || !shapePrompt}
                                className="w-full py-1.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/50 text-violet-200 text-[10px] font-bold rounded transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isGeneratingShape ? (
                                    <>
                                        <div className="w-2 h-2 bg-violet-300 rounded-full animate-bounce"></div>
                                        <span>Generating Geometry...</span>
                                    </>
                                ) : "Generate Geometry"}
                            </button>
                        </div>

                        {/* SCULPT MODE CONTROLS */}
                        <div className="border border-amber-900/30 rounded-lg p-3 bg-amber-950/10 text-amber-500 space-y-2">
                           <div className="flex justify-between items-center mb-2">
                             <p className="font-bold text-[10px]">SCULPT MODE</p>
                             <button 
                               onClick={() => updateParam('isEditing', !params.isEditing)}
                               className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                                 params.isEditing 
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                  : 'bg-transparent text-amber-700 border border-amber-900/50 hover:border-amber-700'
                               }`}
                             >
                               {params.isEditing ? "Done Editing" : "Edit Shape"}
                             </button>
                           </div>
                           
                           {/* Pause Flow Toggle */}
                           {params.isEditing && (
                             <>
                               <label className="flex items-center gap-2 cursor-pointer mb-3">
                                   <input 
                                       type="checkbox" 
                                       checked={params.pauseFlowDuringEdit}
                                       onChange={(e) => updateParam('pauseFlowDuringEdit', e.target.checked)}
                                       className="w-3 h-3 accent-amber-500 rounded"
                                   />
                                   <span className="text-[9px] text-amber-400/80 font-mono">HIDE FLOW WHILE EDITING</span>
                               </label>
                               
                               {/* UNDO / RESET BUTTONS */}
                               <div className="grid grid-cols-2 gap-2 border-t border-amber-900/20 pt-2">
                                 <button
                                    onClick={onUndo}
                                    disabled={!canUndo}
                                    className="flex items-center justify-center gap-1 py-1 bg-amber-900/30 hover:bg-amber-800/50 border border-amber-700/30 rounded text-[9px] text-amber-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    title="Undo last shape change"
                                 >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                      <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
                                    </svg>
                                    UNDO
                                 </button>
                                 <button
                                    onClick={onReset}
                                    className="flex items-center justify-center gap-1 py-1 bg-amber-900/30 hover:bg-red-900/30 border border-amber-700/30 hover:border-red-500/30 rounded text-[9px] text-amber-300 hover:text-red-300 transition-all"
                                    title="Reset to default shape"
                                 >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                    </svg>
                                    RESET
                                 </button>
                               </div>
                             </>
                           )}
                        </div>

                        {/* SHAPE PRESETS (Manual) */}
                        <div className="space-y-1">
                             <p className="text-[9px] font-bold text-slate-500 uppercase">Quick Shapes (Manual)</p>
                             <div className="flex gap-2">
                                 <button onClick={() => applyShapePreset('ducktail')} className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded text-[9px] text-slate-300">Ducktail</button>
                                 <button onClick={() => applyShapePreset('gtwing')} className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded text-[9px] text-slate-300">GT Wing</button>
                                 <button onClick={() => applyShapePreset('teardrop')} className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded text-[9px] text-slate-300">Teardrop</button>
                             </div>
                        </div>

                        {/* Angle of Attack Slider - Positioned at bottom of Freeform section */}
                        <SliderWithTooltip
                            id="angle"
                            activeId={activeId}
                            onActivate={setActiveId}
                            label="Angle of Attack"
                            tooltip="Negative values create downforce (typical for spoilers)."
                            value={params.angle}
                            min={-25}
                            max={15}
                            step={1}
                            unit="°"
                            onChange={(v) => updateParam('angle', v)}
                        />
                    </div>
                 ) : (
                   <>
                      {/* Angle of Attack Slider - Positioned at top of NACA section */}
                      <SliderWithTooltip
                        id="angle"
                        activeId={activeId}
                        onActivate={setActiveId}
                        label="Angle of Attack"
                        tooltip="Negative values create downforce (typical for spoilers)."
                        value={params.angle}
                        min={-25}
                        max={15}
                        step={1}
                        unit="°"
                        onChange={(v) => updateParam('angle', v)}
                      />

                      <SliderWithTooltip
                        id="camber"
                        activeId={activeId}
                        onActivate={setActiveId}
                        label="Camber (Curvature)"
                        tooltip="Controls the asymmetry of the airfoil."
                        value={params.camber}
                        min={0}
                        max={9}
                        step={1}
                        unit="%"
                        onChange={(v) => updateParam('camber', v)}
                      />

                      <SliderWithTooltip
                        id="position"
                        activeId={activeId}
                        onActivate={setActiveId}
                        label="Camber Position"
                        tooltip="Where the maximum curvature occurs along the chord."
                        value={params.position}
                        min={0}
                        max={9}
                        step={1}
                        onChange={(v) => updateParam('position', v)}
                      />

                      <SliderWithTooltip
                        id="thickness"
                        activeId={activeId}
                        onActivate={setActiveId}
                        label="Thickness"
                        tooltip="Maximum thickness of the wing profile."
                        value={params.thickness}
                        min={1}
                        max={40}
                        step={1}
                        unit="%"
                        onChange={(v) => updateParam('thickness', v)}
                      />
                   </>
                 )}
              </div>

               {/* Presets Section */}
               <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/10"></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">User Presets</span>
                    <div className="h-px flex-1 bg-white/10"></div>
                 </div>
                
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Preset Name..."
                    value={presetName}
                    onFocus={() => setActiveId('preset_input')}
                    onChange={(e) => setPresetName(e.target.value)}
                    className={`bg-slate-900 border rounded px-3 py-1.5 flex-1 text-slate-300 focus:outline-none text-[10px] transition-colors ${activeId === 'preset_input' ? 'border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]' : 'border-white/10 placeholder-slate-700'}`}
                  />
                  <button 
                    onClick={handleSavePreset}
                    disabled={!presetName}
                    className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 font-bold text-[10px] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    SAVE
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-24 overflow-y-auto custom-scrollbar pr-1 min-h-[2rem]">
                  {/* User Presets */}
                  {presets.length === 0 ? (
                      <p className="col-span-2 text-[9px] text-slate-600 text-center italic py-2">No saved presets yet.</p>
                  ) : (
                    presets.map(p => (
                        <div key={p.id} className="group flex items-center justify-between bg-slate-800/50 border border-white/5 rounded px-2 py-1.5 hover:border-cyan-500/30 transition-colors cursor-pointer" onClick={() => handleLoadPreset(p)}>
                        <span className="text-[10px] text-slate-300 hover:text-cyan-300 truncate flex-1 text-left">
                            {p.name.replace(/_/g, ' ')}
                        </span>
                        <button 
                            onClick={(e) => handleDeletePreset(p.id, e)}
                            className="text-slate-600 hover:text-red-400 ml-2 opacity-0 group-hover:opacity-100 transition-opacity px-1"
                        >
                            ×
                        </button>
                        </div>
                    ))
                  )}
                </div>

                <button 
                   onClick={() => exportToOBJ(params)}
                   className="w-full py-2 mt-2 border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 rounded text-[10px] font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                      <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                    </svg>
                   Export .OBJ
                </button>
              </div>
            </div>
          </div>

          {/* Analysis Card */}
          <div className="bg-slate-950/80 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl flex-1 flex flex-col min-h-[200px] overflow-hidden relative">
            <div className="flex flex-col px-4 py-3 border-b border-white/10 bg-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aerodynamic Analysis</h2>
                 <button 
                     onClick={() => setShowAiSettings(!showAiSettings)}
                     className={`p-1.5 rounded border transition-all ${showAiSettings ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-white/10 hover:text-white'}`}
                     title="AI Settings"
                  >
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                       <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                     </svg>
                  </button>
              </div>
              
              <div className="flex gap-2">
                 <select 
                   value={analysisScenario}
                   onChange={(e) => setAnalysisScenario(e.target.value)}
                   className="flex-1 bg-slate-900 border border-white/10 rounded px-2 py-1 text-[9px] text-slate-300 focus:outline-none focus:border-cyan-500"
                 >
                    <option>General Performance</option>
                    <option>High Downforce Circuit</option>
                    <option>Low Drag / Top Speed</option>
                    <option>Efficiency / Eco</option>
                 </select>
                 <button
                    onClick={handleAnalyze}
                    disabled={analysis.loading}
                    className="px-3 py-1 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-[10px] font-bold rounded shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                  >
                    {analysis.loading ? "..." : "Run"}
                  </button>
              </div>
            </div>
            
            {/* AI Settings Drawer */}
            {showAiSettings && (
               <div className="bg-slate-900 p-3 border-b border-white/10 space-y-3 animate-in slide-in-from-top-2">
                  <div className="flex gap-2">
                     <button
                        onClick={() => updateParam('aiProvider', 'gemini')}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded border transition-colors ${params.aiProvider === 'gemini' ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' : 'bg-slate-800 border-white/5 text-slate-500 hover:text-slate-300'}`}
                     >
                        Cloud (Gemini)
                     </button>
                     <button
                        onClick={() => updateParam('aiProvider', 'local')}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded border transition-colors ${params.aiProvider === 'local' ? 'bg-emerald-900/50 border-emerald-500 text-emerald-300' : 'bg-slate-800 border-white/5 text-slate-500 hover:text-slate-300'}`}
                     >
                        Local (Llama.cpp)
                     </button>
                  </div>
                  {params.aiProvider === 'local' && (
                     <div className="space-y-1">
                        <label className="text-[9px] text-slate-500 uppercase font-bold">Endpoint URL</label>
                        <input 
                           type="text" 
                           value={params.localEndpoint}
                           onChange={(e) => updateParam('localEndpoint', e.target.value)}
                           className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-slate-300 focus:border-emerald-500 focus:outline-none"
                           placeholder="http://localhost:8080/v1/chat/completions"
                        />
                     </div>
                  )}
               </div>
            )}
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-slate-900/30">
               {analysis.loading ? (
                 <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-70">
                   <div className={`w-6 h-6 border-2 ${params.aiProvider === 'local' ? 'border-emerald-500' : 'border-cyan-500'} border-t-transparent rounded-full animate-spin`}></div>
                   <div className={`text-xs ${params.aiProvider === 'local' ? 'text-emerald-400' : 'text-cyan-400'} font-mono animate-pulse`}>
                      {params.aiProvider === 'local' ? 'Querying Local LLM...' : 'Computing Cloud CFD...'}
                   </div>
                 </div>
               ) : analysis.data ? (
                 <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Metric Bars */}
                    <div className="space-y-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
                      <StatBar 
                        label="Downforce" 
                        value={analysis.data.downforce} 
                        colorClass="bg-gradient-to-r from-cyan-600 to-cyan-400"
                      />
                      <StatBar 
                        label="Efficiency" 
                        value={analysis.data.drag} 
                        colorClass="bg-gradient-to-r from-emerald-600 to-emerald-400"
                      />
                      <StatBar 
                        label="Stability" 
                        value={analysis.data.stability} 
                        colorClass="bg-gradient-to-r from-violet-600 to-violet-400"
                      />
                    </div>

                     {/* Secondary Metrics Grid */}
                     <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-900/50 rounded border border-white/5 p-2 text-center">
                          <p className="text-[9px] text-slate-500 font-bold uppercase">L/D Ratio</p>
                          <p className="text-sm font-mono text-white font-bold">{analysis.data.liftToDrag?.toFixed(2) ?? "N/A"}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded border border-white/5 p-2 text-center">
                           <p className="text-[9px] text-slate-500 font-bold uppercase">CFD Cost</p>
                           <div className="w-full bg-slate-800 h-1 rounded-full mt-1.5 overflow-hidden">
                              <div className="h-full bg-amber-500" style={{ width: `${analysis.data.flowComplexity ?? 0}%` }} />
                           </div>
                        </div>
                     </div>

                    {/* Summary Text */}
                    <div className="space-y-4">
                       <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Summary</p>
                          <p className="text-xs text-slate-200 leading-relaxed">{analysis.data.summary}</p>
                       </div>
                       
                       <div className="flex items-center justify-between">
                          <div className="flex-1 mr-2">
                             <div className="bg-cyan-500/10 border-l-2 border-cyan-500 pl-3 py-1">
                                <p className="text-xs text-cyan-300 font-medium">{analysis.data.recommendation}</p>
                             </div>
                          </div>
                          <button 
                            onClick={() => setShowFullScreen(true)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded border border-white/10 text-slate-400 hover:text-white transition-colors"
                            title="View Extensive Report"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                            </svg>
                          </button>
                       </div>
                    </div>
                 </div>
               ) : (
                 <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs text-center space-y-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 opacity-20">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                    <p>Ready for analysis.</p>
                    {analysis.error && (
                       <p className="text-red-400 bg-red-950/30 px-2 py-1 rounded border border-red-900/50">
                          {analysis.error === "CONNECTION_FAILED" ? "Connection Error" : "Analysis Failed"}
                       </p>
                    )}
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* INDEPENDENT VISUALIZATION PANEL (TOP RIGHT) */}
      <div className="absolute top-4 right-4 z-10 w-64 flex flex-col gap-2 font-sans">
         <div className="bg-slate-950/80 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl overflow-hidden">
             <button 
                onClick={() => setIsDisplayCollapsed(!isDisplayCollapsed)}
                className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition-colors text-left"
             >
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Visual Settings</span>
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${isDisplayCollapsed ? 'rotate-180' : ''}`}>
                   <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                 </svg>
             </button>

             {!isDisplayCollapsed && (
                <div className="p-3 space-y-4 border-t border-white/5">
                     <SliderWithTooltip
                        id="flowSpeed"
                        activeId={activeId}
                        onActivate={setActiveId}
                        label="Flow Speed"
                        tooltip="Simulation velocity multiplier."
                        value={params.flowSpeed}
                        min={0.05}
                        max={0.5}
                        step={0.01}
                        onChange={(v) => updateParam('flowSpeed', v)}
                     />

                     <SliderWithTooltip
                        id="particleCount"
                        activeId={activeId}
                        onActivate={setActiveId}
                        label="Particle Density"
                        tooltip="Number of particles in simulation. High values may reduce performance."
                        value={params.particleCount}
                        min={1000}
                        max={10000}
                        step={500}
                        onChange={(v) => updateParam('particleCount', v)}
                     />

                     <SliderWithTooltip
                        id="turbulenceIntensity"
                        activeId={activeId}
                        onActivate={setActiveId}
                        label="Turbulence"
                        tooltip="Intensity of wake vortices and chaos."
                        value={params.turbulenceIntensity}
                        min={0}
                        max={3}
                        step={0.1}
                        onChange={(v) => updateParam('turbulenceIntensity', v)}
                     />

                     <div className="grid grid-cols-2 gap-2">
                        <button 
                           onClick={() => {
                              updateParam('flowType', params.flowType === 'steam' ? 'discrete' : 'steam');
                              setActiveId('flowType');
                           }}
                           className={`px-2 py-2 text-[10px] font-bold rounded border transition-all duration-300 ${
                             params.flowType === 'steam' 
                               ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                               : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                           }`}
                        >
                          {params.flowType === 'steam' ? 'Steam' : 'Particles'}
                        </button>

                        <button 
                           onClick={() => {
                              updateParam('showVortices', !params.showVortices);
                              setActiveId('showVortices');
                           }}
                           className={`px-2 py-2 text-[10px] font-bold rounded border transition-all duration-300 ${
                             params.showVortices 
                               ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                               : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                           }`}
                        >
                           Vortices: {params.showVortices ? 'On' : 'Off'}
                        </button>
                        
                        <button 
                           onClick={() => {
                              updateParam('showWireframe', !params.showWireframe);
                              setActiveId('showWireframe');
                           }}
                           className={`px-2 py-2 text-[10px] font-bold rounded border transition-all duration-300 ${
                             params.showWireframe 
                               ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                               : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                           }`}
                        >
                           Wireframe: {params.showWireframe ? 'On' : 'Off'}
                        </button>
                        
                        <button 
                           onClick={() => {
                              updateParam('showHeatmap', !params.showHeatmap);
                              setActiveId('showHeatmap');
                           }}
                           className={`px-2 py-2 text-[10px] font-bold rounded border transition-all duration-300 ${
                             params.showHeatmap 
                               ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                               : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                           }`}
                        >
                           Heatmap: {params.showHeatmap ? 'On' : 'Off'}
                        </button>
                     </div>
                </div>
             )}
         </div>
      </div>

      {/* FULL SCREEN REPORT MODAL */}
      {showFullScreen && analysis.data && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-lg flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-5xl h-full max-h-[80vh] flex flex-col overflow-hidden relative">
               {/* Close Button */}
               <button 
                 onClick={() => setShowFullScreen(false)}
                 className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-all z-20"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
               </button>

               {/* Modal Header */}
               <div className="p-8 border-b border-white/5 bg-gradient-to-r from-slate-900 to-slate-800">
                  <h2 className="text-2xl font-bold text-white mb-2">Detailed Aerodynamic Report</h2>
                  <div className="flex gap-4 text-sm text-slate-400 font-mono">
                     <span>CFD_SIM_ID: {Date.now().toString().slice(-8)}</span>
                     <span className="text-cyan-500">CONFIG: {params.mode === 'naca' ? nacaCode : "CUSTOM"}</span>
                     <span className="text-violet-400">SCENARIO: {analysisScenario}</span>
                     {params.aiProvider === 'local' && <span className="text-emerald-500">PROVIDER: LOCAL</span>}
                  </div>
               </div>

               {/* Modal Body */}
               <div className="flex-1 overflow-y-auto custom-scrollbar p-8 grid grid-cols-3 gap-8">
                  
                  {/* Left Column: Visuals & Core Stats */}
                  <div className="col-span-1 space-y-8">
                     <div className="bg-slate-800/50 rounded-xl p-6 border border-white/5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Polar Visualization (L/D)</h3>
                        {/* Mock Polar Chart using SVG */}
                        <div className="relative h-48 w-full flex items-center justify-center">
                           <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                              <circle cx="50" cy="50" r="45" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 2" />
                              <circle cx="50" cy="50" r="30" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 2" />
                              <line x1="50" y1="5" x2="50" y2="95" stroke="#475569" strokeWidth="1" />
                              <line x1="5" y1="50" x2="95" y2="50" stroke="#475569" strokeWidth="1" />
                              
                              {/* Data Vector */}
                              <path 
                                d={`M 50 50 L ${50 + (analysis.data.drag * 3)} ${50 - (analysis.data.downforce * 3)}`} 
                                stroke="#06b6d4" 
                                strokeWidth="2" 
                                markerEnd="url(#arrow)"
                              />
                              <circle cx={50 + (analysis.data.drag * 3)} cy={50 - (analysis.data.downforce * 3)} r="2" fill="#22d3ee" />
                              
                              <defs>
                                <marker id="arrow" markerWidth="10" markerHeight="10" refX="0" refY="3" orient="auto" markerUnits="strokeWidth">
                                  <path d="M0,0 L0,6 L9,3 z" fill="#06b6d4" />
                                </marker>
                              </defs>
                           </svg>
                           <div className="absolute top-0 text-[10px] text-slate-500">Lift/Downforce</div>
                           <div className="absolute right-0 text-[10px] text-slate-500">Drag</div>
                        </div>
                        <div className="text-center mt-2">
                           <p className="text-2xl font-bold text-cyan-400">{analysis.data.liftToDrag?.toFixed(2)}</p>
                           <p className="text-[10px] text-slate-500 uppercase">L/D Ratio</p>
                        </div>
                     </div>

                     <div className="bg-slate-800/50 rounded-xl p-6 border border-white/5">
                         <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Performance Scores</h3>
                         <div className="space-y-4">
                            <StatBar label="Downforce" value={analysis.data.downforce} colorClass="bg-cyan-500" />
                            <StatBar label="Drag Efficiency" value={analysis.data.drag} colorClass="bg-emerald-500" />
                            <StatBar label="Stability" value={analysis.data.stability} colorClass="bg-violet-500" />
                            <StatBar label="Complexity Cost" value={analysis.data.flowComplexity / 10} colorClass="bg-amber-500" />
                         </div>
                     </div>
                  </div>

                  {/* Right Column: Detailed Text Analysis */}
                  <div className="col-span-2 space-y-6">
                     <div className="bg-slate-800/30 rounded-xl p-6 border border-white/5">
                        <h3 className="text-sm font-bold text-cyan-400 uppercase mb-3 flex items-center gap-2">
                           <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                           Executive Summary
                        </h3>
                        <p className="text-slate-300 leading-relaxed text-lg font-light">
                           "{analysis.data.summary}"
                        </p>
                     </div>

                     <div className="bg-slate-800/30 rounded-xl p-6 border border-white/5">
                        <h3 className="text-sm font-bold text-amber-400 uppercase mb-3 flex items-center gap-2">
                           <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                           Computational Physics Analysis
                        </h3>
                        <p className="text-slate-300 leading-loose text-sm font-mono">
                           {analysis.data.extensiveReport || "Detailed physics analysis not available for this configuration."}
                        </p>
                     </div>

                     <div className="grid grid-cols-2 gap-6">
                        <div className="bg-slate-800/30 rounded-xl p-6 border border-white/5">
                           <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Recommended Application</h3>
                           <p className="text-white text-base font-medium">{analysis.data.recommendation}</p>
                        </div>
                        <div className="bg-slate-800/30 rounded-xl p-6 border border-white/5">
                           <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Simulation Parameters</h3>
                           <div className="text-xs text-slate-400 space-y-1 font-mono">
                              <p>AoA: {params.angle}°</p>
                              <p>Flow Velocity: Mach {params.flowSpeed.toFixed(2)} (Sim)</p>
                              <p>Reynolds Number: Re_{Math.round(params.particleCount / 10)}k</p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
           </div>
        </div>
      )}
    </>
  );
};

export default Controls;