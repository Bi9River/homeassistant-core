import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit@3.0.0/index.js?module";

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
          ${this._renderDevicesCard()} ${this._renderWateringSchedule()}
          ${this._renderLightingSchedule()}
        </div>
      </div>
    `;
  }

  // ==================== UI RENDERERS ====================

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
            <span>System Connected</span>
          </div>
          <div class="status-item">
            <span>
              ${this._greenhouseMode === "growth"
                ? "🌞 Growth Mode"
                : this._greenhouseMode === "rest"
                ? "🌙 Rest Mode"
                : "⚙️ Manual Mode"}
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
            <span class="icon">💧</span>
            <span>Smart Watering System</span>
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
                ? `🌊 PUMPING ACTIVE (${this._wateringRemainingSeconds}s)`
                : "💤 Idle"}
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
          ${this._waterActive ? "🔄 Continue 30s" : "⚡ Manual Water (30s)"}
        </button>
      </div>
    `;
  }

  _renderLightingCard() {
    let modeDisplay = "Manual Mode";
    if (this._greenhouseMode === "growth") modeDisplay = "🌞 Growth Mode";
    if (this._greenhouseMode === "rest") modeDisplay = "🌙 Rest Mode";

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">💡</span>
            <span>Smart Lighting Control</span>
          </div>
        </div>

        <div class="control-group">
          <!-- Auto Toggle -->
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
              ${this._lightOn ? "✓ ON" : "○ OFF"}
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
          ${this._lightOn ? "💡 Turn Off Light" : "💡 Turn On Light"}
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
            🌞 Growth
          </button>
          <button
            class="button ${this._greenhouseMode === "rest" ? "" : "secondary"}"
            @click=${() => this._handleSceneClick("rest")}
          >
            🌙 Rest
          </button>
        </div>
      </div>
    `;
  }

  _renderDevicesCard() {
    // Use our local reactive properties for immediate feedback
    return html`
      <div class="card wide-card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">🏡</span>
            <span>Device Overview</span>
          </div>
        </div>

        <div class="device-list">
          <div class="device-card ${this._waterActive ? "active" : ""}">
            <div class="device-icon">🔌</div>
            <div class="device-name">Smart Plug</div>
            <div class="device-status">
              ${this._waterActive ? "Running" : "Off"}
            </div>
          </div>

          <div class="device-card ${this._lightOn ? "active" : ""}">
            <div class="device-icon">💡</div>
            <div class="device-name">Grow Light</div>
            <div class="device-status">${this._lightOn ? "On" : "Off"}</div>
          </div>
        </div>
      </div>
    `;
  }

  _renderWateringSchedule() {
    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">📅</span><span>Watering Schedule</span>
          </div>
        </div>
        <div class="schedule-item">
          <div class="schedule-time">🌅 Daily at 07:00</div>
          <div class="schedule-action">Automatic watering - 30s</div>
        </div>
      </div>
    `;
  }

  _renderLightingSchedule() {
    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">📅</span><span>Lighting Schedule</span>
          </div>
        </div>
        <div class="schedule-item">
          <div class="schedule-time">🌞 Growth (06:00-18:00)</div>
          <div class="schedule-action">Cool daylight (6500K), 100%</div>
        </div>
        <div class="schedule-item">
          <div class="schedule-time">🌙 Rest (18:00-06:00)</div>
          <div class="schedule-action">Warm white (2700K), 20%</div>
        </div>
      </div>
    `;
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
    const targetMode = newActive ? "growth" : "manual";

    this._greenhouseActive = newActive;
    if (newActive) {
      this._greenhouseMode = "growth";
      this._lightOn = true;
    } else {
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
