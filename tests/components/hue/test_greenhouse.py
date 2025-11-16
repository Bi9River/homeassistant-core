"""Test the Hue Greenhouse features."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from homeassistant.components.hue.const import DOMAIN, SERVICE_SET_GREENHOUSE_SCENE
from homeassistant.components.hue.greenhouse_light import GreenhouseLightMixin
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

from tests.common import MockConfigEntry

# Mock entity ID
LIGHT_ENTITY = "light.hue_color_lamp_1"


@pytest.fixture(autouse=True)
def mock_hue_bridge(mock_bridge_v2: MagicMock) -> MagicMock:
    """Mock the hue bridge connection and config to avoid errors."""
    # 1. Create a Mock Config object
    mock_config = MagicMock()
    mock_config.bridge_id = "001788FFFE23BFC2"
    mock_config.mac_address = "00:17:88:23:bf:c2"
    mock_config.model_id = "BSB002"
    mock_config.software_version = "1950111090"
    mock_config.name = "Philips Hue"
    mock_config.bridge_device = MagicMock()
    mock_config.bridge_device.id = "mock-device-id"
    mock_config.bridge_device.product_data.manufacturer_name = "Signify"

    # 2. Attach this config to the mock_bridge_v2 fixture
    mock_bridge_v2.api.config = mock_config
    mock_bridge_v2.api_version = 2

    # 3. IMPORTANT: We mock the return value of async_initialize_bridge
    # This prevents the real code from trying to connect to the network.
    mock_bridge_v2.async_initialize_bridge.return_value = True

    return mock_bridge_v2


async def test_greenhouse_scheduler_logic(
    hass: HomeAssistant, mock_hue_bridge: MagicMock
) -> None:
    """Test that time changes trigger the correct greenhouse mode."""

    # 0. SETUP BASIC LIGHT PLATFORM
    await async_setup_component(hass, "light", {})

    # 1. SETUP HUE PLATFORM
    # We patch the HueBridge CLASS.
    # When __init__.py calls HueBridge(hass, entry), it gets our mock_hue_bridge.
    with patch("homeassistant.components.hue.HueBridge", return_value=mock_hue_bridge):
        entry = MockConfigEntry(
            domain=DOMAIN,
            data={"host": "1.2.3.4", "api_key": "mock-api-key"},
            unique_id="001788FFFE23BFC2",
        )
        entry.add_to_hass(hass)

        # Initialize the component.
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()

    # 2. VERIFY SERVICE REGISTRATION
    assert hass.services.has_service(DOMAIN, SERVICE_SET_GREENHOUSE_SCENE), (
        "Service was not registered during setup"
    )

    # 3. ACT: Activate Greenhouse Mode
    await hass.services.async_call(
        DOMAIN,
        SERVICE_SET_GREENHOUSE_SCENE,
        {"mode": "growth", ATTR_ENTITY_ID: [LIGHT_ENTITY]},
        blocking=True,
    )

    # 4. TIME TRAVEL & LOGIC CHECK
    future_time = dt_util.now().replace(hour=20, minute=0, second=0)

    class MockHueLight(GreenhouseLightMixin):
        def __init__(self, hass: HomeAssistant) -> None:
            self.hass = hass
            self._kwargs: dict[str, Any] | None = None
            super().__init__()

        async def async_turn_on(self, **kwargs: Any) -> None:
            """Mock turn on to capture arguments."""
            self._kwargs = kwargs

    light = MockHueLight(hass)
    light._greenhouse_active = True
    light._greenhouse_mode = "growth"

    # Fire the logic manually
    light._async_check_greenhouse_schedule(future_time)

    # 5. ASSERT
    assert light._greenhouse_mode == "rest"
    assert light._kwargs, "Light did not attempt to turn on"
    assert light._kwargs["brightness"] == 50
    assert light._kwargs["color_temp"] == 370
