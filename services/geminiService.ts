import { GoogleGenAI, Type } from "@google/genai";
import { AirfoilParams, AeroStats, Point } from "../types";
import * as THREE from 'three';

let ai: GoogleGenAI | null = null;

try {
  if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
} catch (e) {
  console.error("Failed to initialize Gemini client", e);
}

// Helper to strip markdown code blocks if local model includes them
const cleanJsonOutput = (text: string): string => {
  const pattern = /```json\s*([\s\S]*?)\s*```/i;
  const match = text.match(pattern);
  if (match && match[1]) {
    return match[1];
  }
  
  let start = text.indexOf('{');
  if (start === -1) start = text.indexOf('[');
  
  let end = text.lastIndexOf('}');
  if (end === -1) end = text.lastIndexOf(']');

  if (start !== -1 && end !== -1) {
      return text.substring(start, end + 1);
  }
  return text;
};

const generatePrompt = (params: AirfoilParams, scenario: string): string => {
  const { camber, position, thickness, angle, mode } = params;
  
  let profileDescription = "";
  if (mode === 'naca') {
    profileDescription = `NACA ${Math.round(camber)}${Math.round(position)}${Math.round(thickness).toString().padStart(2, '0')}`;
  } else {
    const points = params.controlPoints;
    const pointsStr = points.map((p, i) => `P${i}[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(', ');
    
    const topY = Math.max(...points.map(p => p.y));
    const bottomY = Math.min(...points.map(p => p.y));
    const maxThickness = (topY - bottomY);
    
    const maxUpper = Math.max(...points.map(p => p.y));
    const minLower = Math.min(...points.map(p => p.y));
    const camberEst = (maxUpper + minLower) / 2;

    profileDescription = `Custom User-Defined Freeform Profile.
    Geometry Definition (Control Points X,Y): ${pointsStr}
    Approximate Geometric Properties:
    - Max Thickness: ${(maxThickness * 100).toFixed(1)}% of chord
    - Estimated Camber Offset: ${(camberEst * 100).toFixed(1)}%`;
  }

  return `
    Act as a senior Automotive Aerodynamicist. Analyze this rear spoiler configuration:
    - Profile: ${profileDescription}
    - Angle of Attack: ${angle} degrees.
    - Analysis Scenario/Context: "${scenario}"
    
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
    - "extensiveReport": A detailed paragraph (approx 60 words) explaining the boundary layer behavior, separation points, and specific suitability for racing vs street within the context of ${scenario}.

    IMPORTANT: Return ONLY valid JSON. No markdown, no preamble.
    Format:
    {
      "downforce": number,
      "drag": number,
      "stability": number,
      "liftToDrag": number,
      "flowComplexity": number,
      "summary": string,
      "recommendation": string,
      "extensiveReport": string
    }
  `;
};

const analyzeWithLocal = async (params: AirfoilParams, scenario: string): Promise<AeroStats | null> => {
  const prompt = generatePrompt(params, scenario);
  
  try {
    const response = await fetch(params.localEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a physics engine outputting JSON data only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" } 
      })
    });

    if (!response.ok) {
      throw new Error(`Local server error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || data.content || "{}";
    const cleaned = cleanJsonOutput(content);
    return JSON.parse(cleaned) as AeroStats;

  } catch (e) {
    console.error("Local AI Error:", e);
    return null;
  }
};

export const analyzeAirfoil = async (params: AirfoilParams, scenario: string = "General Performance"): Promise<AeroStats | null> => {
  if (params.aiProvider === 'local') {
    return analyzeWithLocal(params, scenario);
  }

  if (!ai) {
    console.error("API Key not configured for Gemini.");
    return null;
  }

  const prompt = generatePrompt(params, scenario);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            downforce: { type: Type.NUMBER },
            drag: { type: Type.NUMBER },
            stability: { type: Type.NUMBER },
            liftToDrag: { type: Type.NUMBER },
            flowComplexity: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            recommendation: { type: Type.STRING },
            extensiveReport: { type: Type.STRING }
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

export const optimizeAirfoil = async (goal: string, params: AirfoilParams): Promise<Partial<AirfoilParams> | null> => {
    const prompt = `
      Act as an Aerodynamic Engineer. The user wants to configure a vehicle spoiler to achieve the following goal:
      "${goal}"

      Return a JSON object with the optimal parameter values to achieve this. 
      Modify the following parameters ONLY:
      - camber (0 to 9)
      - position (0 to 9)
      - thickness (1 to 40)
      - angle (-25 to 15)

      Return JSON ONLY. No explanation.
      Format: { "camber": number, "position": number, "thickness": number, "angle": number }
    `;

    try {
        if (params.aiProvider === 'local') {
            const response = await fetch(params.localEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: "You are a configuration assistant. Output JSON only. No Markdown." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.5,
                    response_format: { type: "json_object" }
                })
            });
            if (!response.ok) throw new Error("Local AI failed");
            const data = await response.json();
            const content = cleanJsonOutput(data.choices?.[0]?.message?.content || "{}");
            return JSON.parse(content);
        } else {
            if (!ai) return null;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            camber: { type: Type.NUMBER },
                            position: { type: Type.NUMBER },
                            thickness: { type: Type.NUMBER },
                            angle: { type: Type.NUMBER }
                        },
                        required: ["camber", "position", "thickness", "angle"]
                    }
                }
            });
            if (response.text) return JSON.parse(response.text);
        }
    } catch (e) {
        console.error("Optimization Error:", e);
        return null;
    }
    return null;
};

export const generateProfilePoints = async (description: string, params: AirfoilParams): Promise<Point[] | null> => {
    const prompt = `
      Generate aerodynamic keypoints for a car spoiler cross-section described as: "${description}".
      
      I need separate definitions for the Upper Surface (Suction Side) and Lower Surface (Pressure Side).
      
      Requirements:
      - X range is 0.0 (Leading Edge) to 1.0 (Trailing Edge).
      - Y range is roughly -0.5 to 0.5.
      - **Upper Surface**: Provide 4-6 key coordinates describing the top curve. Start near X=0, end near X=1.
      - **Lower Surface**: Provide 4-6 key coordinates describing the bottom curve. Start near X=0, end near X=1.
      - Do NOT include the exact LE (0,0) or TE (1,y) in these lists if possible, focus on the curvature in between.
      
      The system will interpolate these points to create a smooth spline.

      Return valid JSON object:
      {
        "upperSurface": [{"x": number, "y": number}, ...],
        "lowerSurface": [{"x": number, "y": number}, ...]
      }
    `;

    try {
        let rawData: { upperSurface: Point[], lowerSurface: Point[] } | null = null;

        if (params.aiProvider === 'local') {
             const response = await fetch(params.localEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: "You are a geometry engine. Output JSON object with upperSurface and lowerSurface arrays." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.5,
                    response_format: { type: "json_object" }
                })
            });
            const data = await response.json();
            const content = cleanJsonOutput(data.choices?.[0]?.message?.content || "{}");
            rawData = JSON.parse(content);
        } else {
            if (!ai) return null;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            upperSurface: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
                                    required: ["x", "y"]
                                }
                            },
                            lowerSurface: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
                                    required: ["x", "y"]
                                }
                            }
                        },
                        required: ["upperSurface", "lowerSurface"]
                    }
                }
            });
            if (response.text) rawData = JSON.parse(response.text);
        }

        if (rawData && rawData.upperSurface && rawData.lowerSurface) {
            // Interpolation Logic
            // 1. Create separate spline curves for upper and lower
            const le = new THREE.Vector2(0, 0);
            // Determine TE Y from the last points of generated data or default to 0
            const lastUpper = rawData.upperSurface[rawData.upperSurface.length - 1];
            const lastLower = rawData.lowerSurface[rawData.lowerSurface.length - 1];
            const teY = (lastUpper.y + lastLower.y) / 2;
            const te = new THREE.Vector2(1, teY);

            // Build arrays for SplineCurve
            const upperVecs = [le, ...rawData.upperSurface.map(p => new THREE.Vector2(p.x, p.y)), te];
            // For lower surface, typically we want LE -> TE direction for the spline
            const lowerVecs = [le, ...rawData.lowerSurface.map(p => new THREE.Vector2(p.x, p.y)), te];

            const upperSpline = new THREE.SplineCurve(upperVecs);
            const lowerSpline = new THREE.SplineCurve(lowerVecs);

            // We need 12 points total to match App defaults.
            // 0: LE
            // 1-5: Upper intermediates (5 points)
            // 6: TE
            // 7-11: Lower intermediates (5 points)

            const finalPoints: Point[] = [];
            finalPoints.push({ x: 0, y: 0 }); // Index 0: LE

            // Sample Upper (t=0 is LE, t=1 is TE)
            for (let i = 1; i <= 5; i++) {
                const t = i / 6;
                const p = upperSpline.getPoint(t);
                finalPoints.push({ x: p.x, y: p.y });
            }

            finalPoints.push({ x: 1, y: teY }); // Index 6: TE

            // Sample Lower (t=0 is LE, t=1 is TE)
            for (let i = 1; i <= 5; i++) {
                const t = i / 6;
                const p = lowerSpline.getPoint(t);
                finalPoints.push({ x: p.x, y: p.y });
            }

            return finalPoints;
        }
        return null;
    } catch (e) {
        console.error("Shape Generation Error:", e);
        return null;
    }
};
