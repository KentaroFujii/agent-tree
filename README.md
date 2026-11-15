# Agent Tree

[Deutsch](README.de.md)

A side pane for Claude Code that shows a session's agents as a live tree.

Toggle the advisor, set the main session's effort, stop and correct running sub-agents, switch their model and effort, change the look, watch 5-hour and weekly limits.

<img src="https://github.com/MikeGT4/agent-tree/releases/download/v0.5.4/readme-agent-tree-4.gif" width="560" alt="Demo of the functions above">

## Install

In your terminal:

```bash
claude plugin install agent-tree --marketplace MikeGT4/agent-tree
```

Then start Claude Code; the pane opens.

Inside a session: `/plugin install agent-tree --marketplace MikeGT4/agent-tree`

Needs Claude Code 2.1.292+, tested with 2.1.319.

## Codex runs

If an agent (or the main session) runs the Codex CLI through Claude Code's Bash tool, with `codex exec` or `codex exec review`, the tree shows it. In the box of the agent that called it, the Codex model appears next to the Claude model (`+ ◇ <model>`), followed by the reasoning effort, the state (running, done, failed, blocked or stopped), the elapsed time and the first line of the answer. A run from the main session appears in the main box. Press the line to open the answer (up to 24 lines, 8 in a low pane).

The model comes from `-m`, the effort from `-c model_reasoning_effort=...`; if either is missing, from `~/.codex/config.toml` (`$CODEX_HOME` if set). The answer comes from the file given with `-o`, otherwise from stdout. To read the file, write `-o` as an absolute path or as a variable set inside the same command; a value from `$(mktemp -d)` cannot be read, so the answer then comes from stdout.

Agents are drawn as one line each only where two boxes do not fit side by side; in a low pane they stay boxes and the pane scrolls.

## What it runs

Once a day, in interactive sessions, it runs Claude Code's `plugin list --json`, reads its version number from raw.githubusercontent.com and, if it is newer, runs `plugin update agent-tree`. It sends nothing else ([PRIVACY.md](PRIVACY.md)).

Its hooks act only after you act in the pane; typing in the prompt only ends the start intro.

[Guide](docs/GUIDE.md) · [PDF](https://github.com/MikeGT4/agent-tree/releases/download/v0.6.0/agent-tree-guide.pdf)

MIT, © 2026 Mike Pollow, Digitalroots
