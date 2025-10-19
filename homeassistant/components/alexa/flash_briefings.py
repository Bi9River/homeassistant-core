"""Support for Alexa skill service end point."""

import hmac
from http import HTTPStatus
import logging
from typing import cast
import uuid

from aiohttp.web_response import StreamResponse

from homeassistant.components import http
from homeassistant.const import CONF_PASSWORD
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import template
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

from .const import (
    API_PASSWORD,
    ATTR_MAIN_TEXT,
    ATTR_REDIRECTION_URL,
    ATTR_STREAM_URL,
    ATTR_TITLE_TEXT,
    ATTR_UID,
    ATTR_UPDATE_DATE,
    CONF_AUDIO,
    CONF_DISPLAY_URL,
    CONF_TEXT,
    CONF_TITLE,
    CONF_UID,
    DATE_FORMAT,
)

_LOGGER = logging.getLogger(__name__)

FLASH_BRIEFINGS_API_ENDPOINT = "/api/alexa/flash_briefings/{briefing_id}"


@callback
def async_setup(hass: HomeAssistant, flash_briefing_config: ConfigType) -> None:
    """Activate Alexa component."""
    hass.http.register_view(AlexaFlashBriefingView(hass, flash_briefing_config))


class AlexaFlashBriefingView(http.HomeAssistantView):
    """Handle Alexa Flash Briefing skill requests."""

    url = FLASH_BRIEFINGS_API_ENDPOINT
    requires_auth = False
    name = "api:alexa:flash_briefings"

    def __init__(self, hass: HomeAssistant, flash_briefings: ConfigType) -> None:
        """Initialize Alexa view."""
        super().__init__()
        self.flash_briefings = flash_briefings

    @callback
    def get(
        self, request: http.HomeAssistantRequest, briefing_id: str
    ) -> StreamResponse | tuple[bytes, HTTPStatus]:
        """Handle Alexa Flash Briefing request."""
        _LOGGER.debug("Received Alexa flash briefing request for: %s", briefing_id)

        if error_response := self._validate_request(request, briefing_id):
            return error_response

        briefing = self._build_briefing_data(briefing_id)

        return self.json(briefing)

    def _validate_request(
        self, request: http.HomeAssistantRequest, briefing_id: str
    ) -> tuple[bytes, HTTPStatus] | None:
        """Validate the flash briefing request."""
        if request.query.get(API_PASSWORD) is None:
            _LOGGER.error(
                "No password provided for Alexa flash briefing: %s", briefing_id
            )
            return b"", HTTPStatus.UNAUTHORIZED

        if not hmac.compare_digest(
            request.query[API_PASSWORD].encode("utf-8"),
            self.flash_briefings[CONF_PASSWORD].encode("utf-8"),
        ):
            _LOGGER.error("Wrong password for Alexa flash briefing: %s", briefing_id)
            return b"", HTTPStatus.UNAUTHORIZED

        if not isinstance(self.flash_briefings.get(briefing_id), list):
            _LOGGER.error(
                "No configured Alexa flash briefing was found for: %s", briefing_id
            )
            return b"", HTTPStatus.NOT_FOUND

        return None  # All checks passed

    def _render_field(self, value: template.Template | str | None) -> str | None:
        """Render a template field or return the raw value."""
        if isinstance(value, template.Template):
            return cast(str, value.async_render(parse_result=False))
        return value  # This will be None if value was None, or the raw string

    def _build_briefing_data(self, briefing_id: str) -> list[dict]:
        """Build the list of briefing items."""
        briefing = []
        for item in self.flash_briefings.get(briefing_id, []):
            output = {}

            if (title := self._render_field(item.get(CONF_TITLE))) is not None:
                output[ATTR_TITLE_TEXT] = title

            if (text := self._render_field(item.get(CONF_TEXT))) is not None:
                output[ATTR_MAIN_TEXT] = text

            output[ATTR_UID] = item.get(CONF_UID) or str(uuid.uuid4())

            if (audio := self._render_field(item.get(CONF_AUDIO))) is not None:
                output[ATTR_STREAM_URL] = audio

            if (
                display_url := self._render_field(item.get(CONF_DISPLAY_URL))
            ) is not None:
                output[ATTR_REDIRECTION_URL] = display_url

            output[ATTR_UPDATE_DATE] = dt_util.utcnow().strftime(DATE_FORMAT)
            briefing.append(output)

        return briefing
