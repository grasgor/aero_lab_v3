
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
  
  // Freeform Control Points
  // 0: LE, 1-3: Upper, 4: TE, 5-7: Lower (Simplified model)
  controlPoints: Point[];

  // Visual Style
  flowType: 'discrete' | 'steam';
  showVortices: boolean;
  showWireframe: boolean;
  particleCount: number;
  flowSpeed: number;
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
}

export interface AnalysisResult {
  loading: boolean;
  data?: AeroStats;
  error?: string;
}
