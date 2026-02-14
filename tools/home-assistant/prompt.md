## Home Assistant

Control and query a Home Assistant smart home instance. Requires a Home Assistant URL and long-lived access token.

### Search & Discovery

- `home-assistant_search_entities` — Search entities by name, domain, or area. Use `query` for text search, `domain` to filter (light, switch, sensor, etc.), `limit` to cap results.
- `home-assistant_get_state` — Get current state and attributes for a specific entity. Requires `entity_id`.
- `home-assistant_get_overview` — Get system overview with entity counts by domain. Use `detail_level`: minimal, standard (includes problem entities), or full (all entities).
- `home-assistant_list_services` — List available services. Use `domain` to filter.

### Device Control

- `home-assistant_call_service` — Call any HA service. Requires `domain` and `service`. Optionally pass `entity_id` and `data` for service parameters.
- `home-assistant_bulk_control` — Execute multiple service calls in sequence. Pass an `operations` array.

### History & Monitoring

- `home-assistant_get_history` — Get state history for an entity. Requires `entity_id`. Optionally set `start_time`/`end_time` (ISO 8601).
- `home-assistant_get_statistics` — Get long-term statistics (energy, temperature). Requires `statistic_ids` array. Optionally set `period` (5minute, hour, day, week, month).
- `home-assistant_get_logbook` — Get logbook entries. Optionally filter by `entity_id` and time range.

### Automation Config

- `home-assistant_get_automation` — List all automations or get a specific one by `automation_id`.
- `home-assistant_set_automation` — Create (omit `automation_id`) or update an automation. Pass `config` with trigger/condition/action.
- `home-assistant_remove_automation` — Delete an automation. Requires `automation_id`.
- `home-assistant_get_automation_traces` — Get execution traces for debugging. Optionally filter by `automation_id`.

### Script Config

- `home-assistant_get_script` — List all scripts or get a specific one by `script_id`.
- `home-assistant_set_script` — Create or update a script. Requires `script_id` and `config`.
- `home-assistant_remove_script` — Delete a script. Requires `script_id`.

### Area Management

- `home-assistant_list_areas` — List all configured areas (rooms/locations).
- `home-assistant_set_area` — Create (omit `area_id`) or update an area. Requires `name`.
- `home-assistant_remove_area` — Delete an area. Requires `area_id`.

### Floor Management

- `home-assistant_list_floors` — List all configured floors.
- `home-assistant_set_floor` — Create (omit `floor_id`) or update a floor. Requires `name`.
- `home-assistant_remove_floor` — Delete a floor. Requires `floor_id`.

### Zone Management

- `home-assistant_list_zones` — List all zones (geographic areas for presence detection).
- `home-assistant_set_zone` — Create (omit `zone_id`) or update a zone. Requires `name`, `latitude`, `longitude`.
- `home-assistant_remove_zone` — Delete a zone. Requires `zone_id`.

### Group Management

- `home-assistant_list_groups` — List all groups and their member entities.
- `home-assistant_set_group` — Create or update a group. Requires `name`, `entity_id`, `entities` array.
- `home-assistant_remove_group` — Remove a group. Requires `entity_id`.

### Label Management

- `home-assistant_list_labels` — List all labels.
- `home-assistant_set_label` — Create (omit `label_id`) or update a label. Requires `name`.
- `home-assistant_remove_label` — Delete a label. Requires `label_id`.

### Entity & Device Registry

- `home-assistant_get_entity` — Get entity registry info (area, labels, config). Requires `entity_id`.
- `home-assistant_set_entity` — Update entity registry (name, icon, area, labels). Requires `entity_id`.
- `home-assistant_list_devices` — List all registered devices.
- `home-assistant_get_device` — Get device details. Requires `device_id`.
- `home-assistant_update_device` — Update device settings (name, area). Requires `device_id`.

### Helper Config

- `home-assistant_list_helpers` — List all input helpers (input_boolean, input_number, etc.).
- `home-assistant_set_helper` — Create a helper. Requires `helper_type` and `config`.
- `home-assistant_remove_helper` — Remove a helper. Requires `entity_id`.

### Dashboard Config

- `home-assistant_list_dashboards` — List all Lovelace dashboards.
- `home-assistant_get_dashboard` — Get dashboard config. Use `url_path` for non-default dashboards.
- `home-assistant_set_dashboard` — Save dashboard config. Requires `config`.
- `home-assistant_delete_dashboard` — Delete a dashboard. Requires `dashboard_id`.
- `home-assistant_list_dashboard_resources` — List custom dashboard resources.
- `home-assistant_set_dashboard_resource` — Create/update a resource. Requires `url` and `res_type`.

### Calendar

- `home-assistant_get_calendar_events` — Get calendar events. Requires `entity_id`.
- `home-assistant_create_calendar_event` — Create an event. Requires `entity_id`, `summary`, `start_date_time`, `end_date_time`.
- `home-assistant_delete_calendar_event` — Delete an event. Requires `entity_id` and `uid`.

### Todo

- `home-assistant_get_todo_items` — Get items from a todo list. Requires `entity_id`.
- `home-assistant_add_todo_item` — Add a todo item. Requires `entity_id` and `item`.
- `home-assistant_update_todo_item` — Update a todo item. Requires `entity_id` and `item`. Set `rename`, `status`, or `due_date`.
- `home-assistant_remove_todo_item` — Remove a todo item. Requires `entity_id` and `item`.

### System Management

- `home-assistant_check_config` — Validate HA configuration files.
- `home-assistant_restart` — Restart HA. Requires `confirm: true`.
- `home-assistant_reload` — Reload a domain: automations, scripts, scenes, groups, core, themes, or all.
- `home-assistant_get_system_health` — Get system health info (versions, resources, integrations).
- `home-assistant_get_updates` — Get available updates for HA core, OS, and integrations.

### Integrations

- `home-assistant_list_integrations` — List config entries. Optionally filter by `domain`.
- `home-assistant_delete_integration` — Remove an integration. Requires `entry_id`.
- `home-assistant_set_integration_enabled` — Enable/disable an integration. Requires `entry_id` and `disabled_by` (null or "user").

### Templates, Camera & Blueprints

- `home-assistant_render_template` — Render a Jinja2 template. Requires `template` string.
- `home-assistant_get_camera_image` — Get a camera snapshot as base64. Requires `entity_id`.
- `home-assistant_list_blueprints` — List blueprints. Requires `domain` (automation or script).
- `home-assistant_import_blueprint` — Import a blueprint from URL. Requires `url`.

### Other

- `home-assistant_list_addons` — List installed add-ons (requires HA Supervisor).
- `home-assistant_get_error_log` — Get the HA error log.

### Usage Tips

- Entity IDs follow the format `domain.object_id` (e.g. `light.living_room`, `sensor.outside_temperature`).
- To control a device: first use `search_entities` to find the entity_id, then `call_service` with the appropriate domain/service.
- Common services: `light.turn_on`, `light.turn_off`, `switch.toggle`, `climate.set_temperature`, `media_player.media_play`.
- Service data varies by domain. Use `list_services` to discover available parameters.
- For automations, the `config` object should include `trigger`, `condition` (optional), and `action` arrays.
- Time parameters accept ISO 8601 format (e.g. `2024-01-15T10:00:00Z`).
- Use `get_overview` first to understand what's available before making specific queries.
