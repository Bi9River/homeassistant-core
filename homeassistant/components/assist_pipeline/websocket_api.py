"""Assist pipeline Websocket API."""

import asyncio
import base64
from collections.abc import AsyncGenerator, Callable
import contextlib
import logging
import math
from typing import Any, Final

import audioop  # pylint: disable=deprecated-module
import voluptuous as vol

from homeassistant.components import conversation, stt, tts, websocket_api
from homeassistant.const import ATTR_DEVICE_ID, ATTR_SECONDS, MATCH_ALL
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import (
    chat_session,
    config_validation as cv,
    entity_registry as er,
)
from homeassistant.util import language as language_util

from .const import (
    DEFAULT_PIPELINE_TIMEOUT,
    DEFAULT_WAKE_WORD_TIMEOUT,
    EVENT_RECORDING,
    SAMPLE_CHANNELS,
    SAMPLE_RATE,
    SAMPLE_WIDTH,
)
from .error import PipelineNotFound
from .pipeline import (
    KEY_ASSIST_PIPELINE,
    AudioSettings,
    DeviceAudioQueue,
    PipelineError,
    PipelineEvent,
    PipelineEventType,
    PipelineInput,
    PipelineRun,
    PipelineStage,
    WakeWordSettings,
    async_get_pipeline,
)

_LOGGER = logging.getLogger(__name__)

CAPTURE_RATE: Final = 16000
CAPTURE_WIDTH: Final = 2
CAPTURE_CHANNELS: Final = 1
MAX_CAPTURE_TIMEOUT: Final = 60.0


@callback
def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register the websocket API."""
    websocket_api.async_register_command(hass, websocket_run)
    websocket_api.async_register_command(hass, websocket_list_languages)
    websocket_api.async_register_command(hass, websocket_list_runs)
    websocket_api.async_register_command(hass, websocket_list_devices)
    websocket_api.async_register_command(hass, websocket_get_run)
    websocket_api.async_register_command(hass, websocket_device_capture)


@websocket_api.websocket_command(
    vol.All(
        websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
            {
                vol.Required("type"): "assist_pipeline/run",
                # pylint: disable-next=unnecessary-lambda
                vol.Required("start_stage"): lambda val: PipelineStage(val),
                # pylint: disable-next=unnecessary-lambda
                vol.Required("end_stage"): lambda val: PipelineStage(val),
                vol.Optional("input"): dict,
                vol.Optional("pipeline"): str,
                vol.Optional("conversation_id"): vol.Any(str, None),
                vol.Optional("device_id"): vol.Any(str, None),
                vol.Optional("timeout"): vol.Any(float, int),
            },
        ),
        cv.key_value_schemas(
            "start_stage",
            {
                PipelineStage.WAKE_WORD: vol.Schema(
                    {
                        vol.Required("input"): {
                            vol.Required("sample_rate"): int,
                            vol.Optional("timeout"): vol.Any(float, int),
                            vol.Optional("audio_seconds_to_buffer"): vol.Any(
                                float, int
                            ),
                            # Audio enhancement
                            vol.Optional("noise_suppression_level"): int,
                            vol.Optional("auto_gain_dbfs"): int,
                            vol.Optional("volume_multiplier"): float,
                            # Advanced use cases/testing
                            vol.Optional("no_vad"): bool,
                        }
                    },
                    extra=vol.ALLOW_EXTRA,
                ),
                PipelineStage.STT: vol.Schema(
                    {
                        vol.Required("input"): {
                            vol.Required("sample_rate"): int,
                            vol.Optional("wake_word_phrase"): str,
                        }
                    },
                    extra=vol.ALLOW_EXTRA,
                ),
                PipelineStage.INTENT: vol.Schema(
                    {vol.Required("input"): {"text": str}},
                    extra=vol.ALLOW_EXTRA,
                ),
                PipelineStage.TTS: vol.Schema(
                    {vol.Required("input"): {"text": str}},
                    extra=vol.ALLOW_EXTRA,
                ),
            },
        ),
    ),
)
@websocket_api.async_response
async def websocket_run(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Run a pipeline."""
    # Extract pipeline and handle not-found error in a helper to improve readability
    pipeline = _get_pipeline_or_send_error(hass, connection, msg)
    if pipeline is None:
        return

    timeout: float = msg.get("timeout", DEFAULT_PIPELINE_TIMEOUT)
    start_stage = PipelineStage(msg["start_stage"])
    end_stage = PipelineStage(msg["end_stage"])

    # Prepare initial input arguments and audio-related settings based on the start stage
    (
        input_args,
        handler_id,
        unregister_handler,
        wake_word_settings,
        audio_settings,
    ) = await _prepare_pipeline_input(hass, connection, msg, start_stage, pipeline)

    # Always pass through the device identifier
    input_args["device_id"] = msg.get("device_id")

    # Assemble the PipelineRun with prepared settings
    pipeline_run = PipelineRun(
        hass,
        context=connection.context(msg),
        pipeline=pipeline,
        start_stage=start_stage,
        end_stage=end_stage,
        event_callback=lambda event: connection.send_event(msg["id"], event),
        runner_data={
            "stt_binary_handler_id": handler_id,
            "timeout": timeout,
        },
        wake_word_settings=wake_word_settings,
        audio_settings=audio_settings or AudioSettings(),
    )
    input_args["run"] = pipeline_run

    # Obtain a chat session and execute the pipeline input
    await _execute_pipeline_run(
        hass,
        connection,
        msg,
        input_args,
        timeout,
        unregister_handler,
    )


# -----------------------------------------------------------------------------
# Helper functions to support the websocket_run command.
#
# These helpers break up the complex logic of the websocket_run handler into
# discrete tasks: pipeline retrieval, input preparation, and execution.  This
# improves readability and reduces the cognitive complexity of the main
# websocket_run function.


def _get_pipeline_or_send_error(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> Any | None:
    """Return a pipeline instance or send an error if not found.

    This helper centralises pipeline retrieval and error handling.  If the
    requested pipeline cannot be found, an error is sent to the client and
    ``None`` is returned to indicate that further processing should abort.
    """
    pipeline_id = msg.get("pipeline")
    try:
        return async_get_pipeline(hass, pipeline_id=pipeline_id)
    except PipelineNotFound:
        connection.send_error(
            msg["id"],
            "pipeline-not-found",
            f"Pipeline not found: id={pipeline_id}",
        )
        return None


async def _prepare_pipeline_input(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    start_stage: PipelineStage,
    pipeline: Any,
) -> tuple[
    dict[str, Any],
    int | None,
    Callable[[], None] | None,
    WakeWordSettings | None,
    AudioSettings | None,
]:
    """Prepare input arguments and audio settings based on the start stage.

    Returns a tuple containing:

      1. ``input_args``: a dict of arguments suitable for ``PipelineInput``.
      2. ``handler_id``: the identifier returned by ``async_register_binary_handler`` (or ``None`` if not applicable).
      3. ``unregister_handler``: a function to unregister the binary handler (or ``None``).
      4. ``wake_word_settings``: optional ``WakeWordSettings`` if wake-word detection is enabled.
      5. ``audio_settings``: optional ``AudioSettings`` used by the pipeline.

    The logic for handling wake-word and STT pipelines is grouped here to
    simplify the main handler.
    """
    input_args: dict[str, Any] = {}
    handler_id: int | None = None
    unregister_handler: Callable[[], None] | None = None
    wake_word_settings: WakeWordSettings | None = None
    audio_settings: AudioSettings | None = None

    # Audio pipelines require special handling: they receive binary
    # websocket messages that must be collected and optionally resampled.
    if start_stage in (PipelineStage.WAKE_WORD, PipelineStage.STT):
        msg_input = msg.get("input", {})
        # Queue to buffer incoming raw audio from websocket
        audio_queue: asyncio.Queue[bytes] = asyncio.Queue()
        incoming_sample_rate = msg_input.get("sample_rate")
        wake_word_phrase: str | None = None

        if start_stage == PipelineStage.WAKE_WORD:
            wake_word_settings = WakeWordSettings(
                timeout=msg_input.get("timeout", DEFAULT_WAKE_WORD_TIMEOUT),
                audio_seconds_to_buffer=msg_input.get("audio_seconds_to_buffer", 0),
            )
        elif start_stage == PipelineStage.STT:
            wake_word_phrase = msg_input.get("wake_word_phrase")

        async def stt_stream() -> AsyncGenerator[bytes]:
            """Yield PCM audio chunks from the queue, resampling if necessary."""
            state = None
            while chunk := await audio_queue.get():
                if incoming_sample_rate and incoming_sample_rate != SAMPLE_RATE:
                    chunk, state = audioop.ratecv(
                        chunk,
                        SAMPLE_WIDTH,
                        SAMPLE_CHANNELS,
                        incoming_sample_rate,
                        SAMPLE_RATE,
                        state,
                    )
                yield chunk

        def handle_binary(
            _hass: HomeAssistant,
            _connection: websocket_api.ActiveConnection,
            data: bytes,
        ) -> None:
            """Callback invoked for each binary message containing audio."""
            audio_queue.put_nowait(data)

        # Register handler for binary audio messages
        handler_id, unregister_handler = connection.async_register_binary_handler(
            handle_binary
        )

        # Build speech metadata expected by the STT engine.  Audio is
        # delivered as raw PCM at 16kHz, 16-bit, mono.
        input_args["stt_metadata"] = stt.SpeechMetadata(
            language=pipeline.stt_language or pipeline.language,
            format=stt.AudioFormats.WAV,
            codec=stt.AudioCodecs.PCM,
            bit_rate=stt.AudioBitRates.BITRATE_16,
            sample_rate=stt.AudioSampleRates.SAMPLERATE_16000,
            channel=stt.AudioChannels.CHANNEL_MONO,
        )
        input_args["stt_stream"] = stt_stream()
        input_args["wake_word_phrase"] = wake_word_phrase

        # Create audio settings controlling noise suppression, gain and VAD
        audio_settings = AudioSettings(
            noise_suppression_level=msg_input.get("noise_suppression_level", 0),
            auto_gain_dbfs=msg_input.get("auto_gain_dbfs", 0),
            volume_multiplier=msg_input.get("volume_multiplier", 1.0),
            is_vad_enabled=not msg_input.get("no_vad", False),
        )

    elif start_stage == PipelineStage.INTENT:
        # Provide plain text input to the conversation agent
        input_args["intent_input"] = msg.get("input", {}).get("text")

    elif start_stage == PipelineStage.TTS:
        # Provide plain text input to the text-to-speech system
        input_args["tts_input"] = msg.get("input", {}).get("text")

    return (
        input_args,
        handler_id,
        unregister_handler,
        wake_word_settings,
        audio_settings,
    )


async def _execute_pipeline_run(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    input_args: dict[str, Any],
    timeout: float,
    unregister_handler: Callable[[], None] | None,
) -> None:
    """Validate and run a pipeline, handling results and timeouts.

    This helper encapsulates the final steps of pipeline execution: session
    creation, validation, task scheduling, timeout management and cleanup.
    """
    # Establish a chat session for this run.  The session ensures stateful
    # conversation handling across multiple requests.
    with chat_session.async_get_chat_session(
        hass, msg.get("conversation_id")
    ) as session:
        input_args["session"] = session
        pipeline_input = PipelineInput(**input_args)

        try:
            await pipeline_input.validate()
        except PipelineError as error:
            # Report more specific error when possible
            connection.send_error(msg["id"], error.code, error.message)
            return

        # Confirm subscription; any further events will be pushed via send_event
        connection.send_result(msg["id"])

        # Execute the pipeline asynchronously
        run_task = hass.async_create_task(pipeline_input.execute())
        # Allow the client to cancel the pipeline via websocket unsubscribe
        connection.subscriptions[msg["id"]] = run_task.cancel

        try:
            # Enforce a timeout on pipeline execution
            async with asyncio.timeout(timeout):
                await run_task
        except TimeoutError:
            # Propagate a timeout error to the client via pipeline events
            pipeline_input.run.process_event(
                PipelineEvent(
                    PipelineEventType.ERROR,
                    {
                        "code": "timeout",
                        "message": "Timeout running pipeline",
                    },
                )
            )
        finally:
            # Always unregister the binary handler if it was registered
            if unregister_handler is not None:
                unregister_handler()


def _language_set_from_tags(
    language_tags: Any,
    *,
    ignore_match_all: bool = False,
) -> set[str] | None:
    """Convert a list of language tags into a set of base language codes.

    If ``ignore_match_all`` is True and the language tags equal ``MATCH_ALL``,
    ``None`` is returned to indicate that all languages are accepted and no
    filtering should occur.  Otherwise, tags are parsed into their base
    languages using ``language_util.Dialect``.
    """
    if not language_tags:
        return None
    # Exclude wildcards when requested (used for conversation languages)
    if ignore_match_all and language_tags == MATCH_ALL:
        return None
    languages: set[str] = set()
    for tag in language_tags:
        try:
            dialect = language_util.Dialect.parse(tag)
            languages.add(dialect.language)
        except Exception:  # noqa: BLE001
            # If parsing fails, skip this tag rather than failing entirely
            _LOGGER.debug("Failed to parse language tag %s", tag, exc_info=True)
    return languages if languages else None


@callback
@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "assist_pipeline/pipeline_debug/list",
        vol.Required("pipeline_id"): str,
    }
)
def websocket_list_runs(
    hass: HomeAssistant,
    connection: websocket_api.connection.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List pipeline runs for which debug data is available."""
    pipeline_data = hass.data[KEY_ASSIST_PIPELINE]
    pipeline_id = msg["pipeline_id"]

    if pipeline_id not in pipeline_data.pipeline_debug:
        connection.send_result(msg["id"], {"pipeline_runs": []})
        return

    pipeline_debug = pipeline_data.pipeline_debug[pipeline_id]

    connection.send_result(
        msg["id"],
        {
            "pipeline_runs": [
                {
                    "pipeline_run_id": pipeline_run_id,
                    "timestamp": pipeline_run.timestamp,
                }
                for pipeline_run_id, pipeline_run in pipeline_debug.items()
            ]
        },
    )


@callback
@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "assist_pipeline/device/list",
    }
)
def websocket_list_devices(
    hass: HomeAssistant,
    connection: websocket_api.connection.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List assist devices."""
    pipeline_data = hass.data[KEY_ASSIST_PIPELINE]
    ent_reg = er.async_get(hass)
    connection.send_result(
        msg["id"],
        [
            {
                "device_id": device_id,
                "pipeline_entity": ent_reg.async_get_entity_id(
                    "select", info.domain, f"{info.unique_id_prefix}-pipeline"
                ),
            }
            for device_id, info in pipeline_data.pipeline_devices.items()
        ],
    )


@callback
@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "assist_pipeline/pipeline_debug/get",
        vol.Required("pipeline_id"): str,
        vol.Required("pipeline_run_id"): str,
    }
)
def websocket_get_run(
    hass: HomeAssistant,
    connection: websocket_api.connection.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Get debug data for a pipeline run."""
    pipeline_data = hass.data[KEY_ASSIST_PIPELINE]
    pipeline_id = msg["pipeline_id"]
    pipeline_run_id = msg["pipeline_run_id"]

    if pipeline_id not in pipeline_data.pipeline_debug:
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_FOUND,
            f"pipeline_id {pipeline_id} not found",
        )
        return

    pipeline_debug = pipeline_data.pipeline_debug[pipeline_id]

    if pipeline_run_id not in pipeline_debug:
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_FOUND,
            f"pipeline_run_id {pipeline_run_id} not found",
        )
        return

    connection.send_result(
        msg["id"],
        {"events": pipeline_debug[pipeline_run_id].events},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "assist_pipeline/language/list",
    }
)
@callback
def websocket_list_languages(
    hass: HomeAssistant,
    connection: websocket_api.connection.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List languages which are supported by a complete pipeline.

    This will return a list of languages which are supported by at least one stt, tts
    and conversation engine respectively.
    """
    # Retrieve the sets of language tags supported by each component
    conv_language_tags = conversation.async_get_conversation_languages(hass)
    stt_language_tags = stt.async_get_speech_to_text_languages(hass)
    tts_language_tags = tts.async_get_text_to_speech_languages(hass)

    # Convert each collection of tags into a set of base language codes.
    # For conversation languages, ignore a wildcard (MATCH_ALL) meaning all
    # languages are supported.
    conv_languages = _language_set_from_tags(conv_language_tags, ignore_match_all=True)
    stt_languages = _language_set_from_tags(stt_language_tags)
    tts_languages = _language_set_from_tags(tts_language_tags)

    # Compute the intersection of all non-empty language sets.  If any
    # component returns ``None`` (meaning unsupported or wildcard), it is
    # excluded from intersection.  The final intersection contains only
    # languages supported by at least one provider in each category.
    pipeline_languages: set[str] | None = None
    for language_set in (conv_languages, stt_languages, tts_languages):
        if not language_set:
            continue
        if pipeline_languages is None:
            pipeline_languages = set(language_set)
        else:
            pipeline_languages = language_util.intersect(
                pipeline_languages, language_set
            )

    connection.send_result(
        msg["id"],
        {
            "languages": (
                sorted(pipeline_languages) if pipeline_languages else pipeline_languages
            )
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "assist_pipeline/device/capture",
        vol.Required("device_id"): str,
        vol.Required("timeout"): vol.All(
            # 0 < timeout <= MAX_CAPTURE_TIMEOUT
            vol.Coerce(float),
            vol.Range(min=0, min_included=False, max=MAX_CAPTURE_TIMEOUT),
        ),
    }
)
@websocket_api.async_response
async def websocket_device_capture(
    hass: HomeAssistant,
    connection: websocket_api.connection.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Capture raw audio from a satellite device and forward to client."""
    pipeline_data = hass.data[KEY_ASSIST_PIPELINE]
    device_id = msg["device_id"]

    # Number of seconds to record audio in wall clock time
    timeout_seconds = msg["timeout"]

    # We don't know the chunk size, so the upper bound is calculated assuming a
    # single sample (16 bits) per queue item.
    max_queue_items = (
        # +1 for None to signal end
        int(math.ceil(timeout_seconds * CAPTURE_RATE)) + 1
    )

    audio_queue = DeviceAudioQueue(queue=asyncio.Queue(maxsize=max_queue_items))

    # Running simultaneous captures for a single device will not work by design.
    # The new capture will cause the old capture to stop.
    if (
        old_audio_queue := pipeline_data.device_audio_queues.pop(device_id, None)
    ) is not None:
        with contextlib.suppress(asyncio.QueueFull):
            # Signal other websocket command that we're taking over
            old_audio_queue.queue.put_nowait(None)

    # Only one client can be capturing audio at a time
    pipeline_data.device_audio_queues[device_id] = audio_queue

    def clean_up_queue() -> None:
        # Clean up our audio queue
        maybe_audio_queue = pipeline_data.device_audio_queues.get(device_id)
        if (maybe_audio_queue is not None) and (maybe_audio_queue.id == audio_queue.id):
            # Only pop if this is our queue
            pipeline_data.device_audio_queues.pop(device_id)

    # Unsubscribe cleans up queue
    connection.subscriptions[msg["id"]] = clean_up_queue

    # Audio will follow as events
    connection.send_result(msg["id"])

    # Record to logbook
    hass.bus.async_fire(
        EVENT_RECORDING,
        {
            ATTR_DEVICE_ID: device_id,
            ATTR_SECONDS: timeout_seconds,
        },
    )

    try:
        with contextlib.suppress(TimeoutError):
            async with asyncio.timeout(timeout_seconds):
                while True:
                    # Send audio chunks encoded as base64
                    audio_bytes = await audio_queue.queue.get()
                    if audio_bytes is None:
                        # Signal to stop
                        break

                    connection.send_event(
                        msg["id"],
                        {
                            "type": "audio",
                            "rate": CAPTURE_RATE,  # hertz
                            "width": CAPTURE_WIDTH,  # bytes
                            "channels": CAPTURE_CHANNELS,
                            "audio": base64.b64encode(audio_bytes).decode("ascii"),
                        },
                    )

        # Capture has ended
        connection.send_event(
            msg["id"], {"type": "end", "overflow": audio_queue.overflow}
        )
    finally:
        clean_up_queue()
