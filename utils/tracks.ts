export interface TrackSignature {
  sld: number; // Straight-Line Demand
  hscl: number; // High-Speed Cornering Load
  lsmf: number; // Low-Speed Mechanical Focus
  asb: number; // Aero Sensitivity / Balance Criticality
  rgc: number; // Ride-Height & Ground-Effect Challenge
}

export interface Track {
  name: string;
  signature: TrackSignature;
  description: string;
}

export const TRACK_DATA: Track[] = [
  { name: "Monza", description: "Temple of Speed", signature: { sld: 10, hscl: 3, lsmf: 4, asb: 5, rgc: 3 } },
  { name: "Spa-Francorchamps", description: "Ardennes Rollercoaster", signature: { sld: 7, hscl: 9, lsmf: 5, asb: 9, rgc: 10 } },
  { name: "Silverstone", description: "Historic High-Speed", signature: { sld: 5, hscl: 10, lsmf: 3, asb: 8, rgc: 7 } },
  { name: "Suzuka", description: "Esses & Elevation", signature: { sld: 6, hscl: 9, lsmf: 4, asb: 10, rgc: 8 } },
  { name: "Barcelona-Catalunya", description: "The Ultimate Test", signature: { sld: 6, hscl: 7, lsmf: 6, asb: 8, rgc: 6 } },
  { name: "Monaco", description: "Streets of the Principality", signature: { sld: 1, hscl: 1, lsmf: 10, asb: 7, rgc: 5 } },
  { name: "Baku", description: "City of Winds", signature: { sld: 9, hscl: 4, lsmf: 7, asb: 6, rgc: 4 } },
  { name: "Jeddah", description: "Corniche Circuit", signature: { sld: 7, hscl: 8, lsmf: 4, asb: 8, rgc: 5 } },
  { name: "Interlagos (Brazil)", description: "Senna's Home", signature: { sld: 6, hscl: 6, lsmf: 6, asb: 7, rgc: 8 } },
  { name: "Circuit of the Americas (COTA)", description: "Austin's Finest", signature: { sld: 5, hscl: 6, lsmf: 7, asb: 9, rgc: 7 } },
  { name: "Red Bull Ring", description: "Styrian Mountains", signature: { sld: 8, hscl: 5, lsmf: 6, asb: 6, rgc: 6 } },
  { name: "Hungaroring", description: "Monaco without Walls", signature: { sld: 2, hscl: 6, lsmf: 9, asb: 8, rgc: 4 } },
  { name: "Singapore", description: "Marina Bay Night Race", signature: { sld: 2, hscl: 2, lsmf: 9, asb: 9, rgc: 6 } },
  { name: "Las Vegas", description: "The Strip Circuit", signature: { sld: 9, hscl: 3, lsmf: 6, asb: 5, rgc: 3 } },
  { name: "Miami Autodrome", description: "Hard Rock Stadium Circuit", signature: { sld: 7, hscl: 4, lsmf: 7, asb: 7, rgc: 3 } },
];
