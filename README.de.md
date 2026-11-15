# Agent Tree

[English](README.md) · [日本語](README.ja.md)

Seitenleiste für Claude Code, die die Agenten einer Sitzung als lebenden Baum zeigt.

Fork von [MikeGT4/agent-tree](https://github.com/MikeGT4/agent-tree).

Den Berater umschalten, die Denkstufe der Hauptsitzung einstellen, laufende Unteragenten stoppen und korrigieren, ihr Modell und ihre Denkstufe wechseln, das Aussehen ändern, 5-Stunden- und Wochenlimit im Blick behalten.

<img src="https://github.com/MikeGT4/agent-tree/releases/download/v0.5.4/readme-agent-tree-4.gif" width="560" alt="Demo der Funktionen oben">

## Installation

Im Terminal:

```bash
claude plugin install agent-tree --marketplace KentaroFujii/agent-tree
```

Danach Claude Code starten, die Leiste öffnet sich.

In einer laufenden Sitzung: `/plugin install agent-tree --marketplace KentaroFujii/agent-tree`

Braucht Claude Code 2.1.292+, getestet mit 2.1.319.

## Codex-Läufe

Ruft ein Agent (oder die Hauptsitzung) die Codex-CLI über Claude Codes Bash-Werkzeug auf, mit `codex exec` oder `codex exec review`, zeigt der Baum den Lauf. Im Kasten des aufrufenden Agenten steht das Codex-Modell neben dem Claude-Modell (`+ ◇ <Modell>`), danach die Denkstufe, der Zustand (läuft, fertig, fehlgeschlagen, blockiert oder gestoppt), die verstrichene Zeit und die erste Zeile der Antwort. Ein Lauf der Hauptsitzung erscheint im Hauptkasten. Ein Druck auf die Zeile öffnet die Antwort (bis zu 24 Zeilen, in einer niedrigen Leiste 8).

Das Modell kommt aus `-m`, die Denkstufe aus `-c model_reasoning_effort=...`; fehlt eines, aus `~/.codex/config.toml` (`$CODEX_HOME`, falls gesetzt). Die Antwort kommt aus der mit `-o` angegebenen Datei, sonst aus stdout. Damit die Datei gelesen wird, `-o` als absoluten Pfad oder als Variable schreiben, die im selben Befehl gesetzt wird; ein Wert aus `$(mktemp -d)` ist nicht lesbar, die Antwort kommt dann aus stdout.

Agenten werden nur dort einzeilig gezeichnet, wo zwei Kästen nicht nebeneinander passen; in einer niedrigen Leiste bleiben es Kästen, und die Leiste scrollt.

## Was es ausführt

Einmal am Tag, in Sitzungen mit Bedienung, ruft es Claude Codes `plugin list --json` auf, liest seine Versionsnummer von raw.githubusercontent.com und startet bei einer neueren `plugin update agent-tree`. Sonst sendet es nichts ([PRIVACY.md](PRIVACY.md)).

Seine Hooks greifen nur, wenn du in der Leiste handelst; Tippen in der Eingabe beendet nur das Start-Intro.

[Anleitung](docs/GUIDE.de.md) · [PDF](https://github.com/MikeGT4/agent-tree/releases/download/v0.6.0/agent-tree-anleitung.pdf)

MIT, © 2026 Mike Pollow, Digitalroots
