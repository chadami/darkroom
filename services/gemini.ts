import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

// Safety check for API Key presence
const apiKey = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

export const analyzeColorCast = async (base64Image: string): Promise<AnalysisResult> => {
  if (!apiKey) {
    console.warn("No API Key found for Gemini");
    throw new Error("API Key missing");
  }

  const modelId = "gemini-2.5-flash"; // Good balance of speed and vision capabilities

  const prompt = `
    You are an expert color film photography technician. 
    Analyze this image of a darkroom test print. 
    1. Identify the dominant color cast (e.g., too yellow, too magenta, too cyan, cold, warm).
    2. Suggest the filtration adjustments (Yellow, Magenta, Cyan) needed on a dichroic enlarger to NEUTRALIZE this cast.
    
    REMEMBER RA-4 RULES:
    - If print is Yellow, ADD Yellow filtration (Y+).
    - If print is Magenta, ADD Magenta filtration (M+).
    - If print is Cyan, ADD Cyan filtration (C+).
    - If print is Blue, SUBTRACT Yellow (Y-).
    - If print is Green, SUBTRACT Magenta (M-).
    - If print is Red, SUBTRACT Cyan (C-).
    
    Return a JSON object with a short description and the numeric adjustments (range approx -50 to +50).
  `;

  try {
    // Strip header if present to get raw base64
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            suggestion: {
              type: Type.OBJECT,
              properties: {
                y: { type: Type.NUMBER },
                m: { type: Type.NUMBER },
                c: { type: Type.NUMBER }
              },
              required: ["y", "m", "c"]
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(text) as AnalysisResult;
    return result;

  } catch (error) {
    console.error("Gemini Analysis Failed", error);
    throw error;
  }
};