// FIX: Changed type-only import to a regular import to ensure the JSX namespace is extended correctly for React Three Fiber components.
// FIX: Replaced unused React import with a side-effect import for react-three-fiber to correctly extend the JSX namespace.
import '@react-three/fiber';
import { ThreeElements } from '@react-three/fiber';

export interface Point {
  x: number;
  y: number;
}

export interface AirfoilParams {
  // NACA Parameters
  camber: number; // Max camber as % of chord (0-9.5)
  position: number; // Max camber position in tenths of chord (0-9)
  thickness: number; // Max thickness as % of chord (0-40)
  
  // General Parameters
  angle: number; // Angle of attack in degrees
  posX: number; // Horizontal position (X axis)
  posY: number; // Vertical position (Y axis)
  
  // Mode Switching
  mode: 'naca' | 'freeform';
  isEditing: boolean; // Toggle for showing/hiding control points in freeform
  pauseFlowDuringEdit: boolean; // Toggle for hiding flow particles while sculpting
  isFlowActive: boolean; // Global master switch for the simulation
  
  // Freeform Control Points
  // 0: LE, Middle: TE, Others: Upper/Lower surfaces
  controlPoints: Point[];

  // Visual Style
  flowType: 'discrete' | 'steam';
  showVortices: boolean;
  showWireframe: boolean;
  showHeatmap: boolean; // New: Toggle heatmap coloring
  particleCount: number;
  flowSpeed: number;
  turbulenceIntensity: number; // Scalar for wake chaos (0-3)

  // AI Configuration
  aiProvider: 'gemini' | 'local';
  localEndpoint: string;
  systemPrompt: string; // AI system prompt for analysis
  nacaDesignSystemPrompt: string;
  freeformDesignSystemPrompt: string;
}

export interface Preset {
  id: string;
  name: string;
  params: AirfoilParams;
  date: number;
}

export interface AeroStats {
  downforce: number; // 0-10 score
  drag: number; // 0-10 score (Efficiency)
  stability: number; // 0-10 score
  liftToDrag: number; // Ratio (e.g., -3.5 or 10.2)
  flowComplexity: number; // 0-100 (Computational Cost/Turbulence)
  summary: string;
  recommendation: string;
  extensiveReport: string; // Detailed analysis text
  trackReport?: { // Optional object for detailed track analysis
    trackName: string;
    suitabilityScore: number;
    detailedAnalysis: string;
  }
}

export interface AnalysisResult {
  loading: boolean;
  data?: AeroStats;
  error?: string;
}

// Extends JSX to include React Three Fiber's intrinsic elements.
declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
