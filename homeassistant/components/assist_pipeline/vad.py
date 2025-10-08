"""Voice activity detection."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from enum import StrEnum
import logging

from .const import SAMPLE_CHANNELS, SAMPLE_RATE, SAMPLE_WIDTH

_LOGGER = logging.getLogger(__name__)


class VadSensitivity(StrEnum):
    """How quickly the end of a voice command is detected."""

    DEFAULT = "default"
    RELAXED = "relaxed"
    AGGRESSIVE = "aggressive"

    @staticmethod
    def to_seconds(sensitivity: VadSensitivity | str) -> float:
        """Return seconds of silence for sensitivity level."""
        sensitivity = VadSensitivity(sensitivity)
        if sensitivity == VadSensitivity.RELAXED:
            return 1.25

        if sensitivity == VadSensitivity.AGGRESSIVE:
            return 0.25

        return 0.7


class AudioBuffer:
    """Fixed-sized audio buffer with variable internal length."""

    def __init__(self, maxlen: int) -> None:
        """Initialize buffer."""
        self._buffer = bytearray(maxlen)
        self._length = 0

    @property
    def length(self) -> int:
        """Get number of bytes currently in the buffer."""
        return self._length

    def clear(self) -> None:
        """Clear the buffer."""
        self._length = 0

    def append(self, data: bytes) -> None:
        """Append bytes to the buffer, increasing the internal length."""
        data_len = len(data)
        if (self._length + data_len) > len(self._buffer):
            raise ValueError("Length cannot be greater than buffer size")

        self._buffer[self._length : self._length + data_len] = data
        self._length += data_len

    def bytes(self) -> bytes:
        """Convert written portion of buffer to bytes."""
        return bytes(self._buffer[: self._length])

    def __len__(self) -> int:
        """Get the number of bytes currently in the buffer."""
        return self._length

    def __bool__(self) -> bool:
        """Return True if there are bytes in the buffer."""
        return self._length > 0


@dataclass
class VoiceCommandSegmenter:
    """Segments an audio stream into voice commands."""

    speech_seconds: float = 0.3
    """Seconds of speech before voice command has started."""

    command_seconds: float = 1.0
    """Minimum number of seconds for a voice command."""

    silence_seconds: float = 0.7
    """Seconds of silence after voice command has ended."""

    timeout_seconds: float = 15.0
    """Maximum number of seconds before stopping with timeout=True."""

    reset_seconds: float = 1.0
    """Seconds before reset start/stop time counters."""

    in_command: bool = False
    """True if inside voice command."""

    timed_out: bool = False
    """True a timeout occurred during voice command."""

    before_command_speech_threshold: float = 0.2
    """Probability threshold for speech before voice command."""

    in_command_speech_threshold: float = 0.5
    """Probability threshold for speech during voice command."""

    _speech_seconds_left: float = 0.0
    """Seconds left before considering voice command as started."""

    _command_seconds_left: float = 0.0
    """Seconds left before voice command could stop."""

    _silence_seconds_left: float = 0.0
    """Seconds left before considering voice command as stopped."""

    _timeout_seconds_left: float = 0.0
    """Seconds left before considering voice command timed out."""

    _reset_seconds_left: float = 0.0
    """Seconds left before resetting start/stop time counters."""

    def __post_init__(self) -> None:
        """Reset after initialization."""
        self.reset()

    def reset(self) -> None:
        """Reset all counters and state."""
        self._speech_seconds_left = self.speech_seconds
        self._command_seconds_left = self.command_seconds - self.speech_seconds
        self._silence_seconds_left = self.silence_seconds
        self._timeout_seconds_left = self.timeout_seconds
        self._reset_seconds_left = self.reset_seconds
        self.in_command = False

    def process(self, chunk_seconds: float, speech_probability: float | None) -> bool:
        """Process samples using external VAD.

        This method acts as the public entry point for voice command
        segmentation.  It delegates detailed state handling to helper
        methods to reduce complexity while maintaining the original
        behaviour.  Returns ``False`` when the current voice command
        finishes or times out, and ``True`` otherwise.
        """
        # If a timeout was previously triggered, clear it so that
        # subsequent calls behave normally.  ``timed_out`` is used
        # externally to detect the timeout state.
        if self.timed_out:
            self.timed_out = False

        # Update timeout and check if we should abort due to an overall
        # inactivity timeout.  ``_update_timeout`` will reset state and
        # mark the instance as timed out when needed.
        if not self._update_timeout(chunk_seconds):
            return False

        # Normalise ``None`` speech values to ``0.0`` so that threshold
        # comparisons work consistently.
        speech_prob = 0.0 if speech_probability is None else speech_probability

        # Delegate processing based on whether we are currently inside a
        # voice command or still waiting for one to start.
        if self.in_command:
            return self._handle_in_command(chunk_seconds, speech_prob)
        return self._handle_before_command(chunk_seconds, speech_prob)

    def _update_timeout(self, chunk_seconds: float) -> bool:
        """Update timeout counters and return False if a timeout occurs.

        This helper centralises timeout handling and logging.  When the
        total allowed duration is exceeded the segmenter is reset and
        marked as timed out.
        """
        self._timeout_seconds_left -= chunk_seconds
        if self._timeout_seconds_left > 0:
            return True
        _LOGGER.debug(
            "VAD end of speech detection timed out after %s seconds",
            self.timeout_seconds,
        )
        self.reset()
        self.timed_out = True
        return False

    def _handle_before_command(self, chunk_seconds: float, speech_prob: float) -> bool:
        """Handle processing before a voice command has started.

        Returns ``True`` to continue processing.  State transitions to
        "in command" mode when enough speech has been detected.
        """
        is_speech = speech_prob > self.before_command_speech_threshold
        if is_speech:
            # Speech detected before command start: decrement the
            # pre-command speech counter.
            self._reset_seconds_left = self.reset_seconds
            self._speech_seconds_left -= chunk_seconds
            if self._speech_seconds_left <= 0:
                # Enter voice command state.
                self.in_command = True
                self._command_seconds_left = self.command_seconds - self.speech_seconds
                self._silence_seconds_left = self.silence_seconds
                _LOGGER.debug("Voice command started")
        else:
            # Silence detected: decrement reset counter and restore
            # counters if we've been quiet long enough.
            self._reset_seconds_left -= chunk_seconds
            if self._reset_seconds_left <= 0:
                self._speech_seconds_left = self.speech_seconds
                self._reset_seconds_left = self.reset_seconds
        return True

    def _handle_in_command(self, chunk_seconds: float, speech_prob: float) -> bool:
        """Handle processing while inside a voice command.

        Returns ``False`` when the command has ended, otherwise ``True``.
        """
        is_speech = speech_prob > self.in_command_speech_threshold
        if not is_speech:
            # Silence within a command: update counters and check for end.
            self._reset_seconds_left = self.reset_seconds
            self._silence_seconds_left -= chunk_seconds
            self._command_seconds_left -= chunk_seconds
            # Command finishes only if both the silence and minimum
            # command duration counters have expired.
            if self._silence_seconds_left <= 0 and self._command_seconds_left <= 0:
                self.reset()
                _LOGGER.debug("Voice command finished")
                return False
        else:
            # Speech within a command: decrement counters and reset
            # silence duration when enough speech has been detected.
            self._reset_seconds_left -= chunk_seconds
            self._command_seconds_left -= chunk_seconds
            if self._reset_seconds_left <= 0:
                self._silence_seconds_left = self.silence_seconds
                self._reset_seconds_left = self.reset_seconds
        return True

    def process_with_vad(
        self,
        chunk: bytes,
        vad_samples_per_chunk: int | None,
        vad_is_speech: Callable[[bytes], bool],
        leftover_chunk_buffer: AudioBuffer | None,
    ) -> bool:
        """Process an audio chunk using an external VAD.

        A buffer is required if the VAD requires fixed-sized audio chunks (usually the case).

        Returns False when voice command is finished.
        """
        if vad_samples_per_chunk is None:
            # No chunking
            chunk_seconds = (
                len(chunk) // (SAMPLE_WIDTH * SAMPLE_CHANNELS)
            ) / SAMPLE_RATE
            is_speech = vad_is_speech(chunk)
            return self.process(chunk_seconds, is_speech)

        if leftover_chunk_buffer is None:
            raise ValueError("leftover_chunk_buffer is required when vad uses chunking")

        # With chunking
        seconds_per_chunk = vad_samples_per_chunk / SAMPLE_RATE
        bytes_per_chunk = vad_samples_per_chunk * (SAMPLE_WIDTH * SAMPLE_CHANNELS)
        for vad_chunk in chunk_samples(chunk, bytes_per_chunk, leftover_chunk_buffer):
            is_speech = vad_is_speech(vad_chunk)
            if not self.process(seconds_per_chunk, is_speech):
                return False

        return True


@dataclass
class VoiceActivityTimeout:
    """Detects silence in audio until a timeout is reached."""

    silence_seconds: float
    """Seconds of silence before timeout."""

    reset_seconds: float = 0.5
    """Seconds of speech before resetting timeout."""

    speech_threshold: float = 0.5
    """Threshold for speech."""

    _silence_seconds_left: float = 0.0
    """Seconds left before considering voice command as stopped."""

    _reset_seconds_left: float = 0.0
    """Seconds left before resetting start/stop time counters."""

    def __post_init__(self) -> None:
        """Reset after initialization."""
        self.reset()

    def reset(self) -> None:
        """Reset all counters and state."""
        self._silence_seconds_left = self.silence_seconds
        self._reset_seconds_left = self.reset_seconds

    def process(self, chunk_seconds: float, speech_probability: float | None) -> bool:
        """Process samples using external VAD.

        Returns False when timeout is reached.
        """
        if speech_probability is None:
            speech_probability = 0.0

        if speech_probability > self.speech_threshold:
            # Speech
            self._reset_seconds_left -= chunk_seconds
            if self._reset_seconds_left <= 0:
                # Reset timeout
                self._silence_seconds_left = self.silence_seconds
        else:
            # Silence
            self._silence_seconds_left -= chunk_seconds
            if self._silence_seconds_left <= 0:
                # Timeout reached
                self.reset()
                return False

            # Slowly build reset counter back up
            self._reset_seconds_left = min(
                self.reset_seconds, self._reset_seconds_left + chunk_seconds
            )

        return True


def chunk_samples(
    samples: bytes,
    bytes_per_chunk: int,
    leftover_chunk_buffer: AudioBuffer,
) -> Iterable[bytes]:
    """Yield fixed-sized chunks from samples, keeping leftover bytes from previous call(s)."""

    if (len(leftover_chunk_buffer) + len(samples)) < bytes_per_chunk:
        # Extend leftover chunk, but not enough samples to complete it
        leftover_chunk_buffer.append(samples)
        return

    next_chunk_idx = 0

    if leftover_chunk_buffer:
        # Add to leftover chunk from previous call(s).
        bytes_to_copy = bytes_per_chunk - len(leftover_chunk_buffer)
        leftover_chunk_buffer.append(samples[:bytes_to_copy])
        next_chunk_idx = bytes_to_copy

        # Process full chunk in buffer
        yield leftover_chunk_buffer.bytes()
        leftover_chunk_buffer.clear()

    while next_chunk_idx < len(samples) - bytes_per_chunk + 1:
        # Process full chunk
        yield samples[next_chunk_idx : next_chunk_idx + bytes_per_chunk]
        next_chunk_idx += bytes_per_chunk

    # Capture leftover chunks
    if rest_samples := samples[next_chunk_idx:]:
        leftover_chunk_buffer.append(rest_samples)
