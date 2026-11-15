# Privacy

Agent Tree runs inside Claude Code and keeps the session's events in memory.

The update check is off by default. Only with the Auto-update option on, it runs Claude Code's `plugin list --json` for its version once a day, in interactive sessions, and reads the latest one from GitHub (raw.githubusercontent.com); the request carries nothing about you; GitHub sees your IP address.

With a newer version from a marketplace, it runs Claude Code's `plugin update agent-tree`.

Turning Auto-update off again stops this. DO_NOT_TRACK=1, DISABLE_AUTOUPDATER, DISABLE_UPDATES and Claude Code's switch for nonessential traffic also stop it, even with Auto-update on.

Claude Code's plugin storage keeps your look, the model and effort choices, the update state and whether it asked for a star. No telemetry, account or cookie.

## Hooks

They act only after you act in the pane: a model or effort pick, a stop, a message to an agent (noted in the transcript), the advisor button (`/advisor`). Typing in the prompt only ends the start intro, text unchanged.
