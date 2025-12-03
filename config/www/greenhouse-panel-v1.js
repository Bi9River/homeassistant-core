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
      _lightMode: { type: String }, // 'growth' or 'rest'
      _autoLightEnabled: { type: Boolean }, // Auto light control state
      _simLightState: { type: String }, // Simulated light state: 'on' or 'off'
      _simBrightness: { type: Number }, // Simulated brightness
      _simColorTemp: { type: Number }, // Simulated color temp
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
  }

  render() {
    return html`
      <link rel="stylesheet" href="/local/greenhouse-panel-styles.css" />

      <div class="container">
        ${this._renderHeader()} ${this._renderBanners()}
        ${this._renderSimulationPanel()}

        <div class="dashboard-grid">
          ${this._renderWateringCard()} ${this._renderLightingCard()}
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
          <span>Greenhouse Control Panel</span>
          <span
            style="background: #ff6b6b; color: white; padding: 4px 12px; margin-left: 16px; border-radius: 6px; font-size: 14px; font-weight: 600;"
            >DEMO VERSION</span
          >
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
      </div>
    `;
  }

  // Smart Lighting Control - OPTIMIZED VERSION
  _renderLightingCard() {
    // Always use simulated state for demo
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

  // Greenhouse Devices Overview
  _renderDevicesCard() {
    // Always use simulated state
    const isLightOn = this._simLightState === "on";

    return html`
      <div class="card wide-card">
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
          <div class="schedule-time">🌅 Daily at 06:00</div>
          <div class="schedule-action">
            Morning watering - 5 minutes duration
          </div>
        </div>

        <div class="schedule-item">
          <div class="schedule-time">🌆 Daily at 18:00</div>
          <div class="schedule-action">
            Evening watering - 5 minutes duration
          </div>
        </div>
      </div>
    `;
  }

  // Lighting Schedule
  _renderLightingSchedule() {
    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">📅</span>
            <span>Lighting Schedule</span>
          </div>
        </div>

        <div class="schedule-item">
          <div class="schedule-time">🌞 Growth Period (06:00-22:00)</div>
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
      // Enable auto control - turn on light with current mode settings
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
      // Disable auto control - just switch to manual mode, don't touch the light
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

  // Manual toggle light (simple on/off without changing settings)
  _manualToggleLight() {
    if (this._simLightState === "on") {
      // Turn off light
      this._simLightState = "off";

      // IMPORTANT: When manually turning off, also disable auto control
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
      // Turn on light with current mode settings
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

  // Apply light scene (Growth or Rest mode)
  _applyLightScene(mode) {
    this._lightMode = mode;
    const settings = this._getLightSettings(mode);

    // Turn on light with scene settings
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

  // Get light settings for a specific mode
  _getLightSettings(mode) {
    if (mode === "growth") {
      return {
        brightness: 255, // 100%
        color_temp: 153, // 6500K in mireds
      };
    } else {
      return {
        brightness: 50, // ~20%
        color_temp: 370, // 2700K in mireds
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
      case "light":
        this._simLight = parseInt(value);
        this._updateSensor("input_number.sim_light_intensity", this._simLight);
        break;
    }
    this.requestUpdate();
  }

  // Apply test scenarios
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

  // Update sensor value
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
      :host {
        display: block;
        height: 100%;
        background-color: var(--primary-background-color);
      }
    `;
  }
}

customElements.define("greenhouse-panel", GreenhousePanel);
