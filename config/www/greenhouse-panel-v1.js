import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit@3.0.0/index.js?module";
import { analyzeGreenhouseConditions, AIAssistant } from "./ai-assistant.js";

class GreenhousePanel extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      narrow: { type: Boolean },
      route: { type: Object },
      panel: { type: Object },
      _simMode: { type: Boolean },
      _simTemp: { type: Number },
      _simHumidity: { type: Number },
      _simLight: { type: Number },
      _lightMode: { type: String }, // 'growth' or 'rest'
      _autoLightEnabled: { type: Boolean }, // Auto light control state
      _simLightState: { type: String }, // Simulated light state: 'on' or 'off'
      _simBrightness: { type: Number }, // Simulated brightness
      _simColorTemp: { type: Number }, // Simulated color temp
      _aiAnalysis: { type: String }, // AI analysis result
      _aiLoading: { type: Boolean }, // AI loading state
      _showPresetQuestions: { type: Boolean }, // Show preset questions panel
    };
  }

  constructor() {
    super();
    this._simMode = true;
    this._simTemp = 24.5;
    this._simHumidity = 65;
    this._simLight = 8500;
    this._lightMode = "growth";
    this._autoLightEnabled = false;
    // Simulated light properties
    this._simLightState = "off";
    this._simBrightness = 255;
    this._simColorTemp = 153;
    this._aiAnalysis = "";
    this._aiLoading = false;
    this._showPresetQuestions = false;
  }

  render() {
    return html`
      <link rel="stylesheet" href="/local/greenhouse-panel-styles.css" />

      <div class="container">
        ${this._renderHeader()}

        <div class="dashboard-grid">
          ${this._renderWateringCard()} ${this._renderLightingCard()}
          ${this._renderAIAnalysisCard()} ${this._renderSensorControlCard()}
        </div>

        <!-- Second Row: Half-width layout -->
        <div class="dashboard-grid-half">
          ${this._renderDevicesCard()}
          <div class="schedule-row">
            ${this._renderWateringSchedule()} ${this._renderLightingSchedule()}
          </div>
        </div>
      </div>
    `;
  }

  // Header & Status Bar - REMOVED DEMO VERSION
  _renderHeader() {
    return html`
      <div class="header">
        <h1>
          <span>🌱</span>
          <span>Greenhouse Control Panel</span>
        </h1>
        <p class="header-subtitle">Smart Plant Care Automation System</p>

        <div class="status-bar">
          <div class="status-item">
            <span class="status-dot"></span>
            <span>System Running</span>
          </div>
          <div class="status-item">
            <span
              >${this._lightMode === "growth"
                ? "🌞 Growth Mode"
                : "🌙 Rest Mode"}</span
            >
          </div>
          <div class="status-item">
            <span>⏰ Last Watering: 2 hours ago</span>
          </div>
        </div>
      </div>
    `;
  }

  // Smart Watering Control
  _renderWateringCard() {
    const autoWateringState =
      this.hass.states["switch.auto_watering"]?.state || "off";

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">💧</span>
            <span>Smart Watering Control</span>
          </div>
        </div>

        <div class="control-group">
          <div class="control-item">
            <span>Auto Watering</span>
            <div
              class="toggle-switch ${autoWateringState === "on"
                ? "active"
                : ""}"
              @click=${this._toggleAutoWatering}
            ></div>
          </div>
          <div class="control-item">
            <span>Next Watering Time</span>
            <span style="color: var(--primary-color); font-weight: 600;"
              >18:00</span
            >
          </div>
        </div>

        <button class="button" @click=${this._manualWater}>
          ⚡ Manual Water Now
        </button>
      </div>
    `;
  }

  // Smart Lighting Control
  _renderLightingCard() {
    const isLightOn = this._simLightState === "on";

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">💡</span>
            <span>Smart Lighting Control</span>
          </div>
        </div>

        <div class="control-group">
          <!-- Auto Light Control Toggle -->
          <div class="control-item">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span>Auto Light Control</span>
              <span
                style="font-size: 11px; color: var(--secondary-text-color);"
              >
                ${this._autoLightEnabled
                  ? "Schedule-based automation"
                  : "Manual control mode"}
              </span>
            </div>
            <div
              class="toggle-switch ${this._autoLightEnabled ? "active" : ""}"
              @click=${this._toggleAutoLight}
            ></div>
          </div>

          <!-- Current Light Status -->
          <div class="control-item">
            <span>Light Status</span>
            <span
              style="color: ${isLightOn
                ? "var(--success-color)"
                : "var(--disabled-text-color)"}; font-weight: 600;"
            >
              ${isLightOn ? "✓ On" : "○ Off"}
            </span>
          </div>

          <!-- Current Mode -->
          <div class="control-item">
            <span>Current Mode</span>
            <span style="color: var(--primary-color); font-weight: 600;">
              ${this._lightMode === "growth"
                ? "🌞 Growth Mode"
                : "🌙 Rest Mode"}
            </span>
          </div>

          <!-- Color Temperature -->
          <div class="control-item">
            <span>Color Temperature</span>
            <span style="color: var(--warning-color); font-size: 13px;">
              ${this._lightMode === "growth"
                ? "☀️ Cool Daylight (6500K)"
                : "🌙 Warm White (2700K)"}
            </span>
          </div>
        </div>

        <!-- Quick Manual Control -->
        <button
          class="button ${isLightOn ? "" : "secondary"}"
          @click=${this._manualToggleLight}
          style="margin-top: 12px;"
        >
          ${isLightOn ? "💡 Turn Off Light" : "💡 Turn On Light"}
        </button>

        <!-- Mode Selection Buttons -->
        <div
          class="divider"
          style="margin: 16px 0; font-size: 13px; color: var(--secondary-text-color); text-align: center;"
        >
          Apply Scene Presets
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button
            class="button ${this._lightMode === "growth" ? "" : "secondary"}"
            @click=${() => this._applyLightScene("growth")}
          >
            🌞 Growth Mode
          </button>
          <button
            class="button ${this._lightMode === "rest" ? "" : "secondary"}"
            @click=${() => this._applyLightScene("rest")}
          >
            🌙 Rest Mode
          </button>
        </div>
      </div>
    `;
  }

  // NEW: AI Analysis System Card
  _renderAIAnalysisCard() {
    // Preset questions for quick AI consultation
    const presetQuestions = [
      {
        icon: "🌱",
        question: "How can I optimize plant growth?",
        category: "Growth",
      },
      {
        icon: "💧",
        question: "Is my humidity level appropriate?",
        category: "Environment",
      },
      {
        icon: "🌡️",
        question: "Should I adjust the temperature?",
        category: "Environment",
      },
      {
        icon: "💡",
        question: "Is my lighting setup optimal?",
        category: "Lighting",
      },
      {
        icon: "🐛",
        question: "How to prevent common plant diseases?",
        category: "Health",
      },
      {
        icon: "⏰",
        question: "What's the best watering schedule?",
        category: "Care",
      },
    ];

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">🤖</span>
            <span>AI Analysis System</span>
          </div>
          <button
            class="preset-toggle-btn"
            @click=${this._togglePresetQuestions}
            title="Quick Questions"
          >
            <span class="btn-icon"
              >${this._showPresetQuestions ? "✕" : "💬"}</span
            >
            <span class="btn-text"
              >${this._showPresetQuestions ? "Close" : "Quick Questions"}</span
            >
          </button>
        </div>

        <div style="margin: 16px 0;">
          <div
            style="font-size: 13px; color: var(--secondary-text-color); margin-bottom: 12px; font-weight: 500;"
          >
            Current Environment:
          </div>
          <div
            style="display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: var(--primary-text-color);"
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>🌡️</span>
              <span style="color: var(--secondary-text-color);"
                >Temperature:</span
              >
              <strong>${this._simTemp}°C</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>💧</span>
              <span style="color: var(--secondary-text-color);">Humidity:</span>
              <strong>${this._simHumidity}%</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>💡</span>
              <span style="color: var(--secondary-text-color);">Light:</span>
              <strong
                >${this._lightMode === "growth"
                  ? "Cool Daylight (6500K)"
                  : "Warm White (2700K)"}</strong
              >
            </div>
          </div>
        </div>

        <!-- Preset Questions Panel -->
        ${this._showPresetQuestions
          ? html`
              <div class="preset-questions-panel">
                <div class="preset-questions-header">
                  <span>💬</span>
                  <span>Quick Questions</span>
                </div>
                <div class="preset-questions-grid">
                  ${presetQuestions.map(
                    (q) => html`
                      <button
                        class="preset-question-btn"
                        @click=${() => this._askPresetQuestion(q.question)}
                        ?disabled=${this._aiLoading}
                      >
                        <span class="question-icon">${q.icon}</span>
                        <span class="question-text">${q.question}</span>
                      </button>
                    `,
                  )}
                </div>
              </div>
            `
          : ""}
        ${this._aiAnalysis
          ? html`
              <div class="ai-recommendation-box">
                <div class="ai-recommendation-header">
                  <span>🤖</span>
                  <span>AI Recommendation:</span>
                </div>
                <div class="ai-recommendation-content">
                  ${this._formatAIResponse(this._aiAnalysis)}
                </div>
              </div>
            `
          : ""}

        <button
          class="button"
          @click=${this._analyzeWithAI}
          ?disabled=${this._aiLoading}
          style="margin-top: 12px;"
        >
          ${this._aiLoading
            ? "⏳ Analyzing..."
            : "🤖 Analyze Current Conditions"}
        </button>

        ${this._aiAnalysis
          ? html`
              <button
                class="button secondary"
                @click=${this._clearAIAnalysis}
                style="margin-top: 8px;"
              >
                🗑️ Clear Result
              </button>
            `
          : ""}
      </div>
    `;
  }

  // Format AI response into readable HTML with markdown support
  _formatAIResponse(text) {
    if (!text) return "";

    // First, handle markdown bold (**text** or __text__)
    let processedText = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    processedText = processedText.replace(
      /__([^_]+)__/g,
      "<strong>$1</strong>",
    );

    // Handle markdown italic (*text* or _text_)
    processedText = processedText.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    processedText = processedText.replace(/_([^_]+)_/g, "<em>$1</em>");

    // Split by numbered points (1., 2., 3., etc.)
    const parts = processedText.split(/(\d+\.\s)/);
    const formattedParts = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;

      // Check if it's a number marker
      if (/^\d+\.\s*$/.test(part)) {
        // Get the next part (the content)
        if (i + 1 < parts.length) {
          const content = parts[i + 1].trim();
          formattedParts.push(html`
            <div class="ai-point">
              <span class="ai-point-number">${part}</span>
              <span class="ai-point-text" .innerHTML=${content}></span>
            </div>
          `);
          i++; // Skip the next part as we've already processed it
        }
      } else if (i === 0 || !parts[i - 1] || !/^\d+\.\s*$/.test(parts[i - 1])) {
        // It's a non-numbered text (like an introduction)
        formattedParts.push(html`
          <div class="ai-intro-text" .innerHTML=${part}></div>
        `);
      }
    }

    return formattedParts.length > 0
      ? formattedParts
      : html`<div .innerHTML=${processedText}></div>`;
  }

  // NEW: Simplified Sensor Mock System Card (Temperature and Humidity only)
  _renderSensorControlCard() {
    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">🎛️</span>
            <span>Sensor Mock System</span>
          </div>
        </div>

        <!-- Temperature Slider -->
        <div class="slider-container">
          <div class="slider-header">
            <span class="slider-label">🌡️ Simulated Temperature</span>
            <span class="slider-value">${this._simTemp.toFixed(1)}°C</span>
          </div>
          <input
            type="range"
            min="0"
            max="40"
            step="0.5"
            .value=${this._simTemp}
            @input=${(e) => this._updateSimValue("temp", e.target.value)}
          />
          <div class="slider-marks">
            <span>0°C</span>
            <span>20°C</span>
            <span>40°C</span>
          </div>
        </div>

        <!-- Humidity Slider -->
        <div class="slider-container">
          <div class="slider-header">
            <span class="slider-label">💧 Simulated Humidity</span>
            <span class="slider-value">${this._simHumidity}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            .value=${this._simHumidity}
            @input=${(e) => this._updateSimValue("humidity", e.target.value)}
          />
          <div class="slider-marks">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <!-- Progress Bar for Humidity -->
        <div style="margin-top: 16px;">
          <div
            style="display: flex; justify-content: space-between; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px;"
          >
            <span>Moisture Level</span>
            <span>${this._simHumidity}%</span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              style="width: ${this._simHumidity}%; background: ${this
                ._simHumidity < 40
                ? "var(--warning-color)"
                : "var(--success-color)"};"
            ></div>
          </div>
        </div>
      </div>
    `;
  }

  // Greenhouse Devices Overview - HALF WIDTH
  _renderDevicesCard() {
    const isLightOn = this._simLightState === "on";

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">🏡</span>
            <span>Greenhouse Devices Overview</span>
          </div>
        </div>

        <div class="device-list">
          <div class="device-card active" @click=${this._handleDeviceClick}>
            <div class="device-icon">🔌</div>
            <div class="device-name">Smart Plug</div>
            <div class="device-status">Running</div>
          </div>

          <div
            class="device-card ${isLightOn ? "active" : ""}"
            @click=${this._handleDeviceClick}
          >
            <div class="device-icon">💡</div>
            <div class="device-name">Grow Light</div>
            <div class="device-status">${isLightOn ? "On" : "Off"}</div>
          </div>
        </div>
      </div>
    `;
  }

  // Watering Schedule - HALF WIDTH
  _renderWateringSchedule() {
    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">📅</span>
            <span>Watering Schedule</span>
          </div>
        </div>

        <div class="schedule-item">
          <div class="schedule-time">☀️ Daily at 06:00</div>
          <div class="schedule-action">
            Morning watering - 5 minutes duration
          </div>
        </div>

        <div class="schedule-item">
          <div class="schedule-time">🌙 Daily at 18:00</div>
          <div class="schedule-action">
            Evening watering - 5 minutes duration
          </div>
        </div>
      </div>
    `;
  }

  // Lighting Schedule - HALF WIDTH
  _renderLightingSchedule() {
    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">💡</span>
            <span>Lighting Schedule</span>
          </div>
        </div>

        <div class="schedule-item">
          <div class="schedule-time">☀️ Growth Period (06:00-22:00)</div>
          <div class="schedule-action">
            Cool daylight (6500K), 100% brightness
          </div>
        </div>

        <div class="schedule-item">
          <div class="schedule-time">🌙 Rest Period (22:00-06:00)</div>
          <div class="schedule-action">Warm white (2700K), 20% brightness</div>
        </div>
      </div>
    `;
  }

  // ==================== EVENT HANDLERS ====================

  // Toggle developer simulation mode
  _toggleSimMode() {
    this._simMode = !this._simMode;
    this.requestUpdate();
  }

  // Toggle auto watering
  _toggleAutoWatering() {
    this.hass.callService("switch", "toggle", {
      entity_id: "switch.auto_watering",
    });
  }

  // Toggle auto light control (schedule-based)
  _toggleAutoLight() {
    this._autoLightEnabled = !this._autoLightEnabled;

    if (this._autoLightEnabled) {
      this._simLightState = "on";
      const settings = this._getLightSettings(this._lightMode);
      this._simBrightness = settings.brightness;
      this._simColorTemp = settings.color_temp;

      this.dispatchEvent(
        new CustomEvent("hass-notification", {
          detail: {
            message:
              "Auto light control enabled - Light turned on with schedule settings",
          },
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      this.dispatchEvent(
        new CustomEvent("hass-notification", {
          detail: {
            message: "Auto light control disabled - Switched to manual mode",
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    this.requestUpdate();
  }

  // Manual toggle light
  _manualToggleLight() {
    if (this._simLightState === "on") {
      this._simLightState = "off";

      if (this._autoLightEnabled) {
        this._autoLightEnabled = false;
        this.dispatchEvent(
          new CustomEvent("hass-notification", {
            detail: { message: "Light turned off - Auto control disabled" },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        this.dispatchEvent(
          new CustomEvent("hass-notification", {
            detail: { message: "Light turned off" },
            bubbles: true,
            composed: true,
          }),
        );
      }
    } else {
      this._simLightState = "on";
      const settings = this._getLightSettings(this._lightMode);
      this._simBrightness = settings.brightness;
      this._simColorTemp = settings.color_temp;

      this.dispatchEvent(
        new CustomEvent("hass-notification", {
          detail: {
            message: `Light turned on - ${
              this._lightMode === "growth" ? "Growth" : "Rest"
            } Mode`,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    this.requestUpdate();
  }

  // Apply light scene
  _applyLightScene(mode) {
    this._lightMode = mode;
    const settings = this._getLightSettings(mode);

    this._simLightState = "on";
    this._simBrightness = settings.brightness;
    this._simColorTemp = settings.color_temp;

    const modeName = mode === "growth" ? "Growth Mode" : "Rest Mode";
    this.dispatchEvent(
      new CustomEvent("hass-notification", {
        detail: { message: `${modeName} applied` },
        bubbles: true,
        composed: true,
      }),
    );

    this.requestUpdate();
  }

  // Get light settings
  _getLightSettings(mode) {
    if (mode === "growth") {
      return {
        brightness: 255,
        color_temp: 153,
      };
    } else {
      return {
        brightness: 50,
        color_temp: 370,
      };
    }
  }

  // Manual watering
  _manualWater() {
    this.hass.callService("switch", "turn_on", {
      entity_id: "switch.manual_watering",
    });

    this.dispatchEvent(
      new CustomEvent("hass-notification", {
        detail: { message: "Manual watering started" },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // Handle device card click
  _handleDeviceClick() {
    this.dispatchEvent(
      new CustomEvent("hass-notification", {
        detail: { message: "Device details clicked" },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // Update simulation values
  _updateSimValue(type, value) {
    switch (type) {
      case "temp":
        this._simTemp = parseFloat(value);
        this._updateSensor("input_number.sim_temperature", this._simTemp);
        break;
      case "humidity":
        this._simHumidity = parseInt(value);
        this._updateSensor("input_number.sim_humidity", this._simHumidity);
        break;
    }
    this.requestUpdate();
  }

  // Update sensor value
  _updateSensor(entityId, value) {
    if (this.hass.states[entityId]) {
      this.hass.callService("input_number", "set_value", {
        entity_id: entityId,
        value: value,
      });
    }
  }

  // Handle preset question click
  async _askPresetQuestion(question) {
    this._aiLoading = true;
    this._aiAnalysis = "";
    this.requestUpdate();

    try {
      const conditions = {
        temperature: this._simTemp,
        humidity: this._simHumidity,
        lightMode: this._lightMode,
      };

      console.log("Asking preset question:", question);

      // Import the AI assistant function
      const { AIAssistant } = await import("./ai-assistant.js");
      const assistant = new AIAssistant();

      // Create context-aware prompt
      const contextPrompt = `Current greenhouse conditions:
- Temperature: ${conditions.temperature}°C
- Humidity: ${conditions.humidity}%
- Light Mode: ${
        conditions.lightMode === "growth"
          ? "Cool Daylight (6500K)"
          : "Warm White (2700K)"
      }

Question: ${question}

Please provide a specific answer based on these current conditions. Keep the response concise (2-3 sentences).`;

      const response = await assistant.chat(contextPrompt);

      console.log("AI Response:", response);
      this._aiAnalysis = response;
    } catch (error) {
      console.error("Preset question error:", error);

      if (error.message.includes("Invalid API key")) {
        this._aiAnalysis =
          "⚠️ Authentication failed: Please check your API key in config.js";
      } else if (error.message.includes("Rate limit")) {
        this._aiAnalysis = "⚠️ Rate limit exceeded: Please try again later.";
      } else {
        this._aiAnalysis = `⚠️ Error: ${error.message}`;
      }
    } finally {
      this._aiLoading = false;
      this.requestUpdate();
    }
  }

  // NEW: Analyze with AI using the ai-assistant module
  async _analyzeWithAI() {
    this._aiLoading = true;
    this._aiAnalysis = "";
    this.requestUpdate();

    try {
      const conditions = {
        temperature: this._simTemp,
        humidity: this._simHumidity,
        lightMode: this._lightMode,
      };

      console.log("Sending AI request with conditions:", conditions);

      // Use the imported AI assistant function (DeepSeek only)
      const response = await analyzeGreenhouseConditions(conditions);

      console.log("AI Response:", response);
      this._aiAnalysis = response;
    } catch (error) {
      console.error("AI Analysis error:", error);

      // Provide user-friendly error messages
      if (error.message.includes("Invalid API key")) {
        this._aiAnalysis =
          "⚠️ Authentication failed: Please check your API key in config.js";
      } else if (error.message.includes("Rate limit")) {
        this._aiAnalysis = "⚠️ Rate limit exceeded: Please try again later.";
      } else if (
        error.message.includes("Failed to fetch") ||
        error.message.includes("NetworkError")
      ) {
        this._aiAnalysis =
          "⚠️ Network error: Please check your internet connection and API configuration.";
      } else {
        this._aiAnalysis = `⚠️ Error: ${error.message}`;
      }
    } finally {
      this._aiLoading = false;
      this.requestUpdate();
    }
  }

  // Toggle preset questions panel
  _togglePresetQuestions() {
    this._showPresetQuestions = !this._showPresetQuestions;
    this.requestUpdate();
  }

  // Ask a preset question
  async _askPresetQuestion(question) {
    this._aiLoading = true;
    this._aiAnalysis = "";
    this._showPresetQuestions = false; // Close the panel after selecting
    this.requestUpdate();

    try {
      const conditions = {
        temperature: this._simTemp,
        humidity: this._simHumidity,
        lightMode: this._lightMode,
      };

      const lightModeDesc =
        conditions.lightMode === "growth"
          ? "Growth Mode with Cool Daylight (6500K) for photosynthesis"
          : "Rest Mode with Warm White (2700K) for plant recovery";

      // Create a custom prompt that includes both the question and current conditions
      const prompt = `You are a greenhouse management assistant analyzing the following setup:

**Current Conditions:**
- Temperature: ${conditions.temperature}°C
- Humidity: ${conditions.humidity}%
- Light Mode: ${lightModeDesc}

**CRITICAL SYSTEM CONSTRAINTS:**
- This system has ONLY two preset light modes: Growth Mode (6500K) and Rest Mode (2700K)
- The light settings are FIXED and CANNOT be adjusted or changed
- The user CANNOT change color temperature, spectrum, or brightness
- NEVER suggest: "switch to", "change to", "adjust light to", or any light mode modifications
- If the current light mode is appropriate, simply acknowledge it
- Focus ONLY on: temperature control, humidity adjustments, watering schedule, ventilation, and plant care timing

**User Question:** ${question}

Provide a helpful answer that ACCEPTS the current light mode as-is. Do NOT suggest any light changes. Keep the response practical and actionable (2-4 sentences).`;

      console.log("Asking preset question:", question);

      // Use the AI assistant directly with custom prompt
      const assistant = new AIAssistant();
      const response = await assistant.chat(prompt);

      console.log("AI Response:", response);
      this._aiAnalysis = response;
    } catch (error) {
      console.error("Preset question error:", error);

      if (error.message.includes("Invalid API key")) {
        this._aiAnalysis =
          "⚠️ Authentication failed: Please check your API key in config.js";
      } else if (error.message.includes("Rate limit")) {
        this._aiAnalysis = "⚠️ Rate limit exceeded: Please try again later.";
      } else {
        this._aiAnalysis = `⚠️ Error: ${error.message}`;
      }
    } finally {
      this._aiLoading = false;
      this.requestUpdate();
    }
  }

  // Clear AI analysis result
  _clearAIAnalysis() {
    this._aiAnalysis = "";
    this.requestUpdate();
  }

  static get styles() {
    return css`
      :host {
        display: block;
        height: 100%;
        background-color: var(--primary-background-color);
      }
    `;
  }
}

customElements.define("greenhouse-panel", GreenhousePanel);
