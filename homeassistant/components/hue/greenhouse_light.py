"""Mixin for Greenhouse lighting features."""

from __future__ import annotations

from collections.abc import Callable
import datetime
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .const import GREENHOUSE_SCENES

# Configuration: Growth starts at 06:00, Rest starts at 18:00
DEFAULT_GROWTH_HOUR = 6
DEFAULT_REST_HOUR = 18

if TYPE_CHECKING:
    # Elegant fix: We don't inherit from Entity.
    # We just define the attributes we expect the host class to have.
    # This satisfies Mypy without triggering Pylint's file naming rules.
    class GreenhouseLightMixinBase:
        """Base class for type checking."""

        hass: HomeAssistant

        def async_write_ha_state(self) -> None:
            """Write the state to the state machine."""

        async def async_turn_on(self, **kwargs: Any) -> None:
            """Turn the light on."""

        async def async_added_to_hass(self) -> None:
            """Run when entity is added."""

        async def async_will_remove_from_hass(self) -> None:
            """Run when entity will be removed."""

else:

    class GreenhouseLightMixinBase:
        """Runtime base class."""


class GreenhouseLightMixin(GreenhouseLightMixinBase):
    """Mixin to add greenhouse scheduling capabilities to a Hue light."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        """Initialize the mixin."""
        self._greenhouse_mode: str | None = None
        self._greenhouse_active: bool = False
        self._greenhouse_unsub: Callable[[], None] | None = None
        self._growth_hour: int = DEFAULT_GROWTH_HOUR
        self._rest_hour: int = DEFAULT_REST_HOUR

    async def async_added_to_hass(self) -> None:
        """Run when entity is added to register the scheduler."""
        await super().async_added_to_hass()
        # Hook into the Home Assistant event loop
        if self.hass:
            self._register_greenhouse_schedule()

    async def async_will_remove_from_hass(self) -> None:
        """Clean up listeners when entity is removed."""
        await super().async_will_remove_from_hass()
        if self._greenhouse_unsub:
            self._greenhouse_unsub()
            self._greenhouse_unsub = None

    @callback
    def set_greenhouse_mode(self, mode: str) -> None:
        """Enable a specific greenhouse mode manually."""
        if mode not in GREENHOUSE_SCENES:
            return
        self._greenhouse_mode = mode
        self._greenhouse_active = True
        self.async_write_ha_state()

    @callback
    def set_greenhouse_mode_auto(self) -> None:
        """Enable auto mode and determine current mode based on time."""
        self._greenhouse_active = True
        # Immediately check and apply the correct mode for current time
        self._async_check_greenhouse_schedule()
        self.async_write_ha_state()

    @callback
    def clear_greenhouse_mode(self) -> None:
        """Disable greenhouse mode (manual override)."""
        self._greenhouse_mode = None
        self._greenhouse_active = False
        self.async_write_ha_state()

    @callback
    def _async_check_greenhouse_schedule(
        self, now: datetime.datetime | None = None
    ) -> None:
        """Check the time and apply the correct scene if greenhouse is active."""
        if not self._greenhouse_active:
            return

        if now is None:
            now = dt_util.now()

        # Determine correct mode based on time
        target_mode = "rest"
        if self._growth_hour <= now.hour < self._rest_hour:
            target_mode = "growth"

        # If we are already in the target mode, do nothing
        if self._greenhouse_mode == target_mode:
            return

        self._greenhouse_mode = target_mode
        self._apply_greenhouse_scene(target_mode)

    def _apply_greenhouse_scene(self, mode: str) -> None:
        """Apply the scene parameters to the light."""
        scene_data = GREENHOUSE_SCENES[mode]

        # We call the standard async_turn_on method of the LightEntity
        if self.hass:
            self.hass.async_create_task(
                self.async_turn_on(
                    brightness=scene_data["brightness"],
                    color_temp_kelvin=scene_data["color_temp_kelvin"],
                )
            )

    def _register_greenhouse_schedule(self) -> None:
        """Register the greenhouse schedule checker with current settings."""
        if self._greenhouse_unsub:
            self._greenhouse_unsub()
            self._greenhouse_unsub = None

        # check every hour at the top of the hour
        self._greenhouse_unsub = async_track_time_change(
            self.hass, self._async_check_greenhouse_schedule, second=0, minute=0
        )

    @callback
    def update_greenhouse_schedule(self, growth_hour: int, rest_hour: int) -> None:
        """Update the greenhouse schedule to new times."""
        if not (0 <= growth_hour <= 23 and 0 <= rest_hour <= 23):
            return

        if growth_hour == rest_hour:
            return  # Same hour doesn't make sense

        self._growth_hour = growth_hour
        self._rest_hour = rest_hour

        # Re-check schedule immediately with new times
        self._async_check_greenhouse_schedule()
        self.async_write_ha_state()

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        """Return the optional state attributes."""
        return {
            "greenhouse_active": self._greenhouse_active,
            "greenhouse_mode": self._greenhouse_mode,
            "growth_hour": self._growth_hour,
            "rest_hour": self._rest_hour,
            "growth_time": f"{self._growth_hour:02d}:00",
            "rest_time": f"{self._rest_hour:02d}:00",
        }
