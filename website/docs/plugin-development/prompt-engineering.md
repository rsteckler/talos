---
sidebar_position: 4
---

# Prompt Engineering

The `prompt.md` file provides instructions to the LLM about how and when to use your plugin. This content is appended to the system prompt when the plugin is enabled.

## Purpose

While the manifest's function descriptions tell the LLM *what* the plugin does, `prompt.md` tells it *how* to use it effectively — when to call it, what patterns to follow, and what to avoid.

## Best Practices

### Be Specific About When to Use

```markdown
## When to Use
- Use the `search` function when the user asks a question about current events
- Use it when the user needs information that may be more recent than your training data

## When NOT to Use
- Do not search for information you already know well
- Do not make multiple searches when one well-crafted query suffices
```

### Provide Usage Patterns

```markdown
## Usage Patterns
- Start with a broad query, then narrow down if needed
- Prefer specific, factual queries over vague ones
- Include relevant context in the query (dates, names, etc.)
```

### Describe Output Format

```markdown
## Output Format
The search function returns a JSON array of results, each with:
- `title` — The page title
- `snippet` — A text excerpt
- `url` — The source URL

Cite your sources by including the URL when referencing search results.
```

### Set Boundaries

```markdown
## Limitations
- Maximum 5 results per search
- Rate limited to 10 searches per minute
- Only searches public web content
```

## Example: Web Search prompt.md

```markdown
# Web Search Tool

You have access to web search. Use it to find current information.

## Guidelines
- Search when the user asks about recent events, current data, or topics
  that may have changed since your training cutoff
- Craft specific, targeted queries
- Summarize findings and cite sources with URLs
- If the first search doesn't find what you need, refine your query

## Do Not
- Search for basic knowledge you already have
- Make excessive searches — one or two well-crafted queries usually suffice
```

## Length

Keep prompt.md concise. The content is included in every LLM request when the plugin is enabled, so shorter is better for token efficiency. Aim for 100-300 words.
