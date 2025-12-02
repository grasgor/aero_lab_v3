import React, { useState, useEffect } from 'react';
import { AirfoilParams, AnalysisResult, Preset } from '../types';
import { analyzeAirfoil, optimizeAirfoil, generateProfilePoints } from '../services/geminiService';
import { exportToOBJ } from '../utils/export';
import { TRACK_DATA } from '../utils/tracks';
import RadarChart from './RadarChart';
import PolarGraph from './PolarGraph';

interface ControlsProps {
  params: AirfoilParams;
  setParams: React.Dispatch<React.SetStateAction<AirfoilParams>>;
  onUndo?: () => void;
  onReset?: () => void;
  canUndo?: boolean;
  saveHistory?: () => void;
  onSubdivide?: () => void;
  onSmooth?: () => void;
  defaultSystemPrompt: string;
  defaultNacaSystemPrompt: string;
  defaultFreeformSystemPrompt: string;
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

const CHAT_TEMPLATES = [
  "General Performance", "Check High-Speed Stability", "Analyze Low-Speed Grip"
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
        className={`h-full ${colorClass} transition-all duration-500 ease-out`} 
        style={{ width: `${value * 10}%` }}
      />
    </div>
  </div>
);

const Controls: React.FC<ControlsProps> = ({ 
  params, setParams, onUndo, onReset, canUndo, saveHistory, onSubdivide, onSmooth, 
  defaultSystemPrompt, defaultNacaSystemPrompt, defaultFreeformSystemPrompt
}) => {
  const [analysis, setAnalysis] = useState<AnalysisResult>({ 
    loading: false, 
    error: undefined
  });

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDisplayCollapsed, setIsDisplayCollapsed] = useState(true);
  
  const [analysisScenario, setAnalysisScenario] = useState("General Performance");
  const [selectedTrack, setSelectedTrack] = useState<string>('none');
  const [aiDesignGoal, setAiDesignGoal] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  const [shapePrompt, setShapePrompt] = useState("");
  const [isGeneratingShape, setIsGeneratingShape] = useState(false);

  const [isTrackReportCollapsed, setIsTrackReportCollapsed] = useState(true);
  
  const [editingPrompt, setEditingPrompt] = useState<{
    key: 'systemPrompt' | 'nacaDesignSystemPrompt' | 'freeformDesignSystemPrompt';
    title: string;
    defaultValue: string;
  } | null>(null);

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
    const result = await analyzeAirfoil(params, analysisScenario, selectedTrack);
    if (result) {
      setAnalysis({ loading: false, data: result });
    } else {
      setAnalysis({ loading: false, error: "CONNECTION_FAILED" });
    }
  };

  const handleOptimize = async () => {
     if (!aiDesignGoal.trim()) return;
     if (saveHistory) saveHistory();
     setIsOptimizing(true);
     const result = await optimizeAirfoil(aiDesignGoal, params);
     if (result) {
        setParams(prev => ({
           ...prev,
           camber: result.camber ?? prev.camber,
           position: result.position ?? prev.position,
           thickness: result.thickness ?? prev.thickness,
           angle: result.angle ?? prev.angle,
           mode: 'naca'
        }));
     }
     setIsOptimizing(false);
  };
  
  const handleGenerateShape = async () => {
      if (!shapePrompt.trim()) return;
      if (saveHistory) saveHistory();
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
      if (saveHistory) saveHistory();
      let points = [...params.controlPoints];
      if (type === 'ducktail') {
          points = [
            {x:0,y:0}, {x:0.2,y:0.05}, {x:0.4,y:0.08}, {x:0.6,y:0.09}, {x:0.8,y:0.15}, {x:0.95,y:0.20}, 
            {x:1,y:0.20}, 
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
        
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute top-0 -right-8 translate-x-full bg-slate-900/80 backdrop-blur-md border border-white/10 border-l-0 rounded-r-lg p-2 text-cyan-400 hover:text-white shadow-lg transition-colors flex items-center justify-center"
          title={isCollapsed ? "Expand Controls" : "Collapse Controls"}
        >
           {isCollapsed ? (
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
           ) : (
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
           )}
        </button>

        <div className="flex flex-col gap-4 max-h-[95vh]">
          {/* Main Control Unit */}
          <div className="bg-slate-950/80 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl overflow-y-auto custom-scrollbar max-h-[95vh] transition-colors duration-300">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-2">
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
            
            <div className="p-4 space-y-4">
              {/* UNIFIED AI PROVIDER CONTROL */}
              <div className="border border-slate-700 bg-slate-900/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Provider</h3>
                  <span className={`text-[10px] font-bold py-0.5 px-2 rounded-full ${params.aiProvider === 'gemini' ? 'bg-violet-600/20 text-violet-300' : 'bg-emerald-600/20 text-emerald-300'}`}>
                    {params.aiProvider === 'gemini' ? 'Cloud' : 'Local'}
                  </span>
                </div>
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
                        placeholder="http://localhost:3001/v1..."
                        className="w-full bg-slate-950 border border-emerald-500/30 rounded px-2 py-1 text-[9px] text-emerald-300 placeholder-emerald-700/50 focus:outline-none focus:border-emerald-500"
                    />
                )}
              </div>

              <div className="bg-slate-900 p-1 rounded-lg flex">
                <button onClick={() => updateParam('mode', 'naca')} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all duration-200 ${params.mode === 'naca' ? 'bg-cyan-950 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>NACA PARAMETRIC</button>
                <button onClick={() => updateParam('mode', 'freeform')} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all duration-200 ${params.mode === 'freeform' ? 'bg-cyan-950 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>FREEFORM</button>
              </div>

              {params.mode === 'naca' && (
                <div className="space-y-4">
                   <div className="border border-violet-500/30 bg-violet-950/10 rounded-lg p-3 space-y-2">
                       <div className="flex items-center justify-between mb-1">
                           <div className="flex items-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-violet-400"><path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576L8.279 5.044A.75.75 0 019 4.5zM18 15a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 15z" clipRule="evenodd" /></svg>
                              <span className="text-[10px] font-bold text-violet-300 uppercase">AI Design Assistant</span>
                           </div>
                       </div>
                       <div className="flex flex-wrap gap-1.5 mb-1 pt-1">
                          {AI_TEMPLATES.map((template) => (<button key={template.label} onClick={() => setAiDesignGoal(template.prompt)} className="px-2 py-1 bg-violet-900/40 hover:bg-violet-600/50 border border-violet-500/20 rounded text-[9px] text-violet-200 transition-colors">{template.label}</button>))}
                       </div>
                       <textarea value={aiDesignGoal} onChange={(e) => setAiDesignGoal(e.target.value)} placeholder="Describe your goal (e.g., 'a low-drag setup for Monza')..." className="w-full bg-slate-900/80 border border-violet-500/20 rounded p-2 text-[10px] text-slate-300 focus:border-violet-500 focus:outline-none resize-none h-16"/>
                       <div className="border-t border-violet-500/20 pt-2 flex justify-end">
                           <button
                             onClick={() => setEditingPrompt({
                               key: 'nacaDesignSystemPrompt',
                               title: 'NACA Design System Prompt',
                               defaultValue: defaultNacaSystemPrompt
                             })}
                             className="text-[9px] text-slate-500 hover:text-violet-400 font-bold uppercase tracking-wider transition-colors"
                           >
                             Edit System Prompt
                           </button>
                       </div>
                       <button onClick={handleOptimize} disabled={isOptimizing || !aiDesignGoal} className="w-full mt-2 py-1.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/50 text-violet-200 text-[10px] font-bold rounded transition-all disabled:opacity-50 flex items-center justify-center gap-2">{isOptimizing ? "Optimizing..." : "Generate Configuration"}</button>
                    </div>
                    
                    <div className="flex items-center gap-2"><div className="h-px flex-1 bg-white/10"></div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Geometry</span><div className="h-px flex-1 bg-white/10"></div></div>
                    <SliderWithTooltip id="angle" activeId={activeId} onActivate={setActiveId} label="Angle of Attack" tooltip="Negative values create downforce." value={params.angle} min={-50} max={20} step={1} unit="°" onChange={(v) => updateParam('angle', v)} />
                    <SliderWithTooltip id="camber" activeId={activeId} onActivate={setActiveId} label="Camber (Curvature)" tooltip="Controls the asymmetry of the airfoil." value={params.camber} min={0} max={9} step={1} unit="%" onChange={(v) => updateParam('camber', v)} />
                    <SliderWithTooltip id="position" activeId={activeId} onActivate={setActiveId} label="Camber Position" tooltip="Where the maximum curvature occurs." value={params.position} min={0} max={9} step={1} onChange={(v) => updateParam('position', v)} />
                    <SliderWithTooltip id="thickness" activeId={activeId} onActivate={setActiveId} label="Thickness" tooltip="Maximum thickness of the wing profile." value={params.thickness} min={1} max={40} step={1} unit="%" onChange={(v) => updateParam('thickness', v)} />
                </div>
              )}

              {params.mode === 'freeform' && (
                <div className="space-y-4">
                  <div className="border border-violet-500/30 bg-violet-950/10 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-violet-400"><path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436-.067.052-.134.104-.201.158-.823 1.906-2.173 3.578-3.894 4.78-2.298 1.606-5.03 2.226-7.72 2.226a.75.75 0 01-.75-.75v-1.5c0-2.69.62-5.422 2.226-7.72.802-1.147 1.854-2.13 3.09-2.933a20.152 20.152 0 01.158-.201z" clipRule="evenodd" /></svg>
                              <span className="text-[10px] font-bold text-violet-300 uppercase">AI Shape Generator</span>
                          </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-1 pt-1">
                          {AI_SHAPE_PRESETS.map((preset) => (<button key={preset} onClick={() => setShapePrompt(preset)} className="px-2 py-1 bg-violet-900/40 hover:bg-violet-600/50 border border-violet-500/20 rounded text-[9px] text-violet-200 transition-colors">{preset}</button>))}
                      </div>
                      <textarea value={shapePrompt} onChange={(e) => setShapePrompt(e.target.value)} placeholder="Describe shape (e.g., 'a dual-element wing for Spa')..." className="w-full bg-slate-900/80 border border-violet-500/20 rounded p-2 text-[10px] text-slate-300 focus:border-violet-500 focus:outline-none resize-none h-12" />
                       <div className="border-t border-violet-500/20 pt-2 flex justify-end">
                           <button
                             onClick={() => setEditingPrompt({
                               key: 'freeformDesignSystemPrompt',
                               title: 'Freeform Design System Prompt',
                               defaultValue: defaultFreeformSystemPrompt
                             })}
                             className="text-[9px] text-slate-500 hover:text-violet-400 font-bold uppercase tracking-wider transition-colors"
                           >
                             Edit System Prompt
                           </button>
                       </div>
                      <button onClick={handleGenerateShape} disabled={isGeneratingShape || !shapePrompt} className="w-full mt-2 py-1.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/50 text-violet-200 text-[10px] font-bold rounded transition-all disabled:opacity-50 flex items-center justify-center gap-2">{isGeneratingShape ? "Generating Geometry..." : "Generate Geometry"}</button>
                  </div>
                  <div className="border border-amber-900/30 rounded-lg p-3 bg-amber-950/10 text-amber-500 space-y-2">
                     <div className="flex justify-between items-center mb-2"><p className="font-bold text-[10px]">SCULPT MODE</p><button onClick={() => updateParam('isEditing', !params.isEditing)} className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${params.isEditing ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50' : 'bg-transparent text-amber-700 border border-amber-900/50 hover:border-amber-700'}`}>{params.isEditing ? "Done Editing" : "Edit Shape"}</button></div>
                     {params.isEditing && (<>
                       <label className="flex items-center gap-2 cursor-pointer mb-3"><input type="checkbox" checked={params.pauseFlowDuringEdit} onChange={(e) => updateParam('pauseFlowDuringEdit', e.target.checked)} className="w-3 h-3 accent-amber-500 rounded"/><span className="text-[9px] text-amber-400/80 font-mono">HIDE FLOW WHILE EDITING</span></label>
                       <div className="grid grid-cols-2 gap-2 border-t border-amber-900/20 pt-2"><button onClick={onSubdivide} className="py-1 bg-amber-900/30 hover:bg-amber-800/50 border border-amber-700/30 rounded text-[9px] text-amber-300 transition-all" title="Add detail (subdivide)">SUBDIVIDE</button><button onClick={onSmooth} className="py-1 bg-amber-900/30 hover:bg-amber-800/50 border border-amber-700/30 rounded text-[9px] text-amber-300 transition-all" title="Relax shape">SMOOTH</button></div>
                       <p className="text-[8px] text-amber-700 text-center italic mt-1">Double-click handle to delete point</p>
                       <div className="grid grid-cols-2 gap-2 border-t border-amber-900/20 pt-2 mt-2"><button onClick={onUndo} disabled={!canUndo} className="flex items-center justify-center gap-1 py-1 bg-amber-900/30 hover:bg-amber-800/50 border border-amber-700/30 rounded text-[9px] text-amber-300 disabled:opacity-30">UNDO</button><button onClick={onReset} className="flex items-center justify-center gap-1 py-1 bg-amber-900/30 hover:bg-red-900/30 border border-amber-700/30 hover:border-red-500/30 rounded text-[9px] text-amber-300 hover:text-red-300">RESET</button></div>
                     </>)}
                  </div>
                  <div className="space-y-1"><p className="text-[9px] font-bold text-slate-500 uppercase">Quick Shapes (Manual)</p><div className="flex gap-2"><button onClick={() => applyShapePreset('ducktail')} className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded text-[9px] text-slate-300">Ducktail</button><button onClick={() => applyShapePreset('gtwing')} className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded text-[9px] text-slate-300">GT Wing</button><button onClick={() => applyShapePreset('teardrop')} className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded text-[9px] text-slate-300">Teardrop</button></div></div>
                  <SliderWithTooltip id="angle" activeId={activeId} onActivate={setActiveId} label="Angle of Attack" tooltip="Negative values create downforce." value={params.angle} min={-25} max={15} step={1} unit="°" onChange={(v) => updateParam('angle', v)} />
                </div>
              )}

               <div className="space-y-3">
                <div className="flex items-center gap-2"><div className="h-px flex-1 bg-white/10"></div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">User Presets</span><div className="h-px flex-1 bg-white/10"></div></div>
                <div className="flex gap-2">
                  <input type="text" placeholder="Preset Name..." value={presetName} onFocus={() => setActiveId('preset_input')} onChange={(e) => setPresetName(e.target.value)} className={`bg-slate-900 border rounded px-3 py-1.5 flex-1 text-slate-300 focus:outline-none text-[10px] transition-colors ${activeId === 'preset_input' ? 'border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]' : 'border-white/10 placeholder-slate-700'}`} />
                  <button onClick={handleSavePreset} disabled={!presetName} className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 font-bold text-[10px] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">SAVE</button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-24 overflow-y-auto custom-scrollbar pr-1 min-h-[2rem]">
                  {presets.length === 0 ? (<p className="col-span-2 text-[9px] text-slate-600 text-center italic py-2">No saved presets yet.</p>) : (presets.map(p => (<div key={p.id} className="group flex items-center justify-between bg-slate-800/50 border border-white/5 rounded px-2 py-1.5 hover:border-cyan-500/30 transition-colors cursor-pointer" onClick={() => handleLoadPreset(p)}><span className="text-[10px] text-slate-300 hover:text-cyan-300 truncate flex-1 text-left">{p.name.replace(/_/g, ' ')}</span><button onClick={(e) => handleDeletePreset(p.id, e)} className="text-slate-600 hover:text-red-400 ml-2 opacity-0 group-hover:opacity-100 transition-opacity px-1">×</button></div>)))}
                </div>
                <button onClick={() => exportToOBJ(params)} className="w-full py-2 mt-2 border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 rounded text-[10px] font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2">Export .OBJ</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* INDEPENDENT VISUALIZATION PANEL (TOP RIGHT) */}
      <div className="absolute top-4 right-4 z-10 w-80 flex flex-col gap-2 font-sans">
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
                        max={15000}
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
         <div className="bg-slate-950/80 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl flex-1 flex flex-col min-h-[200px] overflow-hidden relative">
             <div className="flex flex-col px-4 py-3 border-b border-white/10 bg-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aerodynamic Analysis</h2>
                 <button
                   onClick={() => setEditingPrompt({
                     key: 'systemPrompt',
                     title: 'Analysis System Prompt',
                     defaultValue: defaultSystemPrompt
                   })}
                   className="text-[9px] text-slate-400 hover:text-cyan-400 font-bold uppercase tracking-wider transition-colors"
                 >
                   Edit Prompt
                 </button>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                 <div className="grid grid-cols-2 gap-2">
                    <select
                        value={selectedTrack}
                        onChange={e => setSelectedTrack(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-[9px] text-slate-300 focus:outline-none focus:border-cyan-500"
                    >
                        <option value="none">Track: None (General)</option>
                        {TRACK_DATA.map(track => (
                            <option key={track.name} value={track.name}>{track.name}</option>
                        ))}
                    </select>
                    <input type="text" value={analysisScenario} onChange={(e) => setAnalysisScenario(e.target.value)} placeholder="Your question or scenario..." className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-[9px] text-slate-300 focus:outline-none focus:border-cyan-500" />
                 </div>
                 <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                    <span className="text-[9px] text-slate-500 font-bold whitespace-nowrap pt-0.5">Templates:</span>
                    {CHAT_TEMPLATES.map(s => (<button key={s} onClick={() => setAnalysisScenario(s)} className="whitespace-nowrap px-2 py-0.5 bg-slate-800/50 hover:bg-slate-700 border border-white/5 rounded text-[8px] text-slate-400 hover:text-cyan-300 transition-colors">{s}</button>))}
                 </div>
                 <button onClick={handleAnalyze} disabled={analysis.loading} className="w-full mt-1 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-[10px] font-bold rounded shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap">{analysis.loading ? "Analyzing..." : "RUN SIMULATION"}</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-slate-900/30">
              {analysis.loading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-70">
                  <div className={`w-6 h-6 border-2 ${params.aiProvider === 'local' ? 'border-emerald-500' : 'border-cyan-500'} border-t-transparent rounded-full animate-spin`}></div>
                  <div className={`text-xs ${params.aiProvider === 'local' ? 'text-emerald-400' : 'text-cyan-400'} font-mono animate-pulse`}>Running Analysis...</div>
                </div>
              ) : analysis.data ? (
                (() => {
                  const trackDataForReport = analysis.data?.trackReport?.trackName ? TRACK_DATA.find(t => t.name.toLowerCase() === analysis.data.trackReport.trackName.toLowerCase()) : undefined;
                  return (
                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="space-y-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
                        <StatBar label="Downforce" value={analysis.data.downforce} colorClass="bg-gradient-to-r from-cyan-600 to-cyan-400" />
                        <StatBar label="Efficiency" value={analysis.data.drag} colorClass="bg-gradient-to-r from-emerald-600 to-emerald-400" />
                        <StatBar label="Stability" value={analysis.data.stability} colorClass="bg-gradient-to-r from-violet-600 to-violet-400" />
                      </div>
                      
                      {analysis.data.trackReport && (
                        <div className="bg-slate-900/50 rounded-lg border border-white/5 overflow-hidden">
                          <button
                            onClick={() => setIsTrackReportCollapsed(!isTrackReportCollapsed)}
                            className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors text-left"
                          >
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Track Report: {analysis.data.trackReport.trackName}
                            </h3>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isTrackReportCollapsed ? '' : 'rotate-180'}`}>
                              <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06 0L10 9.06l-3.71 3.73a.75.75 0 11-1.06-1.06l4.25-4.25a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06z" clipRule="evenodd" />
                            </svg>
                          </button>
                          {!isTrackReportCollapsed && (
                            <div className="space-y-3 p-3 border-t border-white/10 animate-in fade-in duration-300">
                              <StatBar label="Suitability Score" value={analysis.data.trackReport.suitabilityScore} colorClass="bg-gradient-to-r from-amber-500 to-yellow-300" />
                              {trackDataForReport && (
                                <div className="pt-2">
                                  <h4 className="text-[10px] text-center font-bold text-slate-500 uppercase mb-1">Aero Signature</h4>
                                  <div className="h-40 w-full">
                                    <RadarChart
                                      labels={['SLD', 'HSCL', 'LSMF', 'ASB', 'RGC']}
                                      data={Object.values(trackDataForReport.signature)}
                                    />
                                  </div>
                                </div>
                              )}
                              <p className="text-[10px] text-slate-400 leading-relaxed font-mono pt-2 border-t border-white/10">{analysis.data.trackReport.detailedAnalysis}</p>
                            </div>
                          )}
                        </div>
                      )}

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
                          <button onClick={() => setShowFullScreen(true)} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded border border-white/10 text-slate-400 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs text-center space-y-2">
                  <p>Ready for analysis.</p>
                  {analysis.error && <p className="text-red-400">{analysis.error}</p>}
                </div>
              )}
            </div>
         </div>
      </div>

      {/* SYSTEM PROMPT EDITOR MODAL */}
      {editingPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-lg flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col overflow-hidden relative">
            <div className="p-4 sm:p-6 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-lg font-bold text-slate-100">{editingPrompt.title}</h3>
              <button 
                onClick={() => setEditingPrompt(null)} 
                className="p-2 rounded-full bg-slate-800/50 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 p-4 sm:p-6">
              <textarea
                value={params[editingPrompt.key]}
                onChange={(e) => updateParam(editingPrompt.key, e.target.value)}
                className="w-full h-full bg-slate-950 border border-white/10 rounded-lg p-4 text-sm font-mono text-slate-300 focus:border-cyan-500 focus:outline-none resize-none custom-scrollbar"
              />
            </div>
            <div className="p-4 sm:p-6 border-t border-white/5 flex justify-between items-center bg-slate-900/50">
              <button
                onClick={() => updateParam(editingPrompt.key, editingPrompt.defaultValue)}
                className="text-xs text-slate-500 hover:text-cyan-400 transition-colors"
              >
                Reset to Default
              </button>
              <button
                onClick={() => setEditingPrompt(null)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-cyan-500/20 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL SCREEN REPORT MODAL */}
      {showFullScreen && analysis.data && (
        (() => {
          const trackDataForReport = analysis.data?.trackReport?.trackName ? TRACK_DATA.find(t => t.name.toLowerCase() === analysis.data.trackReport.trackName.toLowerCase()) : undefined;
          return (
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
                    <span className="text-violet-400">SCENARIO: {analysis.data.trackReport ? analysis.data.trackReport.trackName : analysisScenario}</span>
                    {params.aiProvider === 'local' && <span className="text-emerald-500">PROVIDER: LOCAL</span>}
                  </div>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 grid grid-cols-3 gap-8 items-start">
                  {/* Left Column: Visuals & Core Stats */}
                  <div className="col-span-1 space-y-8">
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 text-center">POLAR VISUALIZATION (L/D)</h3>
                        <PolarGraph
                            lift={-analysis.data.downforce}
                            drag={analysis.data.drag}
                            liftToDrag={analysis.data.liftToDrag}
                        />
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-6 border border-white/5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">PERFORMANCE SCORES</h3>
                        <div className="space-y-4">
                            <StatBar label="DOWNFORCE" value={analysis.data.downforce} colorClass="bg-cyan-500" />
                            <StatBar label="DRAG EFFICIENCY" value={analysis.data.drag} colorClass="bg-teal-500" />
                            <StatBar label="STABILITY" value={analysis.data.stability} colorClass="bg-indigo-500" />
                            <StatBar label="COMPLEXITY COST" value={analysis.data.flowComplexity / 10} colorClass="bg-amber-500" />
                        </div>
                    </div>
                    
                    {analysis.data.trackReport && trackDataForReport && (
                      <div className="bg-slate-800/50 rounded-xl p-6 border border-white/5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Track Suitability: {analysis.data.trackReport.trackName}</h3>
                        <div className="space-y-4">
                          <StatBar label="Overall Score" value={analysis.data.trackReport.suitabilityScore} colorClass="bg-amber-500" />
                          <div className="h-40 w-full pt-2">
                            <RadarChart
                              labels={['SLD', 'HSCL', 'LSMF', 'ASB', 'RGC']}
                              data={Object.values(trackDataForReport.signature)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
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

                    {analysis.data.trackReport && (
                      <div className="bg-slate-800/30 rounded-xl p-6 border border-white/5">
                        <h3 className="text-sm font-bold text-amber-400 uppercase mb-3 flex items-center gap-2">
                          <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                          Track-Specific Analysis
                        </h3>
                        <p className="text-slate-300 leading-loose text-sm font-mono">
                          {analysis.data.trackReport.detailedAnalysis}
                        </p>
                      </div>
                    )}

                    <div className="bg-slate-800/30 rounded-xl p-6 border border-white/5">
                      <h3 className="text-sm font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-slate-500 rounded-full"></span>
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
          );
        })()
      )}
    </>
  );
};

export default Controls;