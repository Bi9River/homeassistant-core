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
      panel: { type: Object },
      // Define internal reactive properties for optimistic UI updates
      _waterActive: { type: Boolean, state: true },
      _lightOn: { type: Boolean, state: true },
      _greenhouseActive: { type: Boolean, state: true },
      _greenhouseMode: { type: String, state: true },
      _simTemp: { type: Number }, // Used in Sensor Panel
      _simHumidity: { type: Number }, // Used in Sensor Panel
      _aiAnalysis: { type: String }, // AI analysis result
      _aiLoading: { type: Boolean }, // AI loading state
      _showPresetQuestions: { type: Boolean }, // Show preset questions panel

      wateringSchedule: { type: Object },
      greenhouseSchedule: { type: Object },
    };
  }

  constructor() {
    super();
    this.lightEntityId = "light.tai_deng_3";
    this.plugEntityId = "light.nuan_qi";

    this._waterActive = false;
    this._lightOn = false;
    this._greenhouseActive = false;
    this._greenhouseMode = "manual";
    this._wateringEndTime = null;
    this._wateringCountdownInterval = null;
    this._wateringRemainingSeconds = 0;

    this._pendingLightToggle = false;
    this._pendingAutoToggle = false;
    this._pendingSceneChange = false;
    this._pendingWaterActivate = false;

    this._simTemp = 24.5;
    this._simHumidity = 65;
    this._aiAnalysis = "";
    this._aiLoading = false;
    this._showPresetQuestions = false;

    this.wateringSchedule = {
      time: "12:00",
      hour: 12,
      minute: 0,
      duration: 30,
    };

    this.greenhouseSchedule = {
      growthTime: "06:00",
      restTime: "18:00",
      growthHour: 6,
      restHour: 18,
    };
  }

  willUpdate(changedProperties) {
    if (changedProperties.has("hass") && this.hass) {
      const plugStateObj = this.hass.states[this.plugEntityId];
      const lightStateObj = this.hass.states[this.lightEntityId];

      if (plugStateObj) {
        if (!this._pendingWaterActivate) {
          const newWaterActive =
            plugStateObj.attributes.watering_active === true;
          if (this._waterActive && !newWaterActive) {
            this._stopWateringCountdown();
          }
          this._waterActive = newWaterActive;
        }

        // Sync watering schedule from backend
        const backendHour = plugStateObj.attributes.watering_hour;
        const backendMinute = plugStateObj.attributes.watering_minute;
        if (backendHour !== undefined && backendMinute !== undefined) {
          this.wateringSchedule = {
            time: `${String(backendHour).padStart(2, "0")}:${String(
              backendMinute,
            ).padStart(2, "0")}`,
            hour: backendHour,
            minute: backendMinute,
            duration: 30,
          };
        }
      }

      if (lightStateObj) {
        if (
          !this._pendingLightToggle &&
          !this._pendingAutoToggle &&
          !this._pendingSceneChange
        ) {
          this._lightOn = lightStateObj.state === "on";
        }

        if (!this._pendingAutoToggle && !this._pendingSceneChange) {
          this._greenhouseActive =
            lightStateObj.attributes.greenhouse_active === true;
          this._greenhouseMode =
            lightStateObj.attributes.greenhouse_mode || "manual";
        }

        // Sync greenhouse schedule from backend
        const backendGrowthHour = lightStateObj.attributes.growth_hour;
        const backendRestHour = lightStateObj.attributes.rest_hour;
        if (backendGrowthHour !== undefined && backendRestHour !== undefined) {
          this.greenhouseSchedule = {
            growthTime: `${String(backendGrowthHour).padStart(2, "0")}:00`,
            restTime: `${String(backendRestHour).padStart(2, "0")}:00`,
            growthHour: backendGrowthHour,
            restHour: backendRestHour,
          };
        }
      }
    }
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

  // Header & Status Bar
  _renderHeader() {
    return html`
      <div class="header">
        <h1>
          <ha-icon
            icon="mdi:sprout"
            style="width: 32px; height: 32px;"
          ></ha-icon>
          <span>Greenhouse Control Panel</span>
        </h1>
        <p class="header-subtitle">Smart Plant Care Automation System</p>
        <div class="status-bar">
          <div class="status-item">
            <span class="status-dot"></span>
            <span>System Connected</span>
          </div>
          <div class="status-item">
            <span style="display: flex; align-items: center; gap: 4px;">
              ${this._greenhouseActive
                ? html`<ha-icon icon="mdi:autorenew"></ha-icon> Auto Light
                    Control`
                : html`<ha-icon icon="mdi:cog"></ha-icon> Manual Light Control`}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  _renderWateringCard() {
    // Next time is managed by backend, so we still read from hass directly for this specific value
    const plugStateObj = this.hass.states[this.plugEntityId];
    const nextWatering =
      plugStateObj?.attributes?.next_watering_time || "--:--";

    let nextTimeDisplay = nextWatering;
    if (nextWatering.includes("T")) {
      const date = new Date(nextWatering);
      nextTimeDisplay = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <ha-icon icon="mdi:water-outline" class="icon"></ha-icon>
            <span>Smart Watering Control</span>
          </div>
        </div>

        <div class="control-group">
          <div class="control-item">
            <span>Status</span>
            <span
              style="color: ${this._waterActive
                ? "var(--primary-color)"
                : "var(--secondary-text-color)"}; font-weight: 600;"
            >
              ${this._waterActive
                ? html`<ha-icon icon="mdi:water"></ha-icon> PUMPING ACTIVE
                    (${this._wateringRemainingSeconds}s)`
                : html`<ha-icon icon="mdi:sleep"></ha-icon> Idle`}
            </span>
          </div>
          <div class="control-item">
            <span>Next Auto-Run</span>
            <span style="color: var(--primary-color); font-weight: 600;">
              ${nextTimeDisplay}
            </span>
          </div>
        </div>

        <button class="button" @click=${this._handleManualWater}>
          ${this._waterActive
            ? html`<ha-icon icon="mdi:autorenew"></ha-icon> Continue 30s`
            : html`<ha-icon icon="mdi:flash"></ha-icon> Manual Water (30s)`}
        </button>
      </div>
    `;
  }

  _renderLightingCard() {
    let modeDisplay = "Manual Mode";

    // If auto mode is active, show the current auto mode
    if (this._greenhouseActive) {
      if (this._greenhouseMode === "growth") {
        modeDisplay = html`<ha-icon icon="mdi:weather-sunny"></ha-icon> Growth
          Mode`;
      } else if (this._greenhouseMode === "rest") {
        modeDisplay = html`<ha-icon icon="mdi:weather-night"></ha-icon> Rest
          Mode`;
      } else {
        // Fallback during transition
        modeDisplay = html`<ha-icon icon="mdi:autorenew"></ha-icon> Auto Mode`;
      }
    } else {
      // Manual mode
      modeDisplay = html`<ha-icon icon="mdi:cog"></ha-icon> Manual Mode`;
    }

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <ha-icon icon="mdi:lightbulb" class="icon"></ha-icon>
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
                ${this._greenhouseActive ? "Schedule active" : "Manual control"}
              </span>
            </div>
            <div
              class="toggle-switch ${this._greenhouseActive ? "active" : ""}"
              @click=${this._handleAutoLightToggle}
            ></div>
          </div>

          <!-- Status -->
          <div class="control-item">
            <span>Light Status</span>
            <span
              style="color: ${this._lightOn
                ? "var(--success-color)"
                : "var(--disabled-text-color)"}; font-weight: 600;"
            >
              ${this._lightOn
                ? html`<ha-icon icon="mdi:check"></ha-icon> ON`
                : html`<ha-icon icon="mdi:circle-outline"></ha-icon> OFF`}
            </span>
          </div>

          <!-- Mode -->
          <div class="control-item">
            <span>Current Mode</span>
            <span style="color: var(--primary-color); font-weight: 600;">
              ${modeDisplay}
            </span>
          </div>
        </div>

        <!-- Manual Toggle Button -->
        <button
          class="button ${this._lightOn ? "" : "secondary"}"
          @click=${this._handleManualLightToggle}
          style="margin-top: 12px;"
        >
          ${this._lightOn
            ? html`<ha-icon icon="mdi:lightbulb-off"></ha-icon> Turn Off Light`
            : html`<ha-icon icon="mdi:lightbulb-on"></ha-icon> Turn On Light`}
        </button>

        <!-- Scene Buttons -->
        <div
          class="divider"
          style="margin: 16px 0; font-size: 13px; color: var(--secondary-text-color); text-align: center;"
        >
          Force Scene Presets
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button
            class="button ${this._greenhouseMode === "growth"
              ? ""
              : "secondary"}"
            @click=${() => this._handleSceneClick("growth")}
          >
            <ha-icon icon="mdi:weather-sunny"></ha-icon> Growth
          </button>
          <button
            class="button ${this._greenhouseMode === "rest" ? "" : "secondary"}"
            @click=${() => this._handleSceneClick("rest")}
          >
            <ha-icon icon="mdi:weather-night"></ha-icon> Rest
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
        icon: "mdi:sprout",
        question: "How can I optimize plant growth?",
        category: "Growth",
      },
      {
        icon: "mdi:water-percent",
        question: "Is my humidity level appropriate?",
        category: "Environment",
      },
      {
        icon: "mdi:thermometer",
        question: "Should I adjust the temperature?",
        category: "Environment",
      },
      {
        icon: "mdi:lightbulb",
        question: "Is my lighting setup optimal?",
        category: "Lighting",
      },
      {
        icon: "mdi:bug",
        question: "How to prevent common plant diseases?",
        category: "Health",
      },
      {
        icon: "mdi:clock-outline",
        question: "What's the best watering schedule?",
        category: "Care",
      },
    ];

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <ha-icon icon="mdi:robot" class="icon"></ha-icon>
            <span>AI Analysis System</span>
          </div>
          <button
            class="preset-toggle-btn"
            @click=${this._togglePresetQuestions}
            title="Quick Questions"
          >
            <span class="btn-icon">
              ${this._showPresetQuestions
                ? html`<ha-icon icon="mdi:close"></ha-icon>`
                : html`<ha-icon icon="mdi:chat"></ha-icon>`}
            </span>
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
              <ha-icon icon="mdi:thermometer"></ha-icon>
              <span style="color: var(--secondary-text-color);"
                >Temperature:</span
              >
              <strong>${this._simTemp}°C</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <ha-icon icon="mdi:water-percent"></ha-icon>
              <span style="color: var(--secondary-text-color);">Humidity:</span>
              <strong>${this._simHumidity}%</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <ha-icon icon="mdi:lightbulb"></ha-icon>
              <span style="color: var(--secondary-text-color);">Light:</span>
              <strong
                >${this._greenhouseMode === "growth"
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
                  <ha-icon icon="mdi:chat"></ha-icon>
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
                        <ha-icon
                          icon="${q.icon}"
                          class="question-icon"
                        ></ha-icon>
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
                  <ha-icon icon="mdi:robot"></ha-icon>
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
            ? html`<ha-icon icon="mdi:loading" class="spin"></ha-icon>
                Analyzing...`
            : html`<ha-icon icon="mdi:robot"></ha-icon> Analyze Current
                Conditions`}
        </button>

        ${this._aiAnalysis
          ? html`
              <button
                class="button secondary"
                @click=${this._clearAIAnalysis}
                style="margin-top: 8px;"
              >
                <ha-icon icon="mdi:delete"></ha-icon> Clear Result
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
    // Limit to reasonable number lengths (1-3 digits) to prevent ReDoS
    const parts = processedText.split(/(\d{1,3}\.\s)/);
    const formattedParts = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;

      // Check if it's a number marker
      if (/^\d{1,3}\.\s*$/.test(part)) {
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
            <ha-icon icon="mdi:tune" class="icon"></ha-icon>
            <span>Sensor Mock System</span>
          </div>
        </div>

        <!-- Temperature Slider -->
        <div class="slider-container">
          <div class="slider-header">
            <span class="slider-label"
              ><ha-icon icon="mdi:thermometer"></ha-icon> Simulated
              Temperature</span
            >
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
            <span class="slider-label"
              ><ha-icon icon="mdi:water-percent"></ha-icon> Simulated
              Humidity</span
            >
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
          <div class="device-card ${this._waterActive ? "active" : ""}">
            <div class="device-icon">
              <ha-icon icon="mdi:power-plug"></ha-icon>
            </div>
            <div class="device-name">Smart Plug</div>
            <div class="device-status">
              ${this._waterActive ? "Running" : "Off"}
            </div>
          </div>

          <div class="device-card ${this._lightOn ? "active" : ""}">
            <div class="device-icon">
              <ha-icon icon="mdi:lightbulb"></ha-icon>
            </div>
            <div class="device-name">Grow Light</div>
            <div class="device-status">${this._lightOn ? "On" : "Off"}</div>
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
            <ha-icon icon="mdi:calendar-clock" class="icon"></ha-icon
            ><span>Lighting Schedule</span>
          </div>
        </div>
        <div
          class="schedule-item"
          @click="${this._showGreenhouseScheduleDialog}"
        >
          <div class="schedule-time">
            <ha-icon icon="mdi:weather-sunny"></ha-icon> Growth starts at
            ${this.greenhouseSchedule.growthTime}
          </div>
          <div class="schedule-action">Cool daylight (6500K), 100%</div>
          <ha-icon icon="mdi:pencil" class="edit-icon"></ha-icon>
        </div>
        <div
          class="schedule-item"
          @click="${this._showGreenhouseScheduleDialog}"
        >
          <div class="schedule-time">
            <ha-icon icon="mdi:weather-night"></ha-icon> Rest starts at
            ${this.greenhouseSchedule.restTime}
          </div>
          <div class="schedule-action">Warm white (2700K), 20%</div>
          <ha-icon icon="mdi:pencil" class="edit-icon"></ha-icon>
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
            <ha-icon icon="mdi:calendar-clock" class="icon"></ha-icon>
            <span>Watering Schedule</span>
          </div>
        </div>

        <div class="schedule-item" @click="${this._showTimePickerDialog}">
          <div class="schedule-time">
            <ha-icon icon="mdi:white-balance-sunny"></ha-icon> Daily at
            ${this.wateringSchedule.time}
          </div>
          <div class="schedule-action">
            Morning watering - ${this.wateringSchedule.duration} seconds
            duration
          </div>
          <ha-icon icon="mdi:pencil" class="edit-icon"></ha-icon>
        </div>
      </div>
    `;
  }

  // Dialog box for adjusting greenhouse lighting schedule
  _showGreenhouseScheduleDialog() {
    const dialog = document.createElement("div");
    dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
  `;

    // Generate hour options (every hour, 0-23)
    const hourOptions = [];
    for (let hour = 0; hour < 24; hour++) {
      hourOptions.push({
        value: hour,
        label: `${String(hour).padStart(2, "0")}:00`,
      });
    }

    // Options HTML for growth hour
    const growthOptionsHTML = hourOptions
      .map((opt) => {
        const selected =
          opt.value === this.greenhouseSchedule.growthHour ? "selected" : "";
        return `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
      })
      .join("");

    // Options HTML for rest hour
    const restOptionsHTML = hourOptions
      .map((opt) => {
        const selected =
          opt.value === this.greenhouseSchedule.restHour ? "selected" : "";
        return `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
      })
      .join("");

    dialog.innerHTML = `
    <div style="
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
    " class="dialog-overlay"></div>

    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      padding: 24px;
      min-width: 320px;
      max-width: 400px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      z-index: 10000;
    " class="dialog-content">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">
        Adjust Lighting Schedule
      </h3>

      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 20px;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label style="font-size: 14px; font-weight: 500; color: #333;">
            ☀ Growth mode starts at:
          </label>
          <select id="growth-hour-select" style="
            padding: 12px;
            font-size: 16px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-family: inherit;
            background: white;
            cursor: pointer;
          ">
            ${growthOptionsHTML}
          </select>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label style="font-size: 14px; font-weight: 500; color: #333;">
            ☽ Rest mode starts at:
          </label>
          <select id="rest-hour-select" style="
            padding: 12px;
            font-size: 16px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-family: inherit;
            background: white;
            cursor: pointer;
          ">
            ${restOptionsHTML}
          </select>
        </div>
      </div>

      <div class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="cancel-btn" style="
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          background: #e0e0e0;
          font-family: inherit;
        ">Cancel</button>
        <button class="confirm-btn" style="
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          background: #4CAF50;
          color: white;
          font-family: inherit;
        ">Confirm</button>
      </div>
    </div>
  `;

    document.body.appendChild(dialog);

    const closeDialog = () => {
      console.log("Closing greenhouse schedule dialog");
      if (dialog && dialog.parentNode) {
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector(".cancel-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      closeDialog();
    });

    dialog.querySelector(".dialog-overlay").addEventListener("click", (e) => {
      e.stopPropagation();
      closeDialog();
    });

    dialog.querySelector(".confirm-btn").addEventListener("click", (e) => {
      e.stopPropagation();

      const growthHour = parseInt(
        dialog.querySelector("#growth-hour-select").value,
        10,
      );
      const restHour = parseInt(
        dialog.querySelector("#rest-hour-select").value,
        10,
      );

      if (growthHour === restHour) {
        alert("Growth hour and rest hour cannot be the same!");
        return;
      }

      console.log("Updating greenhouse schedule:", growthHour, restHour);
      this._updateGreenhouseSchedule(growthHour, restHour);
      closeDialog();
    });
  }

  // Dialog box for adjusting watering schedules
  _showTimePickerDialog() {
    const dialog = document.createElement("div");
    dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
  `;

    // Generation time options (every 30 minutes)
    const timeOptions = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute of [0, 30]) {
        // Generation time options (every 15 minutes)
        // for (let minute of [0, 15, 30, 45]) {
        const timeStr = `${String(hour).padStart(2, "0")}:${String(
          minute,
        ).padStart(2, "0")}`;
        timeOptions.push({
          value: timeStr,
          label: timeStr,
          hour: hour,
          minute: minute,
        });
      }
    }

    // options HTML
    const optionsHTML = timeOptions
      .map((opt) => {
        const selected =
          opt.value === this.wateringSchedule.time ? "selected" : "";
        return `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
      })
      .join("");

    dialog.innerHTML = `
    <div style="
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
    " class="dialog-overlay"></div>

    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      padding: 24px;
      min-width: 320px;
      max-width: 400px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      z-index: 10000;
    " class="dialog-content">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">
        Adjust Watering Schedule
      </h3>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
        <label style="font-size: 14px; font-weight: 500; color: #333;">
          What time would you like to water daily?
        </label>
        <select id="time-select" style="
          padding: 12px;
          font-size: 16px;
          border: 2px solid #ddd;
          border-radius: 8px;
          font-family: inherit;
          background: white;
          cursor: pointer;
        ">
          ${optionsHTML}
        </select>
      </div>

      <div class="dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="cancel-btn" style="
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          background: #e0e0e0;
          font-family: inherit;
        ">Cancel</button>
        <button class="confirm-btn" style="
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          background: #4CAF50;
          color: white;
          font-family: inherit;
        ">Confirm</button>
      </div>
    </div>
  `;

    document.body.appendChild(dialog);

    const closeDialog = () => {
      console.log("Closing dialog");
      if (dialog && dialog.parentNode) {
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector(".cancel-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      closeDialog();
    });

    dialog.querySelector(".dialog-overlay").addEventListener("click", (e) => {
      e.stopPropagation();
      closeDialog();
    });

    dialog.querySelector(".confirm-btn").addEventListener("click", (e) => {
      e.stopPropagation();

      const timeValue = dialog.querySelector("#time-select").value;
      const [hour, minute] = timeValue.split(":").map(Number);
      const duration = 30;

      console.log("Updating schedule:", hour, minute, duration);
      this._updateSchedule(hour, minute, duration);
      closeDialog();
    });
  }

  // The handler function executed after clicking the confirmation button
  // Call backend service to update watering schedule
  _updateSchedule(hour, minute, duration) {
    // Update local state for immediate UI feedback
    this.wateringSchedule = {
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(
        2,
        "0",
      )}`,
      hour,
      minute,
      duration,
    };

    this.requestUpdate();

    // Call backend service to persist the schedule change
    this.hass.callService("hue", "set_watering_schedule", {
      entity_id: this.plugEntityId,
      hour: hour,
      minute: minute,
    });

    console.log(
      `Watering schedule updated to ${hour}:${minute} via backend service`,
    );
  }

  // Call backend service to update greenhouse lighting schedule
  _updateGreenhouseSchedule(growthHour, restHour) {
    // Update local state for immediate UI feedback
    this.greenhouseSchedule = {
      growthTime: `${String(growthHour).padStart(2, "0")}:00`,
      restTime: `${String(restHour).padStart(2, "0")}:00`,
      growthHour,
      restHour,
    };

    this.requestUpdate();

    // Call backend service to persist the schedule change
    this.hass.callService("hue", "set_greenhouse_schedule", {
      entity_id: this.lightEntityId,
      growth_hour: growthHour,
      rest_hour: restHour,
    });

    console.log(
      `Greenhouse schedule updated to growth=${growthHour}:00, rest=${restHour}:00 via backend service`,
    );
  }

  // ==================== ACTION HANDLERS (OPTIMISTIC UI) ====================

  _handleManualWater() {
    this._waterActive = true;
    this._pendingWaterActivate = true;
    this._startWateringCountdown(30);

    setTimeout(() => {
      this._pendingWaterActivate = false;
      this.requestUpdate();
    }, 2000);

    this.hass.callService("hue", "activate_watering", {
      entity_id: this.plugEntityId,
    });
  }

  _startWateringCountdown(seconds) {
    if (this._wateringEndTime) {
      this._wateringEndTime += seconds * 1000;
    } else {
      this._wateringEndTime = Date.now() + seconds * 1000;
      this._wateringCountdownInterval = setInterval(() => {
        this._updateWateringCountdown();
      }, 1000);
    }
    this._updateWateringCountdown();
  }

  _updateWateringCountdown() {
    const remaining = Math.max(
      0,
      Math.ceil((this._wateringEndTime - Date.now()) / 1000),
    );
    this._wateringRemainingSeconds = remaining;
    this.requestUpdate();
    if (remaining <= 0) {
      this._stopWateringCountdown();
    }
  }

  _stopWateringCountdown() {
    if (this._wateringCountdownInterval) {
      clearInterval(this._wateringCountdownInterval);
      this._wateringCountdownInterval = null;
    }
    this._wateringRemainingSeconds = 0;
    this._wateringEndTime = null;
  }

  _handleAutoLightToggle() {
    const newActive = !this._greenhouseActive;
    const targetMode = newActive ? "auto" : "manual";

    this._greenhouseActive = newActive;
    if (newActive) {
      // Turning on auto mode - light will be turned on by backend
      this._lightOn = true;
      // Predict mode based on current time and schedule
      const now = new Date();
      const currentHour = now.getHours();
      const growthHour = this.greenhouseSchedule.growthHour;
      const restHour = this.greenhouseSchedule.restHour;

      // Determine if we're in growth or rest period
      if (currentHour >= growthHour && currentHour < restHour) {
        this._greenhouseMode = "growth";
      } else {
        this._greenhouseMode = "rest";
      }
    } else {
      // Turning off auto mode
      this._greenhouseMode = "manual";
    }

    this._pendingAutoToggle = true;
    setTimeout(() => {
      this._pendingAutoToggle = false;
      this.requestUpdate();
    }, 2000);

    this.hass.callService("hue", "set_greenhouse_scene", {
      entity_id: this.lightEntityId,
      mode: targetMode,
    });
  }

  _handleManualLightToggle() {
    this._lightOn = !this._lightOn;
    this._pendingLightToggle = true;

    setTimeout(() => {
      this._pendingLightToggle = false;
      this.requestUpdate();
    }, 2000);

    const service = this._lightOn ? "turn_on" : "turn_off";
    this.hass.callService("light", service, {
      entity_id: this.lightEntityId,
    });
  }

  _handleSceneClick(mode) {
    this._greenhouseMode = mode;
    this._greenhouseActive = true;
    this._lightOn = true;

    this._pendingSceneChange = true;
    setTimeout(() => {
      this._pendingSceneChange = false;
      this.requestUpdate();
    }, 2000);

    this.hass.callService("hue", "set_greenhouse_scene", {
      entity_id: this.lightEntityId,
      mode: mode,
    });
  }

  // ==================== EVENT HANDLERS ====================

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

  // NEW: Analyze with AI using the ai-assistant module
  async _analyzeWithAI() {
    this._aiLoading = true;
    this._aiAnalysis = "";
    this.requestUpdate();

    try {
      const conditions = {
        temperature: this._simTemp,
        humidity: this._simHumidity,
        lightMode: this._greenhouseMode,
        hass: this.hass,
      };

      console.log("Sending AI request with conditions:", conditions);

      // Use the imported AI assistant function (via Home Assistant backend)
      const response = await analyzeGreenhouseConditions(conditions);

      console.log("AI Response:", response);
      this._aiAnalysis = response;
    } catch (error) {
      console.error("AI Analysis error:", error);

      // Provide user-friendly error messages
      if (error.message.includes("Invalid API key")) {
        this._aiAnalysis =
          "⚠ Authentication failed: Please check your API key in config.js";
      } else if (error.message.includes("Rate limit")) {
        this._aiAnalysis = "⚠ Rate limit exceeded: Please try again later.";
      } else if (
        error.message.includes("Failed to fetch") ||
        error.message.includes("NetworkError")
      ) {
        this._aiAnalysis =
          "⚠ Network error: Please check your internet connection and API configuration.";
      } else {
        this._aiAnalysis = `⚠ Error: ${error.message}`;
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
        lightMode: this._greenhouseMode,
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
      const assistant = new AIAssistant(this.hass);
      const response = await assistant.chat(prompt);

      console.log("AI Response:", response);
      // Display question at the top of the answer for context
      this._aiAnalysis = `**Question:** ${question}\n - \n${response}`;
    } catch (error) {
      console.error("Preset question error:", error);

      if (error.message.includes("Invalid API key")) {
        this._aiAnalysis =
          "⚠ Authentication failed: Please check your API key in config.js";
      } else if (error.message.includes("Rate limit")) {
        this._aiAnalysis = "⚠ Rate limit exceeded: Please try again later.";
      } else {
        this._aiAnalysis = `⚠ Error: ${error.message}`;
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
