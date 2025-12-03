"""Support for Hue lights."""

from __future__ import annotations

from functools import partial
from typing import Any

from aiohue import HueBridgeV2
from aiohue.v2.controllers.events import EventType
from aiohue.v2.controllers.groups import GroupedLightController
from aiohue.v2.controllers.lights import LightsController
from aiohue.v2.models.feature import EffectStatus, TimedEffectStatus
from aiohue.v2.models.grouped_light import GroupedLight
from aiohue.v2.models.light import Light

from homeassistant.components.light import (
    ATTR_BRIGHTNESS,
    ATTR_COLOR_TEMP_KELVIN,
    ATTR_EFFECT,
    ATTR_FLASH,
    ATTR_TRANSITION,
    ATTR_XY_COLOR,
    EFFECT_OFF,
    FLASH_SHORT,
    ColorMode,
    LightEntity,
    LightEntityDescription,
    LightEntityFeature,
    filter_supported_color_modes,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.issue_registry import IssueSeverity, async_create_issue
from homeassistant.util import color as color_util

from ..bridge import HueBridge, HueConfigEntry
from ..const import DOMAIN
from ..greenhouse_light import GreenhouseLightMixin
from ..watering_plug import WateringPlugMixin
from .entity import HueBaseEntity
from .helpers import (
    normalize_hue_brightness,
    normalize_hue_colortemp,
    normalize_hue_transition,
)

FALLBACK_MIN_KELVIN = 6500
FALLBACK_MAX_KELVIN = 2000
FALLBACK_KELVIN = 5800

DEPRECATED_EFFECT_NONE = "None"


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: HueConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up Hue Light from Config Entry."""
    bridge = config_entry.runtime_data
    api: HueBridgeV2 = bridge.api
    controller: LightsController = api.lights
    make_light_entity = partial(HueLight, bridge, controller)

    @callback
    def async_add_light(event_type: EventType, resource: Light) -> None:
        """Add Hue Light."""
        async_add_entities([make_light_entity(resource)])

    async_add_entities(make_light_entity(light) for light in controller)
    config_entry.async_on_unload(
        controller.subscribe(async_add_light, event_filter=EventType.RESOURCE_ADDED)
    )


# SEP-14 & SEP-15: Inherit from BOTH Mixins
# pylint: disable-next=hass-enforce-class-module
class HueLight(WateringPlugMixin, GreenhouseLightMixin, HueBaseEntity, LightEntity):
    """Representation of a Hue light."""

    _fixed_color_mode: ColorMode | None = None
    entity_description = LightEntityDescription(
        key="hue_light", translation_key="hue_light", has_entity_name=True, name=None
    )

    def __init__(
        self,
        bridge: HueBridge,
        controller: GroupedLightController | LightsController,
        resource: Light | GroupedLight,
    ) -> None:
        """Initialize the light."""
        # 1. Explicitly initialize the Hue Base Entity
        HueBaseEntity.__init__(self, bridge, controller, resource)

        # 2. Initialize Greenhouse Mixin (SEP-15)
        GreenhouseLightMixin.__init__(self)

        # 3. Initialize Watering Mixin (SEP-14)
        WateringPlugMixin.__init__(self)

        # 4. Initialize Standard Light Entity
        LightEntity.__init__(self)

        self.resource = resource
        self.controller = controller

        if self.resource.alert and self.resource.alert.action_values:
            self._attr_supported_features |= LightEntityFeature.FLASH

        supported_color_modes = {ColorMode.ONOFF}
        if self.resource.supports_color:
            supported_color_modes.add(ColorMode.XY)
        if self.resource.supports_color_temperature:
            supported_color_modes.add(ColorMode.COLOR_TEMP)
        if self.resource.supports_dimming:
            supported_color_modes.add(ColorMode.BRIGHTNESS)
            self._attr_supported_features |= LightEntityFeature.TRANSITION
        supported_color_modes = filter_supported_color_modes(supported_color_modes)
        self._attr_supported_color_modes = supported_color_modes
        if len(self._attr_supported_color_modes) == 1:
            self._fixed_color_mode = next(iter(self._attr_supported_color_modes))
        self._last_brightness: float | None = None
        self._color_temp_active: bool = False
        self._attr_effect_list = []
        if effects := resource.effects:
            self._attr_effect_list = [
                x.value
                for x in effects.status_values
                if x not in (EffectStatus.NO_EFFECT, EffectStatus.UNKNOWN)
            ]
        if timed_effects := resource.timed_effects:
            self._attr_effect_list += [
                x.value
                for x in timed_effects.status_values
                if x != TimedEffectStatus.NO_EFFECT
            ]
        if len(self._attr_effect_list) > 0:
            self._attr_effect_list.insert(0, EFFECT_OFF)
            self._attr_supported_features |= LightEntityFeature.EFFECT

    async def async_added_to_hass(self) -> None:
        """Handle entity which will be added."""
        await super().async_added_to_hass()
        # Register schedulers for both features
        await GreenhouseLightMixin.async_added_to_hass(self)
        await WateringPlugMixin.async_added_to_hass(self)

    async def async_will_remove_from_hass(self) -> None:
        """Handle entity which will be removed."""
        await super().async_will_remove_from_hass()
        await GreenhouseLightMixin.async_will_remove_from_hass(self)
        await WateringPlugMixin.async_will_remove_from_hass(self)

    @property
    def brightness(self) -> int | None:
        """Return the brightness of this light between 0..255."""
        if dimming := self.resource.dimming:
            return round((dimming.brightness / 100) * 255)
        return None

    @property
    def is_on(self) -> bool:
        """Return true if device is on (brightness above 0)."""
        return self.resource.on.on

    @property
    def color_mode(self) -> ColorMode:
        """Return the color mode of the light."""
        if self._fixed_color_mode:
            return self._fixed_color_mode
        if self.color_temp_active:
            return ColorMode.COLOR_TEMP
        return ColorMode.XY

    @property
    def color_temp_active(self) -> bool:
        """Return if the light is in Color Temperature mode."""
        color_temp = self.resource.color_temperature
        if color_temp is None or color_temp.mirek is None:
            return False
        if self.device.product_data.certified:
            return self.resource.color_temperature.mirek_valid
        return self._color_temp_active

    @property
    def xy_color(self) -> tuple[float, float] | None:
        """Return the xy color."""
        if color := self.resource.color:
            return (color.xy.x, color.xy.y)
        return None

    @property
    def color_temp_kelvin(self) -> int | None:
        """Return the color temperature value in Kelvin."""
        if color_temp := self.resource.color_temperature:
            return color_util.color_temperature_mired_to_kelvin(color_temp.mirek)
        return FALLBACK_KELVIN

    @property
    def max_color_temp_kelvin(self) -> int:
        """Return the coldest color_temp_kelvin that this light supports."""
        if color_temp := self.resource.color_temperature:
            return color_util.color_temperature_mired_to_kelvin(
                color_temp.mirek_schema.mirek_minimum
            )
        return FALLBACK_MAX_KELVIN

    @property
    def min_color_temp_kelvin(self) -> int:
        """Return the warmest color_temp_kelvin that this light supports."""
        if color_temp := self.resource.color_temperature:
            return color_util.color_temperature_mired_to_kelvin(
                color_temp.mirek_schema.mirek_maximum
            )
        return FALLBACK_MIN_KELVIN

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        """Return the optional state attributes."""
        attributes: dict[str, Any] = {
            "mode": self.resource.mode.value,
            "dynamics": self.resource.dynamics.status.value,
        }
        # SEP-27: Merge Greenhouse Attributes
        if self._greenhouse_active:
            attributes["greenhouse_mode"] = self._greenhouse_mode
            attributes["greenhouse_active"] = True

        # SEP-21: Merge Watering Attributes
        # Now we can safely call the method from the mixin
        attributes.update(self._get_watering_attributes())

        return attributes

    @property
    def effect(self) -> str | None:
        """Return the current effect."""
        if effects := self.resource.effects:
            if effects.status != EffectStatus.NO_EFFECT:
                return effects.status.value
        if timed_effects := self.resource.timed_effects:
            if timed_effects.status != TimedEffectStatus.NO_EFFECT:
                return timed_effects.status.value
        return EFFECT_OFF

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn the device on."""
        # SEP-14: Check if this is a watering trigger

        transition = normalize_hue_transition(kwargs.get(ATTR_TRANSITION))
        xy_color = kwargs.get(ATTR_XY_COLOR)
        color_temp = normalize_hue_colortemp(kwargs.get(ATTR_COLOR_TEMP_KELVIN))
        brightness = normalize_hue_brightness(kwargs.get(ATTR_BRIGHTNESS))
        if self._last_brightness and brightness is None:
            brightness = self._last_brightness
            self._last_brightness = None
        self._color_temp_active = color_temp is not None
        flash = kwargs.get(ATTR_FLASH)
        effect = effect_str = kwargs.get(ATTR_EFFECT)
        if effect_str == DEPRECATED_EFFECT_NONE:
            effect_str = EFFECT_OFF
            async_create_issue(
                self.hass,
                DOMAIN,
                "deprecated_effect_none",
                breaks_in_ha_version="2025.10.0",
                is_fixable=False,
                severity=IssueSeverity.WARNING,
                translation_key="deprecated_effect_none",
            )
        if effect_str == EFFECT_OFF:
            effect = None if self.effect == EFFECT_OFF else EffectStatus.NO_EFFECT
        elif effect_str is not None:
            effect = EffectStatus(effect_str)
            if effect == EffectStatus.UNKNOWN:
                effect = TimedEffectStatus(effect_str)
                if transition is None:
                    transition = 600000
            color_temp = None
            xy_color = None

        if flash is not None:
            await self.async_set_flash(flash)
            return

        await self.bridge.async_request_call(
            self.controller.set_state,
            id=self.resource.id,
            on=True,
            brightness=brightness,
            color_xy=xy_color,
            color_temp=color_temp,
            transition_time=transition,
            effect=effect,
        )

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn the light off."""
        transition = normalize_hue_transition(kwargs.get(ATTR_TRANSITION))
        if transition is not None and self.resource.dimming:
            self._last_brightness = self.resource.dimming.brightness
        flash = kwargs.get(ATTR_FLASH)

        if flash is not None:
            await self.async_set_flash(flash)
            return

        await self.bridge.async_request_call(
            self.controller.set_state,
            id=self.resource.id,
            on=False,
            transition_time=transition,
        )

    async def async_set_flash(self, flash: str) -> None:
        """Send flash command to light."""
        await self.bridge.async_request_call(
            self.controller.set_flash,
            id=self.resource.id,
            short=flash == FLASH_SHORT,
        )
