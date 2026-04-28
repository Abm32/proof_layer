import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";

const navigateToFunction: FunctionDeclaration = {
  name: "navigateTo",
  description: "Navigate to a specific page or view in the application.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      view: {
        type: Type.STRING,
        description: "The view to navigate to.",
        enum: ["audit", "history", "metrics", "integrity", "settings", "models", "reports"]
      }
    },
    required: ["view"]
  }
};

const searchAuditLogsFunction: FunctionDeclaration = {
  name: "searchAuditLogs",
  description: "Search for specific analyses in the audit history by filename or date.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "The search term to filter audit logs."
      }
    },
    required: ["query"]
  }
};

const runAnalysisFunction: FunctionDeclaration = {
  name: "runAnalysis",
  description: "Trigger the audit analysis on the currently uploaded dataset.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const registerModelFunction: FunctionDeclaration = {
  name: "registerModel",
  description: "Register a new machine learning model to the inventory.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The name of the model" },
      version: { type: Type.STRING, description: "The version string, e.g. 1.0.0" },
      deploymentDate: { type: Type.STRING, description: "The date the model was deployed, format YYYY-MM-DD" },
      accuracy: { type: Type.STRING, description: "The accuracy percentage, e.g. 95.5" },
      biasStatus: { 
        type: Type.STRING, 
        description: "The identified bias risk level",
        enum: ["Low", "Medium", "High"]
      }
    },
    required: ["name", "version", "deploymentDate", "accuracy", "biasStatus"]
  }
};

export const tools = [
  {
    functionDeclarations: [
      navigateToFunction,
      searchAuditLogsFunction,
      runAnalysisFunction,
      registerModelFunction
    ]
  }
];

export const systemInstruction = `You are ProofLayer AI, an intelligent assistant for a data ethics and bias audit platform.
Your goal is to help users navigate the app, understand bias metrics, and perform audits.

You can:
1. Navigate to different sections: Audit (Analyze), Audit Logs (History), Bias Metrics, Data Integrity, Models, Reports, and Settings.
2. Search through audit history.
3. Help users understand metrics like Statistical Parity or Disparate Impact.
4. Run the analysis if a file is uploaded.

Be helpful, concise, and professional. Use a "neubrutalist" tone that matches the app's aesthetic.`;

export const initGemini = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined");
  }
  return new GoogleGenAI({ apiKey });
};

export const explainBias = async (
  groupA: string, rateA: number,
  groupB: string, rateB: number,
  difference: number,
  geminiModel: string,
  modelRegistryName: string = "unspecified ML model"
) => {
  try {
    const ai = initGemini();
    const prompt = `You are a Professional AI Ethics Auditor. You are auditing a model registered as "${modelRegistryName}".

Audit Results:
- Group A (${groupA}) selection rate: ${(rateA * 100).toFixed(1)}%
- Group B (${groupB}) selection rate: ${(rateB * 100).toFixed(1)}%
- Disparate Impact Ratio: ${difference.toFixed(3)}

Explain what this means for "${modelRegistryName}". 
1. Is this level of bias legally or ethically concerning for this specific type of model?
2. What real-world impact might this have on the minority group?
3. Suggest 2 concrete technical interventions (e.g., re-sampling, pre-processing, or fair in-processing) suitable for "${modelRegistryName}".

Keep it technical, authoritative, and concise using Markdown.`;

    const result = await ai.models.generateContent({
      model: geminiModel,
      contents: [{ parts: [{ text: prompt }] }],
    });

    if (!result || !result.text) {
      console.warn("Gemini explanation returned no text content");
      return "No automated interpretation available for this analysis.";
    }

    return result.text;
  } catch (err) {
    console.error("Gemini explanation error:", err);
    return null;
  }
};

export const getModelSuggestions = async () => {
  try {
    const ai = initGemini();
    const prompt = `Suggest 3 realistic machine learning models commonly used in industry that might require bias auditing.
Return ONLY a JSON array of objects with the following keys:
- name: string (e.g., "Retirement Savings Predictor")
- version: string (e.g., "1.2.0")
- accuracy: string (e.g., "92.4")
- biasStatus: string (one of: "Low", "Medium", "High")
- deploymentDate: string (YYYY-MM-DD)

Example output: [{"name": "Model X", "version": "1.0", "accuracy": "95", "biasStatus": "Low", "deploymentDate": "2024-01-01"}]`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    if (!result || !result.text) {
      throw new Error("No response content from Gemini");
    }

    const text = result.text.trim();
    return JSON.parse(text);
  } catch (err) {
    console.error("Gemini suggestion error:", err);
    return [];
  }
};

export const explainModel = async (modelName: string, version: string, accuracy: string, biasStatus: string) => {
  try {
    const ai = initGemini();
    const prompt = `Provide a brief analysis for a machine learning model with the following details:
Model Name: ${modelName}
Version: ${version}
Accuracy: ${accuracy}%
Risk Status: ${biasStatus}

Your analysis should include:
1. Typical Use Case: 1-2 sentences describing where this model is usually deployed.
2. Potential Bias Concerns: 2-3 sentences explaining what demographic or technical bias risks might exist for this specific type of model.

Format the response in clean Markdown with bold headers. Keep it concise, professional, and matching an AI auditing expert's tone.`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
    });

    if (!result || !result.text) {
      return "No detailed analysis available for this model.";
    }

    return result.text;
  } catch (err) {
    console.error("Gemini model explanation error:", err);
    return "Error generating model analysis.";
  }
};
