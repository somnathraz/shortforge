# Security

This is a self-hosted tool that holds your API keys and social-account tokens, so please report problems privately.

**Report a vulnerability:** open a private security advisory on the GitHub repository (Security → Report a vulnerability), or email the maintainer listed on the repository profile. Please do not file public issues for security bugs.

**If you accidentally committed a secret:** revoke it at the provider first (Google AI Studio, Runway, ElevenLabs, Meta, Google Cloud), then remove it from history. Deleting the commit is not enough.

**Scope notes**
- The Desk is meant to run on `127.0.0.1`. Exposing it to a network or the internet is unsupported unless you add your own HTTPS and access control, and set `DESK_ALLOWED_HOSTS`.
- The MCP server runs with the same keys as the Desk. Only connect AI apps you trust, and keep real publishing behind the explicit `confirm`.
