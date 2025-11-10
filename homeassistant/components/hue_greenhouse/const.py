"""Constants for Hue Greenhouse integration."""

DOMAIN = "hue_greenhouse"
HUE_DOMAIN = "hue"  # Quoting the original Hue integration

# Device types
DEVICE_TYPE_PLUG = "plug"
DEVICE_TYPE_LIGHT = "light"

# Attributes
ATTR_GREENHOUSE_ID = "greenhouse_id"
ATTR_DEVICE_TYPE = "device_type"
ATTR_WRAPPED_ENTITY = "wrapped_entity_id"
ATTR_DEVICES = "devices"
ATTR_DEVICE_COUNT = "device_count"

# Events
EVENT_GREENHOUSE_DEVICE_ADDED = f"{DOMAIN}_device_added"
EVENT_GREENHOUSE_DEVICE_REMOVED = f"{DOMAIN}_device_removed"

# Configuration
CONF_GREENHOUSE_NAME = "greenhouse_name"
CONF_GREENHOUSE_DEVICES = "devices"
