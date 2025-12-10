# Hue Home Greenhouse Control System

A Home Assistant Core extension for automated indoor plant care, built on top of the Philips Hue integration.

This project extends the official Philips Hue integration by introducing a full greenhouse control system, including smart watering, growth lighting, environment simulation, a custom unified control panel, and an AI-based plant advisor.

All backend and frontend code is already integrated into this repository, and running the Dev Container will automatically launch the full system with no additional setup required.

## Features

### Smart Watering
	•	Automatic watering schedules
	•	Manual Water Now (runs pump for 30 seconds)
	•	Real-time plug state updates
	•	Next watering time shown on dashboard

### Smart Lighting Control
	•	Growth Mode & Rest Mode
	•	Automatic daily switching
	•	Adjustable brightness & color temperature
	•	Manual scene switching

### Unified Greenhouse Control Panel
	•	Watering status
	•	Lighting status
	•	Device overview
	•	Environment data
	•	Simulation controls
	•	Integrated UI based on Web Components

### AI Analysis System
	•	Temperature / humidity / light evaluation
	•	Growth condition optimization
	•	Quick Q&A module for plant problems
	•	Environment simulation mode for testing

## Installation & Setup

This project includes a fully configured Home Assistant Core Dev Container.

### How to Run
	1.	Clone the repository:

    git clone https://github.com/Bi9River/homeassistant-core

	2.	Open the folder in VS Code
	3.	Select “Reopen in Dev Container”
	4.	After the container starts, Home Assistant will launch automatically.
	5.	Open the UI in your browser and you will find the “Greenhouse” panel in the sidebar.

## Usage Guide

### Manual Watering
	•	Activates pump for 30 seconds
	•	State updates automatically

### Automatic Watering Schedule

	•	Set schedules like 06:00 and 18:00, system will water automatically.

### Lighting Control

#### Growth Mode
	•	6500K
	•	100% brightness

#### Rest Mode
	•	2700K
	•	20% brightness

Set automatic mode scheduling or switch manually.

### AI Analysis
	•	Click Analyze Current Conditions
	•	Provides recommendations on light, water, humidity, and temperature
	•	Quick questions:
		•	“How do I optimize plant growth?”
		•	“Is my humidity okay?”
		•	“What lighting duration should I use?”

## Project Structure
The project is based on a fork of Home Assistant Core, with all greenhouse-related
backend logic and frontend UI integrated directly into the repository. Below is a
simplified overview of the relevant structure:

```
homeassistant-core/
│
├── homeassistant/
│   └── components/
│       └── hue/
│           ├── greenhouse_light.py       # Lighting mixin logic
│           ├── watering_plug.py          # Watering plug mixin logic
│           ├── services.yaml             # Greenhouse services
│           ├── light.py                  # Extended HueLight entity
│           ├── bridge.py                 # Updated to support greenhouse behavior
│           ├── ... (other Hue files)
│
└── homeassistant/
    └── frontend/
        └── www/
            └── greenhouse-panel.js        # Custom Greenhouse UI pane
```

The backend extends the Philips Hue integration using mixins, while the frontend
implements a custom panel based on LitElement. Both parts are fully integrated
into the Dev Container environment and start automatically when the container launches.


## Testing
The system was tested using a combination of unit tests and manual validation.

### Unit Tests
We added unit tests for the new modules (`greenhouse_light.py` and `watering_plug.py`).
The tests focus on:
- Mode switching
- Schedule updates
- Event listener registration
- Basic time-dependent behavior (using mocked time)

These tests ensure that the core automation logic behaves correctly.

### Manual Validation
We manually tested the full interaction flow through the UI, including:
- Manual 30-second watering
- Lighting mode switching
- Schedule configuration
- AI assistant responses
- Sensor simulation (temperature/humidity)

This confirmed that the frontend and backend work together as expected.

## Contributors
This project was collaboratively developed by **Group 3**:

- **Ruixuan Li** — Documentation, and report writing
- **Yanqiu Mei** — Frontend UI implementation, AI assistant integration
- **Zihan Kuang** — Aggregation logic, architectural documentation
- **Wenkang Gong** — Frontend–core integration, CORS/communication fixes
- **Shiqi Wu** — Core component development, integration of frontend and backend

## License
MIT License

Copyright (c) 2025 Group 3

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.