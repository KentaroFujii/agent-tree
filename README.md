# Agent Tree

[Deutsch](README.de.md) · [日本語](README.ja.md)

A side pane for Claude Code that shows a session's agents as a live tree.

Fork of [MikeGT4/agent-tree](https://github.com/MikeGT4/agent-tree).

Toggle the advisor, set the main session's effort, stop and correct running sub-agents, switch their model and effort, change the look, watch 5-hour and weekly limits.

Sub-agents that call sub-agents are drawn in a second row under their parent.

<img src="https://github.com/MikeGT4/agent-tree/releases/download/v0.5.4/readme-agent-tree-4.gif" width="560" alt="Demo of the functions above">

## Install

In your terminal:

```bash
claude plugin install agent-tree --marketplace KentaroFujii/agent-tree
```

Then start Claude Code; the pane opens.

Inside a session: `/plugin install agent-tree --marketplace KentaroFujii/agent-tree`

Needs Claude Code 2.1.292+, as upstream does. Upstream tested 2.1.319; this fork has not recorded a tested version.

## Codex runs

If an agent (or the main session) runs the Codex CLI through Claude Code's Bash tool, with `codex exec` or `codex exec review`, the tree shows it. In the box of the agent that called it, the Codex model appears next to the Claude model (`+ ◇ <model>`), followed by its reasoning effort (`+ ◇ gpt-6.1-sol xhigh`; the model alone where the effort does not fit). The box's effort bar then shows the Codex effort, and the Claude effort moves to the model line (`Sonnet 5.5 low`). Each run shows a state mark and the elapsed time, and under it the first line of the answer. Only `blocked` is written as a word; running, done, failed and stopped are words in the opened answer and in the one-line view. A run's own line names the effort only if the caller's runs did not all go equally deep, or in a nested box, whose bar names the parent. A run from the main session appears in the main box. Press the line to open the answer (up to 24 lines, 8 in a low pane).

The model comes from `-m`, the effort from `-c model_reasoning_effort=...`; if either is missing, from `~/.codex/config.toml` (`$CODEX_HOME` if set). The answer comes from the file given with `-o`, otherwise from stdout. The file is read if `-o` is an absolute path, starts with `~/`, `$HOME` or `$TMPDIR`, is a variable set inside the same command, or is a relative path after a `cd` to an absolute path in the same command. A value from `$(mktemp -d)` cannot be read, so the answer then comes from stdout.

Agents are drawn as one line each only where two boxes do not fit side by side. A box is 23 columns wide, so this happens in a pane narrower than 49 columns. In a low pane they stay boxes and the pane scrolls.

## What it runs

Auto-update is off by default. If you turn it on, it does the following once a day, in interactive sessions: it runs Claude Code's `plugin list --json`, reads its version number from raw.githubusercontent.com and, if it is newer, runs `plugin update agent-tree`. It sends nothing else ([PRIVACY.md](PRIVACY.md)).

Its hooks act only after you act in the pane; typing in the prompt only ends the start intro.

[Guide](docs/GUIDE.md) · [PDF](https://github.com/MikeGT4/agent-tree/releases/download/v0.6.0/agent-tree-guide.pdf)

MIT, © 2026 Mike Pollow, Digitalroots
