
import { GoogleGenAI, Type } from "@google/genai";
import { AirfoilParams, AeroStats } from "../types";

let ai: GoogleGenAI | null = null;

try {
  if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
} catch (e) {
  console.error("Failed to initialize Gemini client", e);
}

export const analyzeAirfoil = async (params: AirfoilParams): Promise<AeroStats | null> => {
  if (!ai) {
    console.error("API Key not configured.");
    return null;
  }

  const { camber, position, thickness, angle, mode } = params;
  
  let profileDescription = "";
  if (mode === 'naca') {
    profileDescription = `NACA ${Math.round(camber)}${Math.round(position)}${Math.round(thickness).toString().padStart(2, '0')}`;
  } else {
    const topY = Math.max(...params.controlPoints.map(p => p.y));
    const bottomY = Math.min(...params.controlPoints.map(p => p.y));
    const approxThickness = ((topY - bottomY) * 100).toFixed(1);
    profileDescription = `Custom User-Defined Spoiler Profile (Approx Thickness: ${approxThickness}%)`;
  }

  const prompt = `
    Act as a senior Automotive Aerodynamicist. Analyze this rear spoiler configuration:
    - Profile: ${profileDescription}
    - Angle of Attack: ${angle} degrees.
    
    Provide a structured analysis suitable for a professional CFD dashboard.
    
    Evaluate metrics:
    1. Downforce: 0 (Lift/None) to 10 (Extreme Downforce).
    2. Drag Efficiency: 0 (Airbrake) to 10 (Slippery).
    3. Stability: 0 (Unstable) to 10 (Planted).
    4. Lift-to-Drag Ratio (Estimate): A number (e.g. -2.5 for downforce dominant, 15 for glider).
    5. Flow Complexity / Computational Cost: 0 (Laminar/Simple) to 100 (Highly Turbulent/Complex).
    
    Provide:
    - "summary" (max 12 words).
    - "recommendation" (max 8 words).
    - "extensiveReport": A detailed paragraph (approx 60 words) explaining the boundary layer behavior, separation points, and specific suitability for racing vs street.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            downforce: { type: Type.NUMBER, description: "Score 0-10" },
            drag: { type: Type.NUMBER, description: "Efficiency Score 0-10" },
            stability: { type: Type.NUMBER, description: "Score 0-10" },
            liftToDrag: { type: Type.NUMBER, description: "Estimated L/D Ratio" },
            flowComplexity: { type: Type.NUMBER, description: "Turbulence/Cost Score 0-100" },
            summary: { type: Type.STRING },
            recommendation: { type: Type.STRING },
            extensiveReport: { type: Type.STRING, description: "Detailed physics analysis" }
          },
          required: ["downforce", "drag", "stability", "liftToDrag", "flowComplexity", "summary", "recommendation", "extensiveReport"]
        },
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AeroStats;
    }
    return null;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};
