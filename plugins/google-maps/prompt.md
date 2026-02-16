## Google Maps Tool

You have access to Google Maps via the `google-maps_*` functions for spatial reasoning, place discovery, directions, and geocoding.

### Place Discovery
- `google-maps_places_search` — Search for places by text query (e.g. "coffee shops in Portland"). Best for general searches.
- `google-maps_places_nearby` — Find places near a specific lat/lng with optional type filter. Best when you already have coordinates.
- `google-maps_place_details` — Get full details (hours, phone, website, reviews) for a place using its `placeId` from search results.
- `google-maps_place_autocomplete` — Get predictions from partial input. Useful to disambiguate vague place names before calling `place_details`.

### Directions & Distance
- `google-maps_directions` — Get step-by-step directions between two points. Supports driving, walking, bicycling, and transit modes.
- `google-maps_distance_matrix` — Compare travel time/distance for multiple origin-destination pairs at once.

### Geocoding
- `google-maps_geocode` — Convert an address to lat/lng coordinates.
- `google-maps_reverse_geocode` — Convert lat/lng coordinates to a human-readable address.

### Tips
- Locations can be either address strings or `"latitude,longitude"` format.
- Travel modes: `driving` (default), `walking`, `bicycling`, `transit`.
- For transit directions, provide `departure_time` (ISO 8601 or `"now"`) for accurate scheduling.
- Chain functions: use `place_autocomplete` to resolve a vague name, then `place_details` for full info.
- Use `geocode` to get coordinates, then `places_nearby` with a type filter for "what's near X" queries.
- Use `distance_matrix` when comparing multiple options (e.g. "which of these 3 restaurants is closest?").
- Common place types: `restaurant`, `cafe`, `hospital`, `pharmacy`, `gas_station`, `park`, `gym`, `supermarket`, `bank`, `atm`.
