# Config

Config is stored at userData/config.json.

Defaults:
- updateChannel: stable
- logLevel: info

## MCP Driver Overrides
- XHS_MCP_DRIVER=local|legacy|mock controls runtime driver selection (default: legacy).
- local mode requires xhs-mcp dist to be built in-repo.
- legacy mode requires XHS_MCP_ENDPOINT.
