import React from 'react';

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

// Fix for React Three Fiber JSX types not being automatically recognized
declare global {
  namespace JSX {
    interface IntrinsicElements {
      ambientLight: any;
      boxGeometry: any;
      group: any;
      instancedMesh: any;
      mesh: any;
      meshBasicMaterial: any;
      meshPhysicalMaterial: any;
      meshStandardMaterial: any;
      planeGeometry: any;
      sphereGeometry: any;
      spotLight: any;
      primitive: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      ambientLight: any;
      boxGeometry: any;
      group: any;
      instancedMesh: any;
      mesh: any;
      meshBasicMaterial: any;
      meshPhysicalMaterial: any;
      meshStandardMaterial: any;
      planeGeometry: any;
      sphereGeometry: any;
      spotLight: any;
      primitive: any;
    }
  }
}