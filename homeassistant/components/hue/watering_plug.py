"""Mixin for Smart Watering features for Hue Plugs."""

# pylint: disable=hass-enforce-class-module
from __future__ import annotations

from collections.abc import Callable
import datetime
from typing import TYPE_CHECKING, Any

from homeassistant.core import callback
from homeassistant.helpers.event import async_call_later, async_track_time_change
from homeassistant.util import dt as dt_util

from .const import ATTR_NEXT_WATERING, ATTR_WATERING_ACTIVE, DEFAULT_WATERING_DURATION

# Configuration: Water every day at 07:00 AM
WATERING_HOUR = 7
WATERING_MINUTE = 0

if TYPE_CHECKING:

    class WateringPlugMixinBase:
        """Base class for type checking."""

        hass: Any  # Using Any to avoid circular imports/complex typing logic

        def async_write_ha_state(self) -> None:
            """Write the state to the state machine."""

        async def async_turn_on(self, **kwargs: Any) -> None:
            """Turn the switch on."""

        async def async_turn_off(self, **kwargs: Any) -> None:
            """Turn the switch off."""

else:

    class WateringPlugMixinBase:
        """Runtime base class."""


class WateringPlugMixin(WateringPlugMixinBase):
    """Mixin to add smart watering capabilities to a Hue switch/plug."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        """Initialize the mixin."""
        self._watering_active: bool = False
        self._watering_schedule_unsub: Callable[[], None] | None = None
        self._watering_auto_off_unsub: Callable[[], None] | None = None

    async def async_added_to_hass(self) -> None:
        """Run when entity is added to register the scheduler."""
        # SEP-17: Register daily schedule at 07:00 AM
        if self.hass:
            self._watering_schedule_unsub = async_track_time_change(
                self.hass,
                self._async_check_watering_schedule,
                hour=WATERING_HOUR,
                minute=WATERING_MINUTE,
                second=0,
            )

    async def async_will_remove_from_hass(self) -> None:
        """Clean up listeners when entity is removed."""
        if self._watering_schedule_unsub:
            self._watering_schedule_unsub()
            self._watering_schedule_unsub = None
        self._cancel_auto_off_timer()

    @callback
    def _async_check_watering_schedule(
        self, now: datetime.datetime | None = None
    ) -> None:
        """Check the time and trigger watering if scheduled."""
        # Call the new method name
        self.hass.async_create_task(self.async_start_watering())

    def _cancel_auto_off_timer(self) -> None:
        """Cancel the running auto-off timer if it exists."""
        if self._watering_auto_off_unsub:
            self._watering_auto_off_unsub()
            self._watering_auto_off_unsub = None

    async def async_start_watering(self) -> None:
        """Handle a request to start watering (Manual or Scheduled)."""
        self._watering_active = True

        # SEP-21: State will update due to this call
        self.async_write_ha_state()

        # 1. Turn on the physical plug (no flag needed)
        await self.async_turn_on()

        # 2. Schedule the Auto-Off
        self._cancel_auto_off_timer()
        duration_min = DEFAULT_WATERING_DURATION

        self._watering_auto_off_unsub = async_call_later(
            self.hass,
            duration_min * 60,  # Convert to seconds
            self._async_watering_auto_off,
        )

    @callback
    def _async_watering_auto_off(self, now: datetime.datetime) -> None:
        """Automatically turn off the plug after the duration."""
        self._watering_active = False
        self._cancel_auto_off_timer()

        # Turn off the physical device
        self.hass.async_create_task(self.async_turn_off())
        self.async_write_ha_state()

    def _get_watering_attributes(self) -> dict[str, Any]:
        """Return watering specific attributes."""
        # Calculate next run time for display
        now = dt_util.now()
        next_run = now.replace(
            hour=WATERING_HOUR, minute=WATERING_MINUTE, second=0, microsecond=0
        )
        if next_run <= now:
            next_run += datetime.timedelta(days=1)

        return {
            ATTR_WATERING_ACTIVE: self._watering_active,
            ATTR_NEXT_WATERING: next_run.isoformat(),
        }

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        """Return the optional state attributes."""
        return self._get_watering_attributes()
