// ai-assistant.js
// Simplified AI Assistant for Greenhouse Analysis
// Only supports DeepSeek API

import OpenAI from "https://cdn.jsdelivr.net/npm/openai@4.20.1/+esm";
import config from "./API_KEY.js";

class AIAssistant {
  #client;
  #model;

  constructor() {
    // Initialize DeepSeek client
    this.#client = new OpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey: config.DEEPSEEK_API_KEY,
      dangerouslyAllowBrowser: true,
    });
    this.#model = "deepseek-chat";
  }

  /**
   * Send a chat message and get a response
   * @param {string} content - The message content
   * @param {Array} history - Optional conversation history
   * @returns {Promise<string>} - The AI response
   */
  async chat(content, history = []) {
    try {
      const result = await this.#client.chat.completions.create({
        model: this.#model,
        messages: [...history, { content, role: "user" }],
      });
      return result.choices[0].message.content;
    } catch (error) {
      console.error("Chat error:", error);
      throw this.#parseError(error);
    }
  }

  /**
   * Send a chat message and get a streaming response
   * @param {string} content - The message content
   * @param {Array} history - Optional conversation history
   * @yields {string} - Chunks of the AI response
   */
  async *chatStream(content, history = []) {
    try {
      const result = await this.#client.chat.completions.create({
        model: this.#model,
        messages: [...history, { content, role: "user" }],
        stream: true,
      });

      for await (const chunk of result) {
        yield chunk.choices[0]?.delta?.content || "";
      }
    } catch (error) {
      console.error("Chat stream error:", error);
      throw this.#parseError(error);
    }
  }

  #parseError(error) {
    if (error.status === 401) {
      return new Error("Authentication failed: Invalid API key");
    } else if (error.status === 429) {
      return new Error("Rate limit exceeded: Please try again later");
    } else if (error.status === 500) {
      return new Error("Server error: Please try again later");
    }
    return error;
  }
}

/**
 * Analyze greenhouse conditions and provide recommendations
 * @param {Object} conditions - Current greenhouse conditions
 * @param {number} conditions.temperature - Temperature in Celsius
 * @param {number} conditions.humidity - Humidity percentage
 * @param {string} conditions.lightMode - Light mode (growth/rest)
 * @returns {Promise<string>} - AI analysis and recommendations
 */
export async function analyzeGreenhouseConditions(conditions) {
  const { temperature, humidity, lightMode } = conditions;

  const lightModeDesc =
    lightMode === "growth"
      ? "Growth Mode with Cool Daylight (6500K) for photosynthesis"
      : "Rest Mode with Warm White (2700K) for plant recovery";

  const prompt = `You are analyzing a smart greenhouse system with the following current conditions:

**Current Settings:**
- Temperature: ${temperature}°C
- Humidity: ${humidity}%
- Light Mode: ${lightModeDesc}

**CRITICAL SYSTEM CONSTRAINTS:**
- This system has ONLY two preset light modes: Growth Mode (6500K) and Rest Mode (2700K)
- The light settings are FIXED and CANNOT be modified by the user
- NEVER suggest: "switch to", "change to", "increase light", "adjust spectrum", or any light modifications
- The current light mode is working as designed and should be accepted as-is
- Focus ONLY on: temperature adjustments, humidity control, watering timing, and general plant care

**Your Task:**
Provide a brief assessment focusing on:
1. How suitable the current temperature and humidity are for plant health
2. Any adjustments needed for temperature or humidity (NOT light)
3. One actionable care tip (watering schedule, ventilation, monitoring, etc.)

Keep the response positive, constructive, and concise (2-3 sentences). NEVER mention changing light modes or color temperature.`;

  try {
    const assistant = new AIAssistant();
    const response = await assistant.chat(prompt);
    return response;
  } catch (error) {
    console.error("AI Analysis error:", error);
    throw error;
  }
}

/**
 * Analyze greenhouse conditions with streaming response
 * @param {Object} conditions - Current greenhouse conditions
 * @param {Function} onChunk - Callback for each chunk of response
 * @returns {Promise<void>}
 */
export async function analyzeGreenhouseConditionsStream(conditions, onChunk) {
  const { temperature, humidity, lightMode } = conditions;

  const lightModeDesc =
    lightMode === "growth"
      ? "Growth Mode with Cool Daylight (6500K) for photosynthesis"
      : "Rest Mode with Warm White (2700K) for plant recovery";

  const prompt = `You are analyzing a smart greenhouse system with the following current conditions:

**Current Settings:**
- Temperature: ${temperature}°C
- Humidity: ${humidity}%
- Light Mode: ${lightModeDesc}

**CRITICAL SYSTEM CONSTRAINTS:**
- This system has ONLY two preset light modes: Growth Mode (6500K) and Rest Mode (2700K)
- The light settings are FIXED and CANNOT be modified by the user
- NEVER suggest: "switch to", "change to", "increase light", "adjust spectrum", or any light modifications
- The current light mode is working as designed and should be accepted as-is
- Focus ONLY on: temperature adjustments, humidity control, watering timing, and general plant care

**Your Task:**
Provide a brief assessment focusing on:
1. How suitable the current temperature and humidity are for plant health
2. Any adjustments needed for temperature or humidity (NOT light)
3. One actionable care tip (watering schedule, ventilation, monitoring, etc.)

Keep the response positive, constructive, and concise (2-3 sentences). NEVER mention changing light modes or color temperature.`;

  try {
    const assistant = new AIAssistant();
    let fullResponse = "";

    for await (const chunk of assistant.chatStream(prompt)) {
      fullResponse += chunk;
      onChunk(chunk, fullResponse);
    }
  } catch (error) {
    console.error("AI Analysis stream error:", error);
    throw error;
  }
}

// Export the AIAssistant class for advanced usage
export { AIAssistant };
