"""The Assist pipeline integration."""

from __future__ import annotations

from collections.abc import AsyncIterable

# Added for dataclass support to group parameters
from dataclasses import dataclass
from typing import Any

import voluptuous as vol

from homeassistant.components import stt
from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers import chat_session
from homeassistant.helpers.typing import ConfigType

from .const import (
    CONF_DEBUG_RECORDING_DIR,
    DATA_CONFIG,
    DATA_LAST_WAKE_UP,
    DOMAIN,
    EVENT_RECORDING,
    OPTION_PREFERRED,
    SAMPLE_CHANNELS,
    SAMPLE_RATE,
    SAMPLE_WIDTH,
    SAMPLES_PER_CHUNK,
)
from .error import PipelineNotFound
from .pipeline import (
    AudioSettings,
    Pipeline,
    PipelineEvent,
    PipelineEventCallback,
    PipelineEventType,
    PipelineInput,
    PipelineRun,
    PipelineStage,
    WakeWordSettings,
    async_create_default_pipeline,
    async_get_pipeline,
    async_get_pipelines,
    async_setup_pipeline_store,
    async_update_pipeline,
)
from .websocket_api import async_register_websocket_api

__all__ = (
    "AudioSettings",
    "AudioStreamPipelineConfig",
    "DOMAIN",
    "EVENT_RECORDING",
    "OPTION_PREFERRED",
    "Pipeline",
    "PipelineEvent",
    "PipelineEventType",
    "PipelineNotFound",
    "SAMPLES_PER_CHUNK",
    "SAMPLE_CHANNELS",
    "SAMPLE_RATE",
    "SAMPLE_WIDTH",
    "WakeWordSettings",
    "async_create_default_pipeline",
    "async_get_pipelines",
    "async_pipeline_from_audio_stream",
    "async_setup",
    "async_update_pipeline",
)



# `AudioStreamPipelineConfig` groups the many parameters needed by
# ``async_pipeline_from_audio_stream`` into a single object.  This
# refactoring reduces the number of parameters on the function itself
# which makes the API easier to use and keeps the number of function
# parameters within maintainable limits. Each field mirrors a previously
# individual parameter of the function.
@dataclass
class AudioStreamPipelineConfig:
    """Configuration for :func:`async_pipeline_from_audio_stream`.

    This dataclass holds all the parameters required to create and run
    an assist pipeline from an audio stream.  It replaces the long
    parameter list of the original function, making the function
    signature more readable and helping callers avoid mistakes when
    passing many optional arguments.
    """

    context: Context
    event_callback: PipelineEventCallback
    stt_metadata: stt.SpeechMetadata
    stt_stream: AsyncIterable[bytes]
    wake_word_phrase: str | None = None
    pipeline_id: str | None = None
    conversation_id: str | None = None
    tts_audio_output: str | dict[str, Any] | None = None
    wake_word_settings: WakeWordSettings | None = None
    audio_settings: AudioSettings | None = None
    device_id: str | None = None
    start_stage: PipelineStage = PipelineStage.STT
    end_stage: PipelineStage = PipelineStage.TTS
    conversation_extra_system_prompt: str | None = None


CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Optional(CONF_DEBUG_RECORDING_DIR): str,
            },
        )
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Assist pipeline integration."""
    hass.data[DATA_CONFIG] = config.get(DOMAIN, {})

    # wake_word_id -> timestamp of last detection (monotonic_ns)
    hass.data[DATA_LAST_WAKE_UP] = {}

    await async_setup_pipeline_store(hass)
    async_register_websocket_api(hass)

    return True


async def async_pipeline_from_audio_stream(
    hass: HomeAssistant,
    config: AudioStreamPipelineConfig,
) -> None:
    """Create an audio pipeline from an audio stream.

    Accepts a single :class:`~AudioStreamPipelineConfig` instance containing all
    configuration values for the pipeline run.  Grouping the
    parameters into a dataclass simplifies the function signature and
    prevents accidental mis-ordering of arguments.

    Raises:
    ------
    PipelineNotFound
        If no pipeline corresponding to ``config.pipeline_id`` can be found.
    """
    # Extract values from the provided configuration for clarity
    context = config.context
    event_callback = config.event_callback
    stt_metadata = config.stt_metadata
    stt_stream = config.stt_stream
    wake_word_phrase = config.wake_word_phrase
    pipeline_id = config.pipeline_id
    conversation_id = config.conversation_id
    tts_audio_output = config.tts_audio_output
    wake_word_settings = config.wake_word_settings
    audio_settings = config.audio_settings
    device_id = config.device_id
    start_stage = config.start_stage
    end_stage = config.end_stage
    conversation_extra_system_prompt = config.conversation_extra_system_prompt

    with chat_session.async_get_chat_session(hass, conversation_id) as session:
        pipeline_input = PipelineInput(
            session=session,
            device_id=device_id,
            stt_metadata=stt_metadata,
            stt_stream=stt_stream,
            wake_word_phrase=wake_word_phrase,
            conversation_extra_system_prompt=conversation_extra_system_prompt,
            run=PipelineRun(
                hass,
                context=context,
                pipeline=async_get_pipeline(hass, pipeline_id=pipeline_id),
                start_stage=start_stage,
                end_stage=end_stage,
                event_callback=event_callback,
                tts_audio_output=tts_audio_output,
                wake_word_settings=wake_word_settings,
                audio_settings=audio_settings or AudioSettings(),
            ),
        )
        await pipeline_input.validate()
        await pipeline_input.execute()
