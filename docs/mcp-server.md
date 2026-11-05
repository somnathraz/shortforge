# Mythology Factory MCP server

The project exposes its existing provider and production logic as a local stdio MCP server. It does not create a second story pipeline and never returns API-key values.

## Tools

- `list_llm_providers` — configured status and model names for Gemini, OpenRouter, Groq, NVIDIA, OpenAI and Ollama.
- `suggest_mythology_topics` — structured Short ideas using a selected provider.
- `generate_story_draft` — runs the same editorial and budget gates as `npm run story`; preview-only unless `save` is true.
- `get_sfx_catalog` — all whitelisted SFX, available files and BGM tracks.
- `plan_episode_sfx` — runs the existing tone-safe Sound Director and writes an audio-plan sidecar.
- `list_brands`, `list_episodes`, `get_episode` — pipelines (EpicAstra / Tech Instagram) and their episode drafts, assets and approval state. All brand-aware tools take `brand` (any pipeline in `config/brands/`, see [custom-pipelines](custom-pipelines.md)).
- `get_script_template` — empty script JSON + field guide + editorial rules, so Claude can write a script that validates.
- `import_episode_script` — Claude-authored script JSON goes through the same schema/editorial/budget gates as the Desk import. `dryRun` defaults to true.
- `get_image_prompts` / `save_image_prompts` — read and edit the final scene prompts sent to the image model.
- `run_production_step` — runs `images` (Gemini / Pollinations), `tts:*`, `audio:*`, `render`/`produce`, `package` via the existing npm scripts. Honors the Desk approval gates, so script/voice/images must be approved in the Desk first.
- `check_connections` — tests Instagram / Facebook / YouTube connections per brand (no tokens returned).
- `publish_episode` — dry-run by default; a real post needs `dryRun=false` **and** `confirm=true`.
- `get_analytics` — views/likes/comments across YouTube, Instagram and Facebook for factory-published episodes.

Suggested flow: `get_script_template` → write the script → `import_episode_script` (dry run, fix issues, save) → approve in the Desk → `run_production_step` images → `produce` → `package` → `publish_episode` → `get_analytics`.

## Environment

Copy `.env.example` to `.env` and set only the providers you intend to use. Gemini text uses the same Google key already used by Gemini images and Veo:

```text
GOOGLE_AI_API_KEY=your-google-ai-studio-key
GOOGLE_TEXT_MODEL=gemini-3.8-flash
GOOGLE_TEXT_TIMEOUT_MS=120000
```

Other supported providers use `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, or `OPENAI_API_KEY`. Ollama remains local and requires `ollama serve` plus a pulled model.

## Run and connect

From the project directory:

```bash
npm install
npm run mcp
```

The server writes MCP protocol messages to stdout and diagnostics to stderr. The repo ships a project-level `.mcp.json`, so Claude Code (and other clients that read it) offer to connect when you open this folder. Codex desktop, CLI and the Codex IDE extension use `.codex/config.toml` once the project is trusted. Regular ChatGPT uses a separate plugin connection (see below). For other apps, the Desk's **Connect AI** button shows the exact config for your machine and can test it. The equivalent config, run from the project directory:

```json
{
  "mcpServers": {
    "mythology-factory": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/mythology-factory"
    }
  }
}
```

Keep `.env` local. The provider-status tool returns booleans and model names only, never credentials.

## ChatGPT web

ChatGPT web does not read Codex's TOML configuration. The ChatGPT desktop build using the Codex runtime supports the local Codex configuration. This server uses local stdio;
it cannot be added by pasting a localhost URL into ChatGPT.

Use [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
with this server's stdio launcher. The Desk's **Connect AI → ChatGPT web** tab generates
the command for this machine. Install the official `tunnel-client`, create a tunnel
associated with the target ChatGPT workspace, and configure `CONTROL_PLANE_API_KEY`
securely in the terminal. Keep the client running while connecting and using tools.
In [ChatGPT Plugins](https://chatgpt.com/plugins), add a custom MCP server, choose
**Connection: Tunnel**, select that tunnel, configure authentication, then create
and install the plugin. Select it with `@` in a chat and ask it to list pipelines.
Workspace permissions determine whether custom MCP connections are available.

Tool requests and results are shared with the selected AI service. Provider keys
stay in the local `.env`; the server never returns their values.

## Diagnose local connections

The Desk's **Test MCP server** checks initialization and tool discovery. A passing
check verifies the server, not registration in a particular AI app. Claude Desktop
needs an entry in its own `claude_desktop_config.json` and a restart; it does not
read this project's `.mcp.json`. Codex has its own TOML configuration. An LLM API
key is not required for discovery, listing pipelines or importing an AI-authored
script; provider-backed generation steps require their corresponding keys.

For Claude Desktop, preview an absolute launcher with `node scripts/mcp/configure-claude-desktop.mjs`; add it with `--apply`. The installer preserves other settings, backs up an existing config and verifies the saved entry. Restart Claude after applying.
