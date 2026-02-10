import {
  Client,
  TravelMode,
  PlaceInputType,
} from "@googlemaps/google-maps-services-js";

function getClient(): Client {
  return new Client({});
}

function getKey(credentials?: Record<string, string>): string {
  const key = credentials?.["api_key"];
  if (!key) {
    throw new Error("Google Maps API key is not configured.");
  }
  return key;
}

function parseLatLng(location: string): { lat: number; lng: number } {
  const [lat, lng] = location.split(",").map(Number);
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    throw new Error(`Invalid location format: "${location}". Expected "latitude,longitude".`);
  }
  return { lat, lng };
}

// --- Places Search ---

async function places_search(
  args: Record<string, unknown>,
  credentials?: Record<string, string>,
): Promise<unknown> {
  const key = getKey(credentials);
  const client = getClient();
  const query = args["query"] as string;
  const location = args["location"] as string | undefined;
  const radius = (args["radius"] as number | undefined) ?? 5000;
  const type = args["type"] as string | undefined;

  try {
    const res = await client.textSearch({
      params: {
        query,
        key,
        ...(location ? { location: parseLatLng(location) } : {}),
        radius,
        ...(type ? { type } : {}),
      },
    });

    const places = (res.data.results ?? []).slice(0, 10).map((p) => ({
      placeId: p.place_id,
      name: p.name,
      address: p.formatted_address,
      location: p.geometry?.location,
      rating: p.rating,
      userRatingsTotal: p.user_ratings_total,
      types: p.types,
      openNow: p.opening_hours?.open_now,
      priceLevel: p.price_level,
    }));

    return { results: places };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Places search failed" };
  }
}

// --- Place Details ---

async function place_details(
  args: Record<string, unknown>,
  credentials?: Record<string, string>,
): Promise<unknown> {
  const key = getKey(credentials);
  const client = getClient();
  const placeId = args["placeId"] as string;

  try {
    const res = await client.placeDetails({
      params: {
        place_id: placeId,
        key,
        fields: [
          "name",
          "formatted_address",
          "formatted_phone_number",
          "website",
          "rating",
          "user_ratings_total",
          "opening_hours",
          "geometry",
          "types",
          "price_level",
          "reviews",
          "url",
        ],
      },
    });

    const p = res.data.result;
    return {
      name: p.name,
      address: p.formatted_address,
      phone: p.formatted_phone_number,
      website: p.website,
      mapsUrl: p.url,
      location: p.geometry?.location,
      rating: p.rating,
      userRatingsTotal: p.user_ratings_total,
      priceLevel: p.price_level,
      types: p.types,
      hours: p.opening_hours?.weekday_text,
      openNow: p.opening_hours?.open_now,
      reviews: (p.reviews ?? []).slice(0, 3).map((r) => ({
        author: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.relative_time_description,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Place details lookup failed" };
  }
}

// --- Places Nearby ---

async function places_nearby(
  args: Record<string, unknown>,
  credentials?: Record<string, string>,
): Promise<unknown> {
  const key = getKey(credentials);
  const client = getClient();
  const location = parseLatLng(args["location"] as string);
  const radius = (args["radius"] as number | undefined) ?? 1500;
  const type = args["type"] as string | undefined;
  const keyword = args["keyword"] as string | undefined;

  try {
    const res = await client.placesNearby({
      params: {
        location,
        radius,
        key,
        ...(type ? { type } : {}),
        ...(keyword ? { keyword } : {}),
      },
    });

    const places = (res.data.results ?? []).slice(0, 10).map((p) => ({
      placeId: p.place_id,
      name: p.name,
      address: p.vicinity,
      location: p.geometry?.location,
      rating: p.rating,
      userRatingsTotal: p.user_ratings_total,
      types: p.types,
      openNow: p.opening_hours?.open_now,
    }));

    return { results: places };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Nearby places search failed" };
  }
}

// --- Directions ---

async function directions(
  args: Record<string, unknown>,
  credentials?: Record<string, string>,
): Promise<unknown> {
  const key = getKey(credentials);
  const client = getClient();
  const origin = args["origin"] as string;
  const destination = args["destination"] as string;
  const mode = (args["mode"] as string | undefined) ?? "driving";
  const departureTime = args["departure_time"] as string | undefined;
  const alternatives = (args["alternatives"] as boolean | undefined) ?? false;

  const travelMode = mode.toUpperCase() as TravelMode;

  try {
    const res = await client.directions({
      params: {
        origin,
        destination,
        mode: travelMode,
        alternatives,
        key,
        ...(departureTime
          ? {
              departure_time:
                departureTime === "now" ? "now" as const : new Date(departureTime),
            }
          : {}),
      },
    });

    const routes = (res.data.routes ?? []).map((route) => {
      const leg = route.legs[0];
      if (!leg) return null;
      return {
        summary: route.summary,
        distance: leg.distance?.text,
        duration: leg.duration?.text,
        durationInTraffic: leg.duration_in_traffic?.text,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        steps: leg.steps.map((s) => ({
          instruction: s.html_instructions?.replace(/<[^>]*>/g, ""),
          distance: s.distance?.text,
          duration: s.duration?.text,
          travelMode: s.travel_mode,
        })),
      };
    }).filter(Boolean);

    return { routes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Directions request failed" };
  }
}

// --- Distance Matrix ---

async function distance_matrix(
  args: Record<string, unknown>,
  credentials?: Record<string, string>,
): Promise<unknown> {
  const key = getKey(credentials);
  const client = getClient();
  const origins = args["origins"] as string[];
  const destinations = args["destinations"] as string[];
  const mode = (args["mode"] as string | undefined) ?? "driving";

  const travelMode = mode.toUpperCase() as TravelMode;

  try {
    const res = await client.distancematrix({
      params: {
        origins,
        destinations,
        mode: travelMode,
        key,
      },
    });

    const rows = res.data.rows.map((row, i) => ({
      origin: res.data.origin_addresses[i],
      destinations: row.elements.map((el, j) => ({
        destination: res.data.destination_addresses[j],
        distance: el.distance?.text,
        duration: el.duration?.text,
        status: el.status,
      })),
    }));

    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Distance matrix request failed" };
  }
}

// --- Geocode ---

async function geocode(
  args: Record<string, unknown>,
  credentials?: Record<string, string>,
): Promise<unknown> {
  const key = getKey(credentials);
  const client = getClient();
  const address = args["address"] as string;

  try {
    const res = await client.geocode({
      params: { address, key },
    });

    const results = (res.data.results ?? []).slice(0, 3).map((r) => ({
      formattedAddress: r.formatted_address,
      location: r.geometry.location,
      placeId: r.place_id,
      types: r.types,
    }));

    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Geocoding failed" };
  }
}

// --- Reverse Geocode ---

async function reverse_geocode(
  args: Record<string, unknown>,
  credentials?: Record<string, string>,
): Promise<unknown> {
  const key = getKey(credentials);
  const client = getClient();
  const latitude = args["latitude"] as number;
  const longitude = args["longitude"] as number;

  try {
    const res = await client.reverseGeocode({
      params: {
        latlng: { lat: latitude, lng: longitude },
        key,
      },
    });

    const results = (res.data.results ?? []).slice(0, 3).map((r) => ({
      formattedAddress: r.formatted_address,
      placeId: r.place_id,
      types: r.types,
    }));

    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Reverse geocoding failed" };
  }
}

// --- Place Autocomplete ---

async function place_autocomplete(
  args: Record<string, unknown>,
  credentials?: Record<string, string>,
): Promise<unknown> {
  const key = getKey(credentials);
  const client = getClient();
  const input = args["input"] as string;
  const location = args["location"] as string | undefined;
  const radius = args["radius"] as number | undefined;

  try {
    const res = await client.placeAutocomplete({
      params: {
        input,
        key,
        ...(location ? { location: parseLatLng(location) } : {}),
        ...(radius ? { radius } : {}),
      },
    });

    const predictions = (res.data.predictions ?? []).slice(0, 5).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      types: p.types,
    }));

    return { predictions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Place autocomplete failed" };
  }
}

export const handlers = {
  places_search,
  place_details,
  places_nearby,
  directions,
  distance_matrix,
  geocode,
  reverse_geocode,
  place_autocomplete,
};
