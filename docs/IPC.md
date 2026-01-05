# IPC Channels

## settings:get
Returns the current settings object stored in the local settings file.

## settings:set
Payload: object of partial settings to update.
Returns the merged settings after persistence.

## Availability
These channels are available via the Electron preload bridge as window.settings.
