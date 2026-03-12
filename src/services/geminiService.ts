import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeDataSchema(data: any[], fileName: string) {
  const sample = data.slice(0, 10);
  const schema = Object.keys(data[0] || {}).map(key => ({
    name: key,
    type: typeof data[0][key]
  }));

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Analyze this data schema and sample from file "${fileName}":
    Schema: ${JSON.stringify(schema)}
    Sample: ${JSON.stringify(sample)}
    
    Act as a Tableau Expert. Provide:
    1. A brief summary of what this dataset seems to be about.
    2. 3-5 key insights or questions we should explore.
    3. Suggestions for calculated fields that would be useful.
    4. A recommended first visualization.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          insights: { type: Type.ARRAY, items: { type: Type.STRING } },
          calculatedFields: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                formula: { type: Type.STRING },
                reason: { type: Type.STRING }
              }
            }
          },
          firstViz: { type: Type.STRING }
        }
      }
    }
  });

  return JSON.parse(response.text);
}

export async function suggestVisualizations(data: any[], context: string) {
  const sample = data.slice(0, 5);
  const columns = Object.keys(data[0] || {});

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Based on this data (Columns: ${columns.join(", ")}) and context: "${context}", suggest 5 diverse visualizations.
    Focus on showing trends over time, comparisons between categories, and correlations.
    Ensure you use a variety of chart types (bar, line, scatter, pie, area).
    For each visualization, provide:
    1. Title
    2. Type (bar, line, scatter, pie, area)
    3. xAxis (The Dimension)
    4. yAxis (The Measure)
    5. mark (The Tableau Mark type: Bar, Line, Square, Circle, Area, Pie, etc.)
    6. dimension (Explicitly state which field is the primary Dimension)
    7. measure (Explicitly state which field is the primary Measure)
    8. description (Why this is useful)`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            type: { type: Type.STRING },
            xAxis: { type: Type.STRING },
            yAxis: { type: Type.STRING },
            mark: { type: Type.STRING },
            dimension: { type: Type.STRING },
            measure: { type: Type.STRING },
            description: { type: Type.STRING }
          }
        }
      }
    }
  });

  return JSON.parse(response.text);
}

export async function chatWithExpert(
  messages: { role: 'user' | 'assistant'; content: string }[],
  data: any[],
  fileName: string,
  analysis: any
) {
  const sample = data.slice(0, 5);
  const columns = Object.keys(data[0] || {});
  
  const systemInstruction = `You are a Tableau Expert AI assistant. 
  The user is analyzing a dataset named "${fileName}".
  Columns: ${columns.join(", ")}
  Initial Analysis Summary: ${analysis?.summary || "Not available"}
  Key Insights: ${analysis?.insights?.join(", ") || "Not available"}
  
  Your goal is to help the user explore this data, suggest visualizations, explain Tableau concepts (Dimensions, Measures, Marks), and provide business recommendations.
  Be professional, technical yet accessible, and always refer to the data columns when suggesting analysis.
  If the user asks for a visualization, describe it in terms of Dimensions, Measures, and Marks.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    })),
    config: {
      systemInstruction,
    }
  });

  return response.text;
}
