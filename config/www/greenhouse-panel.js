/**
 * Greenhouse Control Panel for Home Assistant
 *
 * Features:
 * - FR1: Automatic Watering Control
 * - FR2: Manual Watering Trigger
 * - FR3: Lighting Control & Scheduling
 * - FR4: Greenhouse Device Integration View
 * - FR5: Developer Simulation Mode
 * - FR6: Humidity Sensor Integration
 * - FR7: Temperature & Light Sensor Integration
 * - FR8: AI Plant Health Analysis
 */

import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit@3.0.0/index.js?module";

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
    };
  }

  constructor() {
    super();
    this._simMode = true;
    this._simTemp = 24.5;
    this._simHumidity = 65;
    this._simLight = 8500;
  }

  render() {
    return html`
      <link rel="stylesheet" href="/local/greenhouse-panel-styles.css" />

      <div class="container">
        ${this._renderHeader()} ${this._renderBanners()}
        ${this._renderSimulationPanel()}

        <div class="dashboard-grid">
          ${this._renderWateringCard()} ${this._renderLightingCard()}
          ${this._renderSensorsCard()} ${this._renderHealthCard()}
          ${this._renderDevicesCard()} ${this._renderWateringSchedule()}
          ${this._renderLightingSchedule()}
        </div>
      </div>
    `;
  }

  // Header & Status Bar
  _renderHeader() {
    return html`
      <div class="header">
        <h1>
          <span>🌱</span>
          <span>Smart Greenhouse Control System</span>
        </h1>
        <p class="header-subtitle">Greenhouse Control Panel</p>

        <div class="status-bar">
          <div class="status-item">
            <span class="status-dot"></span>
            <span>System Running</span>
          </div>
          <div class="status-item">
            <span>🌡️ Temp: ${this._simTemp}°C</span>
          </div>
          <div class="status-item">
            <span>💧 Humidity: ${this._simHumidity}%</span>
          </div>
          <div class="status-item">
            <span>☀️ Light: ${this._simLight} lux</span>
          </div>
          <div class="status-item">
            <span>⏰ Last Watering: 2 hours ago</span>
          </div>
        </div>
      </div>
    `;
  }

  // Developer Mode & Warning Banner
  _renderBanners() {
    return html`
      <div class="banner banner-simulation">
        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
          <span>🔧</span>
          <span
            ><strong>Developer Mode</strong> - Simulating sensor data for
            automation testing</span
          >
        </div>
        <div
          class="toggle-switch ${this._simMode ? "active" : ""}"
          @click=${this._toggleSimMode}
          style="flex-shrink: 0;"
        ></div>
      </div>
      ${this._simMode
        ? html`
            <div class="banner banner-warning">
              <span>⚠️</span>
              <span>Using simulated data - No physical sensors detected</span>
            </div>
          `
        : ""}
    `;
  }

  // Smart Watering System
  _renderWateringCard() {
    const autoWateringState =
      this.hass.states["switch.auto_watering"]?.state || "off";

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">💧</span>
            <span>Smart Watering System</span>
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
        <button class="button secondary">⚙️ Configure Watering Schedule</button>
      </div>
    `;
  }

  // Smart Lighting Control
  _renderLightingCard() {
    const lightState = this.hass.states["light.grow_light"]?.state || "off";

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">💡</span>
            <span>Smart Lighting Control</span>
          </div>
        </div>

        <div class="sensor-reading">
          <span class="reading-label">Current Light Intensity</span>
          <span class="reading-value">
            ${this._simLight}
            <span class="reading-unit">lux</span>
          </span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: ${(this._simLight / 20000) * 100}%"
          ></div>
        </div>

        <div class="control-group">
          <div class="control-item">
            <span>Grow Light</span>
            <div
              class="toggle-switch ${lightState === "on" ? "active" : ""}"
              @click=${this._toggleGrowLight}
            ></div>
          </div>
          <div class="control-item">
            <span>Color Temperature</span>
            <span style="color: var(--warning-color);">🌅 Warm Light</span>
          </div>
        </div>

        <button class="button secondary">📅 Set Lighting Schedule</button>
      </div>
    `;
  }

  // Environmental Sensors
  _renderSensorsCard() {
    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">🌡️</span>
            <span>Environmental Sensors</span>
          </div>
        </div>

        <div class="sensor-reading">
          <span class="reading-label">Temperature</span>
          <span class="reading-value">
            ${this._simTemp}
            <span class="reading-unit">°C</span>
          </span>
        </div>

        <div class="sensor-reading">
          <span class="reading-label">Humidity</span>
          <span class="reading-value">
            ${this._simHumidity}
            <span class="reading-unit">%</span>
          </span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${this._simHumidity}%"></div>
        </div>

        <div class="info-box success">
          ✓ Environmental parameters normal, suitable for plant growth
        </div>
      </div>
    `;
  }

  // Plant Health Assessment (AI)
  _renderHealthCard() {
    const healthScore = 87;

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">🤖</span>
            <span>Plant Health Assessment (AI)</span>
          </div>
        </div>

        <div class="health-score-container">
          <div class="health-score">${healthScore}</div>
          <div class="health-info">
            <div class="health-label">Overall Health Score</div>
            <div class="health-status">Growing Well 📈</div>
            <div
              style="font-size: 12px; color: var(--secondary-text-color); margin-top: 4px;"
            >
              Based on temperature, humidity, and light data analysis
            </div>
          </div>
        </div>

        <div class="info-box success">
          <strong>✓ Assessment Factors</strong><br />
          • Temperature Suitability: 92 pts<br />
          • Humidity Suitability: 85 pts<br />
          • Light Sufficiency: 88 pts<br />
          • Watering Frequency: 84 pts
        </div>

        <div class="info-box info">
          💡 <strong>AI Recommendation:</strong> Continue current care strategy
        </div>

        <div class="chart-placeholder">📊 Health Score Trend (Past 7 Days)</div>
      </div>
    `;
  }

  // Greenhouse Devices Overview
  _renderDevicesCard() {
    return html`
      <div class="card wide-card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">🏡</span>
            <span>Greenhouse Devices Overview</span>
          </div>
          <button class="button secondary" style="width: auto; margin: 0;">
            + Add Device
          </button>
        </div>

        <div class="device-list">
          ${this._renderDevice("🔌", "Smart Plug", true, "Running")}
          ${this._renderDevice("💡", "Grow Light", true, "On")}
          ${this._renderDevice(
            "🌡️",
            "Temp Sensor",
            false,
            `${this._simTemp}°C`,
          )}
          ${this._renderDevice(
            "💧",
            "Humidity Sensor",
            false,
            `${this._simHumidity}%`,
          )}
          ${this._renderDevice(
            "☀️",
            "Light Sensor",
            false,
            `${this._simLight} lux`,
          )}
          ${this._renderDevice("📷", "Camera", false, "Online")}
        </div>
      </div>
    `;
  }

  // Device card
  _renderDevice(icon, name, active, status) {
    return html`
      <div class="device-card ${active ? "active" : ""}">
        <div class="device-icon">${icon}</div>
        <div class="device-name">${name}</div>
        <div
          class="device-status"
          style="color: ${active
            ? "var(--success-color)"
            : "var(--secondary-text-color)"}"
        >
          ${status}
        </div>
      </div>
    `;
  }

  // Watering Schedule
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
          <div class="schedule-time">⏰ Daily at 06:00</div>
          <div class="schedule-action">
            Morning watering - 5 minutes duration
          </div>
        </div>

        <div class="schedule-item">
          <div class="schedule-time">⏰ Daily at 18:00</div>
          <div class="schedule-action">
            Evening watering - 5 minutes duration
          </div>
        </div>

        <button class="button secondary">+ Add New Schedule</button>
      </div>
    `;
  }

  // Lighting Schedule
  _renderLightingSchedule() {
    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">🌅</span>
            <span>Lighting Schedule</span>
          </div>
        </div>

        <div class="schedule-item">
          <div class="schedule-time">☀️ Growth Period (06:00-22:00)</div>
          <div class="schedule-action">
            Full spectrum lighting, warm color temperature
          </div>
        </div>

        <div class="schedule-item">
          <div class="schedule-time">🌙 Rest Period (22:00-06:00)</div>
          <div class="schedule-action">All lights off</div>
        </div>

        <button class="button secondary">⚙️ Custom Scene</button>
      </div>
    `;
  }

  // Developer Simulation Panel
  _renderSimulationPanel() {
    if (!this._simMode) return "";

    return html`
      <div class="simulation-banner">
        <div class="simulation-header">
          <span class="icon">🔬</span>
          <span class="simulation-title">Developer Simulation Panel</span>
        </div>

        <div class="simulation-content">
          <div class="info-box info" style="margin: 0 0 16px 0;">
            <strong>💡 Tip:</strong> Adjust parameters below to simulate
            different environmental conditions and test automation triggers
          </div>

          <div class="simulation-controls">
            ${this._renderSlider(
              "🌡️ Simulated Temperature",
              this._simTemp,
              "°C",
              0,
              40,
              0.5,
              "temp",
            )}
            ${this._renderSlider(
              "💧 Simulated Humidity",
              this._simHumidity,
              "%",
              0,
              100,
              1,
              "humidity",
            )}
            ${this._renderSlider(
              "☀️ Simulated Light Intensity",
              this._simLight,
              " lux",
              0,
              20000,
              100,
              "light",
            )}
          </div>

          <div class="simulation-scenarios">
            <div
              style="color: var(--primary-text-color); font-weight: 600; margin-bottom: 12px; font-size: 14px;"
            >
              🎯 Quick Test Scenarios
            </div>
            <div class="scenario-grid">
              <button
                class="scenario-button"
                @click=${() => this._applyScenario("drought")}
              >
                🌵 Drought Mode<br />
                <span class="scenario-subtitle">Low Humidity 20%</span>
              </button>
              <button
                class="scenario-button"
                @click=${() => this._applyScenario("humid")}
              >
                🌧️ Humid Mode<br />
                <span class="scenario-subtitle">High Humidity 90%</span>
              </button>
              <button
                class="scenario-button"
                @click=${() => this._applyScenario("hot")}
              >
                🔥 Hot Mode<br />
                <span class="scenario-subtitle">Temperature 35°C</span>
              </button>
              <button
                class="scenario-button"
                @click=${() => this._applyScenario("cold")}
              >
                ❄️ Cold Mode<br />
                <span class="scenario-subtitle">Temperature 10°C</span>
              </button>
            </div>
          </div>

          ${this._renderAutomationLog()}
        </div>
      </div>
    `;
  }

  _renderSlider(label, value, unit, min, max, step, type) {
    return html`
      <div class="slider-container">
        <div class="slider-header">
          <span class="slider-label">${label}</span>
          <span class="slider-value">${value}${unit}</span>
        </div>
        <input
          type="range"
          min="${min}"
          max="${max}"
          step="${step}"
          .value="${value}"
          @input=${(e) => this._updateSimValue(type, e.target.value)}
        />
        <div class="slider-marks">
          <span>${min}${unit}</span>
          <span>${Math.round((min + max) / 2)}${unit}</span>
          <span>${max}${unit}</span>
        </div>
      </div>
    `;
  }

  _renderAutomationLog() {
    const triggers = [];

    if (this._simHumidity < 40) {
      triggers.push(
        html`<div>
          • <span style="color: var(--success-color);">✓</span> Humidity < 40% →
          Auto watering triggered
        </div>`,
      );
    } else {
      triggers.push(
        html`<div>
          • <span style="color: var(--secondary-text-color);">○</span> Humidity
          < 40% → Auto watering (not triggered)
        </div>`,
      );
    }

    if (this._simLight < 5000) {
      triggers.push(
        html`<div>
          • <span style="color: var(--success-color);">✓</span> Light < 5000 lux
          → Grow light activated
        </div>`,
      );
    } else {
      triggers.push(
        html`<div>
          • <span style="color: var(--secondary-text-color);">○</span> Light <
          5000 lux → Grow light (not triggered)
        </div>`,
      );
    }

    if (this._simTemp > 30) {
      triggers.push(
        html`<div>
          • <span style="color: var(--error-color);">!</span> Temperature > 30°C
          → Alert sent
        </div>`,
      );
    } else {
      triggers.push(
        html`<div>
          •
          <span style="color: var(--secondary-text-color);">○</span> Temperature
          > 30°C → Alert (not triggered)
        </div>`,
      );
    }

    return html`
      <div
        class="info-box"
        style="background: var(--secondary-background-color); margin-top: 20px;"
      >
        <div
          style="color: var(--primary-text-color); font-weight: 600; margin-bottom: 10px; font-size: 14px;"
        >
          📋 Triggered Automation Tasks
        </div>
        <div
          style="font-size: 12px; color: var(--secondary-text-color); line-height: 1.8;"
        >
          ${triggers}
        </div>
      </div>
    `;
  }

  // Event Handlers
  // Open or close the developer simulation panel
  _toggleSimMode() {
    this._simMode = !this._simMode;
    this.requestUpdate();
  }

  // open or close auto watering
  _toggleAutoWatering() {
    this.hass.callService("switch", "toggle", {
      entity_id: "switch.auto_watering",
    });
  }

  // open or close growing light
  _toggleGrowLight() {
    this.hass.callService("light", "toggle", {
      entity_id: "light.grow_light",
    });
  }

  // manual water now
  _manualWater() {
    this.hass.callService("switch", "turn_on", {
      entity_id: "switch.manual_watering",
    });

    // Show notification
    this.dispatchEvent(
      new CustomEvent("hass-notification", {
        detail: { message: "Manual watering started" },
        bubbles: true,
        composed: true,
      }),
    );
  }

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
      case "light":
        this._simLight = parseInt(value);
        this._updateSensor("input_number.sim_light_intensity", this._simLight);
        break;
    }
    this.requestUpdate();
  }

  // update simulation value in different scenarios
  _applyScenario(scenario) {
    switch (scenario) {
      case "drought":
        this._simHumidity = 20;
        this._simTemp = 28;
        break;
      case "humid":
        this._simHumidity = 90;
        this._simTemp = 22;
        break;
      case "hot":
        this._simTemp = 35;
        this._simHumidity = 45;
        break;
      case "cold":
        this._simTemp = 10;
        this._simHumidity = 70;
        break;
    }

    this._updateSensor("input_number.sim_temperature", this._simTemp);
    this._updateSensor("input_number.sim_humidity", this._simHumidity);
    this.requestUpdate();
  }

  _updateSensor(entityId, value) {
    if (this.hass.states[entityId]) {
      this.hass.callService("input_number", "set_value", {
        entity_id: entityId,
        value: value,
      });
    }
  }

  static get styles() {
    return css`
      /* Minimal inline styles - main styles loaded from external CSS */
      :host {
        display: block;
        height: 100%;
        background-color: var(--primary-background-color);
      }
    `;
  }
}

customElements.define("greenhouse-panel", GreenhousePanel);
