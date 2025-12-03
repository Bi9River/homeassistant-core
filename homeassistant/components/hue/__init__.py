"""Support for the Philips Hue system."""

import logging

from aiohue.util import normalize_bridge_id
import voluptuous as vol

from homeassistant.components import persistent_notification
from homeassistant.config_entries import SOURCE_IGNORE
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv, device_registry as dr
from homeassistant.helpers.typing import ConfigType

from .bridge import HueBridge, HueConfigEntry
from .const import (
    DOMAIN,
    GREENHOUSE_SCENES,
    SERVICE_ACTIVATE_WATERING,
    SERVICE_SET_GREENHOUSE_SCENE,
)
from .migration import check_migration
from .services import async_setup_services

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# --- GREENHOUSE LOGIC ---
GREENHOUSE_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Required("mode"): vol.In(list(GREENHOUSE_SCENES.keys())),
        vol.Optional(
            ATTR_ENTITY_ID
        ): cv.entity_ids,  # Optional: Apply to specific lights only
    }
)


async def async_handle_greenhouse_service(hass, call):
    """Handle the service call to switch greenhouse modes."""
    mode = call.data["mode"]
    target_entities = call.data.get(ATTR_ENTITY_ID)
    scene_data = GREENHOUSE_SCENES[mode]

    # Prepare the data for the standard light.turn_on service
    service_data = {
        "brightness": scene_data["brightness"],
        "color_temp": scene_data["color_temp"],
    }

    if target_entities:
        service_data[ATTR_ENTITY_ID] = target_entities

    # Proxy request to light.turn_on
    await hass.services.async_call("light", "turn_on", service_data, blocking=True)


# --- SMART WATERING LOGIC ---
WATERING_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,  # Entity ID is required
    }
)


async def async_handle_watering_service(hass: HomeAssistant, call):
    """Handle the service call to trigger smart watering."""
    target_entities = call.data.get(ATTR_ENTITY_ID)
    _LOGGER.info("Manual watering triggered for entities: %s", target_entities)

    for entity_id in target_entities:
        # 1. Verify entity exists
        if not hass.states.get(entity_id):
            _LOGGER.warning("Entity %s not found in state machine", entity_id)
            continue

        # 2. Get domain
        domain = entity_id.split(".")[0]

        # 3. Get Component
        # We access the component directly from hass.data to get the runtime object
        component = hass.data.get(domain)

        if not component or not hasattr(component, "get_entity"):
            _LOGGER.warning("Component for domain '%s' not loaded", domain)
            continue

        # 4. Get runtime entity object
        entity_object = component.get_entity(entity_id)

        if not entity_object:
            _LOGGER.warning("Could not get runtime entity object for %s", entity_id)
            continue

        # 5. Duck Typing Check
        if not hasattr(entity_object, "async_start_watering"):
            _LOGGER.error(
                "Entity %s does not support 'async_start_watering'. Is it a Hue Smart Plug?",
                entity_id,
            )
            continue

        # 6. Execute
        try:
            _LOGGER.debug("Calling async_start_watering for %s", entity_id)
            await entity_object.async_start_watering()
        except Exception as err:  # noqa: BLE001
            _LOGGER.error("Failed to start watering for %s: %s", entity_id, err)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up Hue integration."""

    # 1. Setup existing Hue services
    async_setup_services(hass)

    # 2. Register Greenhouse Service
    async def _async_greenhouse_handler(call):
        await async_handle_greenhouse_service(hass, call)

    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_GREENHOUSE_SCENE,
        _async_greenhouse_handler,
        schema=GREENHOUSE_SERVICE_SCHEMA,
    )

    # 3. Register Watering Service
    async def _async_watering_handler(call):
        await async_handle_watering_service(hass, call)

    hass.services.async_register(
        DOMAIN,
        SERVICE_ACTIVATE_WATERING,  # Now this variable is defined via import
        _async_watering_handler,
        schema=WATERING_SERVICE_SCHEMA,
    )

    return True


async def async_setup_entry(hass: HomeAssistant, entry: HueConfigEntry) -> bool:
    """Set up a bridge from a config entry."""
    # check (and run) migrations if needed
    await check_migration(hass, entry)

    # setup the bridge instance
    bridge = HueBridge(hass, entry)
    if not await bridge.async_initialize_bridge():
        return False

    api = bridge.api

    # For backwards compat
    unique_id = normalize_bridge_id(api.config.bridge_id)
    if entry.unique_id is None:
        hass.config_entries.async_update_entry(entry, unique_id=unique_id)

    # For recovering from bug where we incorrectly assumed homekit ID = bridge ID
    # Remove this logic after Home Assistant 2022.4
    elif entry.unique_id != unique_id:
        # Find entries with this unique ID
        other_entry = next(
            (
                entry
                for entry in hass.config_entries.async_entries(DOMAIN)
                if entry.unique_id == unique_id
            ),
            None,
        )
        if other_entry is None:
            # If no other entry, update unique ID of this entry ID.
            hass.config_entries.async_update_entry(entry, unique_id=unique_id)

        elif other_entry.source == SOURCE_IGNORE:
            # There is another entry but it is ignored, delete that one and update this one
            hass.async_create_task(
                hass.config_entries.async_remove(other_entry.entry_id)
            )
            hass.config_entries.async_update_entry(entry, unique_id=unique_id)
        else:
            # There is another entry that already has the right unique ID. Delete this entry
            hass.async_create_task(hass.config_entries.async_remove(entry.entry_id))
            return False

    # add bridge device to device registry
    device_registry = dr.async_get(hass)
    if bridge.api_version == 1:
        device_registry.async_get_or_create(
            config_entry_id=entry.entry_id,
            connections={(dr.CONNECTION_NETWORK_MAC, api.config.mac_address)},
            identifiers={(DOMAIN, api.config.bridge_id)},
            manufacturer="Signify",
            name=api.config.name,
            model_id=api.config.model_id,
            sw_version=api.config.software_version,
        )
        # create persistent notification if we found a bridge version with security vulnerability
        if (
            api.config.model_id == "BSB002"
            and api.config.software_version < "1935144040"
        ):
            persistent_notification.async_create(
                hass,
                (
                    "Your Hue hub has a known security vulnerability ([CVE-2020-6007] "
                    "(https://cve.circl.lu/cve/CVE-2020-6007)). "
                    "Go to the Hue app and check for software updates."
                ),
                "Signify Hue",
                "hue_hub_firmware",
            )
    else:
        device_registry.async_get_or_create(
            config_entry_id=entry.entry_id,
            connections={(dr.CONNECTION_NETWORK_MAC, api.config.mac_address)},
            identifiers={
                (DOMAIN, api.config.bridge_id),
                (DOMAIN, api.config.bridge_device.id),
            },
            manufacturer=api.config.bridge_device.product_data.manufacturer_name,
            name=api.config.name,
            model_id=api.config.model_id,
            sw_version=api.config.software_version,
        )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: HueConfigEntry) -> bool:
    """Unload a config entry."""
    return await entry.runtime_data.async_reset()
