"""Base entity classes for Hue Greenhouse."""

from collections.abc import Callable
import logging
from typing import Any

from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.event import async_track_state_change_event

from .const import (
    ATTR_DEVICE_COUNT,
    ATTR_DEVICE_TYPE,
    ATTR_DEVICES,
    ATTR_GREENHOUSE_ID,
    ATTR_WRAPPED_ENTITY,
    DOMAIN,
    EVENT_GREENHOUSE_DEVICE_ADDED,
    EVENT_GREENHOUSE_DEVICE_REMOVED,
)

_LOGGER = logging.getLogger(__name__)


class GreenhouseDevice(Entity):
    """Wrapper class for existing Hue devices.

    This class wraps existing Hue entities (lights, plugs)
    without modifying them, adding greenhouse-specific functionality.
    """

    def __init__(self, hass, wrapped_entity_id, device_type, greenhouse_id) -> None:
        """Initialize a greenhouse device wrapper.

        Args:
            hass: Home Assistant instance
            wrapped_entity_id: Entity ID of existing Hue device (e.g., "light.hue_plant_light")
            device_type: "plug", "light"
            greenhouse_id: Identifier for the greenhouse
        """
        self._hass = hass
        self._wrapped_entity_id = wrapped_entity_id
        self._device_type = device_type
        self._greenhouse_id = greenhouse_id
        self._state: str | None = None
        self._available = True
        self._unsubscribe: Callable[[], None] | None = None

        _LOGGER.debug(
            "Initializing GreenhouseDevice: %s (type: %s, greenhouse: %s)",
            wrapped_entity_id,
            device_type,
            greenhouse_id,
        )

    async def async_added_to_hass(self) -> None:
        """Register callbacks when entity is added."""
        await super().async_added_to_hass()

        # Subscribe to state changes of the wrapped Hue entity
        self._unsubscribe = async_track_state_change_event(
            self.hass,
            [self._wrapped_entity_id],
            self._handle_wrapped_state_change,
        )

        # Initialize state from wrapped entity
        wrapped_state = self.hass.states.get(self._wrapped_entity_id)
        if wrapped_state:
            self._state = wrapped_state.state
            self._available = wrapped_state.state != "unavailable"
            _LOGGER.debug(
                "Initialized state for %s: %s", self._wrapped_entity_id, self._state
            )
        else:
            _LOGGER.warning(
                "Wrapped entity %s not found during initialization",
                self._wrapped_entity_id,
            )

    async def async_will_remove_from_hass(self) -> None:
        """Cleanup when entity is removed."""
        if self._unsubscribe:
            self._unsubscribe()
        await super().async_will_remove_from_hass()

    @callback
    def _handle_wrapped_state_change(self, event) -> None:
        """Handle state changes of the wrapped Hue entity."""
        new_state = event.data.get("new_state")
        if new_state is None:
            return

        old_state = self._state
        self._state = new_state.state
        self._available = new_state.state != "unavailable"

        _LOGGER.debug(
            "State changed for %s: %s -> %s",
            self._wrapped_entity_id,
            old_state,
            self._state,
        )

        self.async_write_ha_state()

    @property
    def unique_id(self) -> str:
        """Return unique ID for this greenhouse device."""
        return f"{DOMAIN}_{self._greenhouse_id}_{self._wrapped_entity_id.replace('.', '_')}"

    @property
    def name(self) -> str:
        """Return the display name."""
        wrapped_state = self.hass.states.get(self._wrapped_entity_id)
        if wrapped_state:
            original_name = wrapped_state.attributes.get(
                "friendly_name", self._wrapped_entity_id
            )
            return f"Greenhouse {original_name}"
        return f"Greenhouse {self._wrapped_entity_id}"

    @property
    def state(self) -> str | None:
        """Return the current state."""
        return self._state

    @property
    def available(self) -> bool:
        """Return True if entity is available."""
        return self._available

    @property
    def should_poll(self) -> bool:
        """No polling needed - we track state changes."""
        return False

    @property
    def device_info(self) -> DeviceInfo | None:
        """Return device info to group entities in the UI."""
        return {
            "identifiers": {(DOMAIN, self._greenhouse_id)},
            "name": f"Greenhouse {self._greenhouse_id}",
            "manufacturer": "Hue Greenhouse Extension",
            "model": "Virtual Greenhouse",
        }

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return greenhouse-specific attributes."""
        wrapped_state = self.hass.states.get(self._wrapped_entity_id)

        attributes = {
            ATTR_DEVICE_TYPE: self._device_type,
            ATTR_WRAPPED_ENTITY: self._wrapped_entity_id,
            ATTR_GREENHOUSE_ID: self._greenhouse_id,
        }

        # Pass through useful attributes from the wrapped Hue entity
        if wrapped_state and wrapped_state.attributes:
            # For lights
            for attr in ("brightness", "color_temp", "rgb_color", "hs_color"):
                if attr in wrapped_state.attributes:
                    attributes[attr] = wrapped_state.attributes[attr]

            # For plugs
            for attr in ("power", "energy", "current"):
                if attr in wrapped_state.attributes:
                    attributes[attr] = wrapped_state.attributes[attr]

        return attributes

    # Public methods for FR1/FR2/FR3 to use

    def get_wrapped_entity_id(self) -> str:
        """Return the ID of the wrapped Hue entity."""
        return self._wrapped_entity_id

    def get_device_type(self) -> str:
        """Return the device type (plug/light)."""
        return self._device_type

    def get_greenhouse_id(self) -> str:
        """Return the greenhouse ID."""
        return self._greenhouse_id


class GreenhouseGroup(Entity):
    """Aggregates all devices in a greenhouse.

    This entity serves as:
    1. A single point to view all greenhouse devices
    2. The data source for the Greenhouse Card (WebSocket binding)
    3. An interface for FR1/FR2/FR3 to register and query devices
    """

    def __init__(self, hass, greenhouse_id, name) -> None:
        """Initialize the greenhouse group."""
        self._hass = hass
        self._greenhouse_id = greenhouse_id
        self._name = name
        self._devices: dict[str, GreenhouseDevice] = {}  # {entity_id: GreenhouseDevice}
        self._state = "idle"

        _LOGGER.info("Initialized GreenhouseGroup: %s", name)

    @property
    def unique_id(self) -> str:
        """Return unique ID."""
        return f"{DOMAIN}_group_{self._greenhouse_id}"

    @property
    def name(self) -> str:
        """Return the name of the greenhouse."""
        return self._name

    @property
    def state(self) -> str:
        """Return overall state of the greenhouse.

        Logic: If any device is active/on, group is "active", otherwise "idle"
        """
        active_states = ["on", "active", "running"]

        for device in self._devices.values():
            if device.state in active_states:
                return "active"

        return "idle"

    @property
    def should_poll(self) -> bool:
        """No polling needed."""
        return False

    @property
    def icon(self) -> str:
        """Return the icon for this greenhouse."""
        return "mdi:greenhouse"

    @property
    def device_info(self) -> DeviceInfo | None:
        """Return device info for the greenhouse group."""
        return {
            "identifiers": {(DOMAIN, self._greenhouse_id)},
            "name": f"Greenhouse {self._greenhouse_id}",
            "manufacturer": "Hue Greenhouse Extension",
            "model": "Virtual Greenhouse Group",
        }

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return attributes with all device information.

        This data structure will be consumed by the Greenhouse Card via WebSocket.
        """
        devices_by_type: dict[str, list[str]] = {
            "plugs": [],
            "lights": [],
        }

        devices_info = {}

        for device in self._devices.values():
            device_type = device.get_device_type()
            wrapped_id = device.get_wrapped_entity_id()

            # Get current state from the original Hue entity
            wrapped_state = self.hass.states.get(wrapped_id)

            if wrapped_state:
                info = {
                    "entity_id": wrapped_id,
                    "state": wrapped_state.state,
                    "device_type": device_type,
                    "friendly_name": wrapped_state.attributes.get(
                        "friendly_name", wrapped_id
                    ),
                }

                # Add type-specific info
                if device_type == "light" and wrapped_state.attributes.get(
                    "brightness"
                ):
                    info["brightness"] = wrapped_state.attributes["brightness"]

                devices_info[wrapped_id] = info

                # Categorize by type
                if device_type == "plug":
                    devices_by_type["plugs"].append(wrapped_id)
                elif device_type == "light":
                    devices_by_type["lights"].append(wrapped_id)

        return {
            ATTR_GREENHOUSE_ID: self._greenhouse_id,
            ATTR_DEVICES: list(devices_info.keys()),
            ATTR_DEVICE_COUNT: len(self._devices),
            "devices_by_type": devices_by_type,
            "devices_info": devices_info,
        }

    async def async_add_device(self, greenhouse_device: GreenhouseDevice) -> None:
        """Add a device to this greenhouse.

        This method will be called by FR1/FR2/FR3 to register their devices.

        Args:
            greenhouse_device: Instance of GreenhouseDevice
        """
        # Use unique_id as key since entity might not be registered yet
        unique_id = greenhouse_device.unique_id
        wrapped_entity_id = greenhouse_device.get_wrapped_entity_id()

        if unique_id in self._devices:
            _LOGGER.warning("Device %s already in greenhouse", wrapped_entity_id)
            return

        self._devices[unique_id] = greenhouse_device

        # Track the wrapped entity's state changes to update group state
        async_track_state_change_event(
            self.hass,
            [wrapped_entity_id],
            self._handle_device_change,
        )

        await self.async_update_ha_state()

        # Fire event for others to subscribe to
        self.hass.bus.async_fire(
            EVENT_GREENHOUSE_DEVICE_ADDED,
            {
                "greenhouse_id": self._greenhouse_id,
                "entity_id": wrapped_entity_id,
                "device_type": greenhouse_device.get_device_type(),
            },
        )

        _LOGGER.info(
            "Added device %s to greenhouse %s",
            wrapped_entity_id,
            self._greenhouse_id,
        )

    async def async_remove_device(self, entity_id) -> None:
        """Remove a device from this greenhouse."""
        if entity_id not in self._devices:
            _LOGGER.warning("Device %s not in greenhouse", entity_id)
            return

        del self._devices[entity_id]
        await self.async_update_ha_state()

        self.hass.bus.async_fire(
            EVENT_GREENHOUSE_DEVICE_REMOVED,
            {
                "greenhouse_id": self._greenhouse_id,
                "entity_id": entity_id,
            },
        )

        _LOGGER.info(
            "Removed device %s from greenhouse %s", entity_id, self._greenhouse_id
        )

    @callback
    def _handle_device_change(self, event) -> None:
        """Handle device state changes to update group state."""
        self.async_write_ha_state()

    # Public query methods for FR1/FR2/FR3

    def get_devices(self) -> dict[str, GreenhouseDevice]:
        """Return all devices in this greenhouse."""
        return self._devices

    def get_devices_by_type(self, device_type) -> list[GreenhouseDevice]:
        """Get all devices of a specific type.

        Usage by other FRs:
        - FR1/FR2: plugs = greenhouse.get_devices_by_type("plug")
        - FR3: lights = greenhouse.get_devices_by_type("light")

        Args:
            device_type: "plug", "light"

        Returns:
            List of GreenhouseDevice instances
        """
        return [
            device
            for device in self._devices.values()
            if device.get_device_type() == device_type
        ]

    def get_device_entity_ids(self, device_type: str | None = None) -> list[str]:
        """Get wrapped entity IDs for direct control.

        Args:
            device_type: Optional filter by type

        Returns:
            List of entity IDs (e.g., ["switch.hue_water_pump"])
        """
        devices = (
            self.get_devices_by_type(device_type)
            if device_type
            else self._devices.values()
        )
        return [device.get_wrapped_entity_id() for device in devices]
