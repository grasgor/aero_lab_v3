import { GoogleGenAI, Type } from "@google/genai";
import { AirfoilParams, AeroStats, Point } from "../types";

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
  // Try to find first { or [ and last } or ]
  const firstChar = text.search(/[{}\[]/);
  const lastChar = text.search(/[}\]]/); // Naive find, better to use lastIndexOf
  
  // Better manual search from ends
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
    // Serialize control points for detailed analysis
    const points = params.controlPoints;
    const pointsStr = points.map((p, i) => `P${i}[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(', ');
    
    const topY = Math.max(...points.map(p => p.y));
    const bottomY = Math.min(...points.map(p => p.y));
    const maxThickness = (topY - bottomY);
    
    // Simple camber estimation (avg of max upper and min lower y)
    const maxUpper = Math.max(...points.map(p => p.y));
    const minLower = Math.min(...points.map(p => p.y));
    const camberEst = (maxUpper + minLower) / 2;

    profileDescription = `Custom User-Defined Freeform Profile.
    Geometry Definition (Control Points X,Y): ${pointsStr}
    Approximate Geometric Properties:
    - Max Thickness: ${(maxThickness * 100).toFixed(1)}% of chord
    - Estimated Camber Offset: ${(camberEst * 100).toFixed(1)}%
    - Shape Characteristic: Interpret the points to identify features like ducktail, reflexed trailing edge, or gurney flap.`;
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

      Consider standard NACA 4-digit series physics.
      
      Example: For "high downforce", angle might be -15, camber 8.
      Example: For "low drag", angle might be -2, thickness 10.

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

/**
 * Generates a list of points for a custom airfoil shape based on a text description.
 */
export const generateProfilePoints = async (description: string, params: AirfoilParams): Promise<Point[] | null> => {
    const prompt = `
      Generate 2D coordinates for a custom car spoiler cross-section described as: "${description}".
      
      Requirements:
      - Generate exactly 12 points.
      - Coordinate system: X from 0 (Leading Edge) to 1 (Trailing Edge).
      - Y range roughly -0.5 to 0.5 (centered at 0).
      - Structure: 
        - Point 0: {x:0, y:0} (Leading Edge)
        - Points 1-5: Upper Surface points moving from X=0.15 to X=0.9
        - Point 6: {x:1, y:0} (Trailing Edge)
        - Points 7-11: Lower Surface points moving from X=0.15 to X=0.9
      
      Example structure:
      [
        {"x":0, "y":0}, 
        {"x":0.2, "y":0.1}, {"x":0.4, "y":0.15}, ... 
        {"x":1, "y":0}, 
        {"x":0.2, "y":-0.05}, ...
      ]

      Return valid JSON array of objects with x and y numbers.
    `;

    try {
        if (params.aiProvider === 'local') {
             const response = await fetch(params.localEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: "You are a geometry engine. Output JSON array only." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.5,
                })
            });
            const data = await response.json();
            const content = cleanJsonOutput(data.choices?.[0]?.message?.content || "[]");
            return JSON.parse(content);
        } else {
            if (!ai) return null;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                x: { type: Type.NUMBER },
                                y: { type: Type.NUMBER }
                            },
                            required: ["x", "y"]
                        }
                    }
                }
            });
            if (response.text) return JSON.parse(response.text);
        }
    } catch (e) {
        console.error("Shape Gen Error:", e);
        return null;
    }
    return null;
};