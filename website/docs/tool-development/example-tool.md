---
sidebar_position: 5
---

# Example: Building a Weather Tool

This tutorial walks through creating a complete tool from scratch.

## 1. Create the Directory

```bash
mkdir tools/weather
```

## 2. Write the Manifest

Create `tools/weather/manifest.json`:

```json
{
  "id": "weather",
  "name": "Weather",
  "description": "Get current weather information for a location.",
  "version": "1.0.0",
  "credentials": [
    {
      "name": "api_key",
      "label": "Weather API Key",
      "description": "API key from your weather service provider",
      "required": true
    }
  ],
  "functions": [
    {
      "name": "get_current",
      "description": "Get the current weather for a city or location.",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City name or coordinates (e.g., 'London' or '51.5,-0.1')"
          },
          "units": {
            "type": "string",
            "enum": ["metric", "imperial"],
            "description": "Temperature units. Defaults to metric."
          }
        },
        "required": ["location"]
      }
    }
  ]
}
```

## 3. Write the Handler

Create `tools/weather/index.ts`:

```typescript
import type { ToolContext } from "@talos/server/tools";

export async function get_current(
  args: { location: string; units?: string },
  context: ToolContext
): Promise<string> {
  const apiKey = context.config["api_key"];
  if (!apiKey) {
    throw new Error("Weather API key not configured.");
  }

  const units = args.units ?? "metric";
  const url = `https://api.weather-service.com/current?q=${encodeURIComponent(args.location)}&units=${units}&appid=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return JSON.stringify({
    location: data.name,
    temperature: data.main.temp,
    units: units === "metric" ? "°C" : "°F",
    description: data.weather[0].description,
    humidity: data.main.humidity,
  });
}
```

## 4. Write the Prompt

Create `tools/weather/prompt.md`:

```markdown
# Weather Tool

You can look up current weather conditions for any location.

## When to Use
- When the user asks about current weather
- When weather information is relevant to their request

## Usage
- Pass a city name like "London" or "New York"
- Default units are metric (Celsius)
- Results include temperature, conditions, and humidity
```

## 5. Enable the Tool

1. Restart the server (tools are loaded on startup)
2. Go to **Settings → Tools**
3. Find "Weather" and toggle it on
4. Click **Configure** and enter your API key

## 6. Test It

Ask Talos: "What's the weather like in Tokyo?"

The LLM will call the `get_current` function and present the results.
