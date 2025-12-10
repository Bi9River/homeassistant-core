// ai-assistant.js
// Simplified AI Assistant for Greenhouse Analysis
// Uses Home Assistant backend proxy to avoid CORS issues

class AIAssistant {
  #hass;

  constructor(hass) {
    // Store Home Assistant connection
    this.#hass = hass;
  }

  /**
   * Send a chat message and get a response via Home Assistant service
   * @param {string} content - The message content
   * @param {Array} history - Optional conversation history (not yet implemented)
   * @returns {Promise<string>} - The AI response
   */
  async chat(content, history = []) {
    try {
      // Call Home Assistant service via WebSocket API to get response
      const response = await this.#hass.callWS({
        type: "call_service",
        domain: "hue",
        service: "ai_query",
        service_data: {
          prompt: content,
          stream: false,
        },
        return_response: true,
      });

      // Return the response content
      return response.response.response;
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
   * @note Streaming is not yet implemented, falls back to regular chat
   */
  async *chatStream(content, history = []) {
    try {
      // Streaming via WebSocket is complex, for now fall back to regular chat
      // and yield it as a single chunk
      const result = await this.chat(content, history);
      yield result;
    } catch (error) {
      console.error("Chat stream error:", error);
      throw this.#parseError(error);
    }
  }

  #parseError(error) {
    // Parse Home Assistant service errors
    if (error.message?.includes("API key not configured")) {
      return new Error(
        "DeepSeek API key not configured. Please set DEEPSEEK_API_KEY in your environment or secrets.yaml",
      );
    } else if (error.message?.includes("401")) {
      return new Error("Authentication failed: Invalid API key");
    } else if (error.message?.includes("429")) {
      return new Error("Rate limit exceeded: Please try again later");
    } else if (error.message?.includes("500")) {
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
 * @param {Object} conditions.hass - Home Assistant connection object
 * @returns {Promise<string>} - AI analysis and recommendations
 */
export async function analyzeGreenhouseConditions(conditions) {
  const { temperature, humidity, lightMode, hass } = conditions;

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
    if (!hass) {
      throw new Error("Home Assistant connection not available");
    }
    const assistant = new AIAssistant(hass);
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
  const { temperature, humidity, lightMode, hass } = conditions;

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
    if (!hass) {
      throw new Error("Home Assistant connection not available");
    }
    const assistant = new AIAssistant(hass);
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
