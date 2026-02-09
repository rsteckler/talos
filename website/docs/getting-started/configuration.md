---
sidebar_position: 2
---

# Configuration

## Model Providers

Talos uses a BYOK (bring your own key) model. You need to configure at least one provider before chatting.

Supported provider types:

| Type        | Description                      |
|-------------|----------------------------------|
| `openai`    | OpenAI API (GPT models)          |
| `anthropic` | Anthropic API (Claude models)    |
| `google`    | Google AI (Gemini models)        |
| `openrouter`| OpenRouter (multi-provider hub)  |

### Adding a Provider

1. Open the web UI at http://localhost:5173
2. Navigate to **Settings** (gear icon in the sidebar)
3. Under **Model Providers**, click **Add Provider**
4. Enter a name, select the type, and paste your API key
5. The provider's default models are seeded automatically

### Setting the Active Model

After adding a provider, select the model to use for chat:

1. Click **Edit** on any provider row
2. Choose a model from the dropdown
3. Click **Set Active** — this model is now used for all new conversations

## SOUL.md (System Prompt)

The SOUL.md file defines Talos's personality and behavior. It's sent as the system prompt with every LLM request.

Edit it from **Settings → System Prompt (SOUL.md)** in the web UI, or directly at:

```
apps/server/data/SOUL.md
```

## Data Storage

Talos stores all data locally in `apps/server/data/`:

| File       | Purpose                          |
|------------|----------------------------------|
| `talos.db` | SQLite database (conversations, providers, tasks, logs) |
| `SOUL.md`  | System prompt                    |

This directory is gitignored except for a `.gitkeep` file.

## Environment

Talos runs entirely locally with no external services required beyond your chosen LLM provider. No environment variables are needed for basic operation.
