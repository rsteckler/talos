## Settings

View and manage Talos application settings including model selection and log configuration.

### Functions

- `settings_list_providers` — List all configured AI providers (names, types, active status). API keys are never exposed.
- `settings_list_models` — List available models for a provider. Requires `providerId`.
- `settings_get_active_model` — Get the currently active model and its provider info.
- `settings_set_active_model` — Switch the active model. Requires `modelId` (the database ID, not the model name).
- `settings_get_log_config` — Get all per-area log levels, known log areas, and retention settings.
- `settings_set_log_level` — Set log levels for a specific area. Requires `area`. Optionally set `userLevel` and/or `devLevel`.
- `settings_set_log_retention` — Set log auto-prune retention. Requires `days` (1-365).

### Usage Notes

- To switch models, first call `settings_list_providers` to find the provider, then `settings_list_models` with the provider's ID to find the model's database ID, then `settings_set_active_model` with that ID.
- Log level values: `userLevel` accepts `silent`, `low`, `medium`, or `high`. `devLevel` accepts `silent`, `debug`, or `verbose`.
- When setting log levels, you can set just one of `userLevel` or `devLevel` without affecting the other.
- Known log areas include: server, ws, agent, db, tools, api, channels, scheduler, triggers, oauth, summary-gen, title-gen.
