import { GoogleGenAI, Type } from "@google/genai";
import { AirfoilParams, AeroStats, Point } from "../types";
import * as THREE from 'three';
import { TRACK_DATA } from '../utils/tracks';

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

const getAirfoilDataString = (params: AirfoilParams): string => {
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
    --- Airfoil Configuration ---
    Profile: ${profileDescription}
    Angle of Attack: ${angle} degrees.
    --------------------------
  `;
};

const analyzeWithLocal = async (systemPrompt: string, userPrompt: string, endpoint: string): Promise<AeroStats | null> => {
  try {
    console.log("%c[LLM-LOCAL] Sending request...", "color: cyan; font-weight: bold;");
    console.log("[LLM-LOCAL] System prompt:", systemPrompt);
    console.log("[LLM-LOCAL] User prompt:", userPrompt);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    console.log("%c[LLM-LOCAL] HTTP status: " + response.status, "color: cyan;");

    if (!response.ok) {
      console.error("[LLM-LOCAL] ERROR: Server responded with non-OK:", response.status);
      throw new Error(`Local server error: ${response.status}`);
    }

    const data = await response.json();

    console.log("%c[LLM-LOCAL] RAW full response:", "color: yellow; font-weight: bold;", data);

    const content =
      data.choices?.[0]?.messages?.content ||
      data.choices?.[0]?.message?.content ||
      data.content ||
      "{}";

    console.log("%c[LLM-LOCAL] Extracted content:", "color: yellow;", content);

    const cleaned = cleanJsonOutput(content);
    console.log("%c[LLM-LOCAL] Cleaned JSON:", "color: orange; font-weight:bold;", cleaned);

    let parsed: AeroStats | null = null;

    try {
      parsed = JSON.parse(cleaned);
      console.log("%c[LLM-LOCAL] Parsed object:", "color: lightgreen; font-weight:bold;", parsed);
    } catch (err) {
      console.error("%c[LLM-LOCAL] JSON parse error:", "color: red; font-weight:bold;", err);
      return null;
    }

    // Highlight aerodynamic + track report content
    if (parsed && (parsed as any).trackReport) {
      console.log(
        "%c[TRACK REPORT FOUND]",
        "color: violet; font-weight:bold; font-size: 14px;"
      );
      console.table((parsed as any).trackReport);
    } else {
      console.log("%c[NO TRACK REPORT]", "color: gray;");
    }

    return parsed;
  } catch (e) {
    console.error("%c[LLM-LOCAL] ERROR:", "color: red; font-weight:bold;", e);
    return null;
  }
};


export const analyzeAirfoil = async (params: AirfoilParams, scenario: string = "General Performance", selectedTrack: string = "none"): Promise<AeroStats | null> => {
  const airfoilData = getAirfoilDataString(params);
  let userPrompt = `Analysis Scenario/Context: "${scenario}"\n\n${airfoilData}`;
  let systemPrompt = params.systemPrompt;

  const track = TRACK_DATA.find(t => t.name === selectedTrack);

  if (track) {
    userPrompt += `
    \n--- Track Specific Analysis ---
    Please analyze the airfoil's suitability for the following Formula 1 circuit:
    Track: ${track.name} (${track.description})

    This track has the following aerodynamic signature (0-10 scale, 10=Max demand):
    - Straight-Line Demand (SLD): ${track.signature.sld}
    - High-Speed Cornering Load (HSCL): ${track.signature.hscl}
    - Low-Speed Mechanical Focus (LSMF): ${track.signature.lsmf}
    - Aero Sensitivity / Balance Criticality (ASB): ${track.signature.asb}
    - Ride-Height & Ground-Effect Challenge (RGC): ${track.signature.rgc}

    Your task is to provide a detailed analysis of how the spoiler's characteristics would perform against these demands.
    `;
    
    systemPrompt += `\n\nWhen a track is provided for analysis, you MUST include a 'trackReport' object in your JSON response. This object must contain:
    1. 'trackName': The name of the track. It MUST be exactly '${track.name}'.
    2. 'suitabilityScore': An overall suitability score from 0 to 10.
    3. 'detailedAnalysis': A paragraph explaining how the airfoil's characteristics (downforce, drag, stability) align with the track's signature (SLD, HSCL, etc.) to justify the score.`;
  } else {
    systemPrompt += `\n\nDo not include the 'trackReport' object in your response.`;
  }
  
  if (params.aiProvider === 'local') {
  // FORCE COMPLETE AEROSTATS SCHEMA
  systemPrompt += `
  
  You MUST ALWAYS output a full AeroStats JSON object with the following exact fields:

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

  If a track is provided, ALSO include:

  "trackReport": {
    "trackName": string,
    "suitabilityScore": number,
    "detailedAnalysis": string
  }

  These fields are mandatory. Never omit them.
  Never output markdown.
  Never output analysis outside JSON.
  `;

  return analyzeWithLocal(systemPrompt, userPrompt, params.localEndpoint);
}


  if (!ai) {
    console.error("API Key not configured for Gemini.");
    return null;
  }

  try {
    const responseSchema: any = {
      type: Type.OBJECT,
      properties: {
        downforce: { type: Type.NUMBER },
        drag: { type: Type.NUMBER },
        stability: { type: Type.NUMBER },
        liftToDrag: { type: Type.NUMBER },
        flowComplexity: { type: Type.NUMBER },
        summary: { type: Type.STRING },
        recommendation: { type: Type.STRING },
        extensiveReport: { type: Type.STRING },
      },
      required: ["downforce", "drag", "stability", "liftToDrag", "flowComplexity", "summary", "recommendation", "extensiveReport"]
    };

    if (track) {
      responseSchema.properties.trackReport = {
        type: Type.OBJECT,
        properties: {
          trackName: { type: Type.STRING },
          suitabilityScore: { type: Type.NUMBER },
          detailedAnalysis: { type: Type.STRING }
        },
        required: ["trackName", "suitabilityScore", "detailedAnalysis"]
      };
      responseSchema.required.push("trackReport");
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
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
      The user wants to configure a vehicle spoiler to achieve the following goal:
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
                        { role: "system", content: `${params.nacaDesignSystemPrompt}. You must output JSON. No Markdown.` },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.5,
                    response_format: { type: "json_object" }
                })
            });
            if (!response.ok) throw new Error("Local AI failed");
            const data = await response.json();
            const content = cleanJsonOutput(data.choices?.[0]?.messages?.content || "{}");
            return JSON.parse(content);
        } else {
            if (!ai) return null;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: params.nacaDesignSystemPrompt,
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
                        { role: "system", content: `${params.freeformDesignSystemPrompt}. You are a geometry engine. Output JSON object with upperSurface and lowerSurface arrays.` },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.5,
                    response_format: { type: "json_object" }
                })
            });
            const data = await response.json();
            const content = cleanJsonOutput(data.choices?.[0]?.messages?.content || "{}");
            rawData = JSON.parse(content);
        } else {
            if (!ai) return null;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: params.freeformDesignSystemPrompt,
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
            const le = new THREE.Vector2(0, 0);
            const lastUpper = rawData.upperSurface[rawData.upperSurface.length - 1];
            const lastLower = rawData.lowerSurface[rawData.lowerSurface.length - 1];
            const teY = (lastUpper.y + lastLower.y) / 2;
            const te = new THREE.Vector2(1, teY);
            const upperVecs = [le, ...rawData.upperSurface.map(p => new THREE.Vector2(p.x, p.y)), te];
            const lowerVecs = [le, ...rawData.lowerSurface.map(p => new THREE.Vector2(p.x, p.y)), te];
            const upperSpline = new THREE.SplineCurve(upperVecs);
            const lowerSpline = new THREE.SplineCurve(lowerVecs);
            const finalPoints: Point[] = [];
            finalPoints.push({ x: 0, y: 0 }); // Index 0: LE
            for (let i = 1; i <= 5; i++) {
                const t = i / 6;
                const p = upperSpline.getPoint(t);
                finalPoints.push({ x: p.x, y: p.y });
            }
            finalPoints.push({ x: 1, y: teY }); // Index 6: TE
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