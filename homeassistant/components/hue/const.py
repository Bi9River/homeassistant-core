"""Constants for the Hue component."""

from aiohue.v2.models.button import ButtonEvent
from aiohue.v2.models.relative_rotary import (
    RelativeRotaryAction,
    RelativeRotaryDirection,
)

DOMAIN = "hue"

CONF_IGNORE_AVAILABILITY = "ignore_availability"

CONF_SUBTYPE = "subtype"

ATTR_HUE_EVENT = "hue_event"
SERVICE_HUE_ACTIVATE_SCENE = "hue_activate_scene"
ATTR_GROUP_NAME = "group_name"
ATTR_SCENE_NAME = "scene_name"
ATTR_TRANSITION = "transition"
ATTR_DYNAMIC = "dynamic"


# V1 API SPECIFIC CONSTANTS ##################

GROUP_TYPE_LIGHT_GROUP = "LightGroup"
GROUP_TYPE_ROOM = "Room"
GROUP_TYPE_LUMINAIRE = "Luminaire"
GROUP_TYPE_LIGHT_SOURCE = "LightSource"
GROUP_TYPE_ZONE = "Zone"
GROUP_TYPE_ENTERTAINMENT = "Entertainment"

CONF_ALLOW_HUE_GROUPS = "allow_hue_groups"
DEFAULT_ALLOW_HUE_GROUPS = False

CONF_ALLOW_UNREACHABLE = "allow_unreachable"
DEFAULT_ALLOW_UNREACHABLE = False

# How long to wait to actually do the refresh after requesting it.
# We wait some time so if we control multiple lights, we batch requests.
REQUEST_REFRESH_DELAY = 0.3


# V2 API SPECIFIC CONSTANTS ##################

DEFAULT_BUTTON_EVENT_TYPES = (
    # I have never ever seen the `DOUBLE_SHORT_RELEASE` event so leave it out here
    ButtonEvent.INITIAL_PRESS,
    ButtonEvent.REPEAT,
    ButtonEvent.SHORT_RELEASE,
    ButtonEvent.LONG_PRESS,
    ButtonEvent.LONG_RELEASE,
)

DEFAULT_ROTARY_EVENT_TYPES = (RelativeRotaryAction.START, RelativeRotaryAction.REPEAT)
DEFAULT_ROTARY_EVENT_SUBTYPES = (
    RelativeRotaryDirection.CLOCK_WISE,
    RelativeRotaryDirection.COUNTER_CLOCK_WISE,
)

DEVICE_SPECIFIC_EVENT_TYPES = {
    # device specific overrides of specific supported button events
    "Hue tap switch": (ButtonEvent.INITIAL_PRESS,),
}

# GREENHOUSE MODE DEFINITIONS
# Growth mode: High brightness, cool white daylight for photosynthesis
# Rest mode: Low brightness, warm white for respiration and display
GREENHOUSE_SCENES = {
    "growth": {
        "brightness": 255,  # 100% brightness
        "color_temp_kelvin": 6500,  # Cool daylight
        "color_temp": 153,  # Mireds (1,000,000 / 6500)
    },
    "rest": {
        "brightness": 50,  # ~20% brightness
        "color_temp_kelvin": 2700,  # Warm white
        "color_temp": 370,  # Mireds (1,000,000 / 2700)
    },
}

CONF_GREENHOUSE_MODE = "greenhouse_mode"
SERVICE_SET_GREENHOUSE_SCENE = "set_greenhouse_scene"

# SMART WATERING DEFINITIONS (SEP-14)
CONF_WATERING_DURATION = "duration"
DEFAULT_WATERING_DURATION = 0.5  # Minutes (30 seconds)
SERVICE_ACTIVATE_WATERING = "activate_watering"
SERVICE_SET_WATERING_SCHEDULE = "set_watering_schedule"
ATTR_NEXT_WATERING = "next_watering_time"
ATTR_WATERING_ACTIVE = "watering_active"
ATTR_WATERING_HOUR = "hour"
ATTR_WATERING_MINUTE = "minute"

# Special flag passed to switch.turn_on to indicate this is a watering event
ATTR_HUE_WATERING_FLAG = "hue_watering_trigger"
