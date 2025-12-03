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

  const prompt = `Based on the following greenhouse conditions, provide a brief analysis and recommendation:
- Temperature: ${temperature}°C
- Humidity: ${humidity}%
- Light Mode: ${
    lightMode === "growth" ? "Cool Daylight (6500K)" : "Warm White (2700K)"
  }

Please provide:
1. Current plant health assessment
2. Any adjustments needed
3. One actionable recommendation

Keep the response concise (2-3 sentences).`;

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

  const prompt = `Based on the following greenhouse conditions, provide a brief analysis and recommendation:
- Temperature: ${temperature}°C
- Humidity: ${humidity}%
- Light Mode: ${
    lightMode === "growth" ? "Cool Daylight (6500K)" : "Warm White (2700K)"
  }

Please provide:
1. Current plant health assessment
2. Any adjustments needed
3. One actionable recommendation

Keep the response concise (2-3 sentences).`;

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
