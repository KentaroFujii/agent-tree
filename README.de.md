# Agent Tree

[English](README.md) · [日本語](README.ja.md)

Seitenleiste für Claude Code, die die Agenten einer Sitzung als lebenden Baum zeigt.

Fork von [MikeGT4/agent-tree](https://github.com/MikeGT4/agent-tree).

Den Berater umschalten, die Denkstufe der Hauptsitzung einstellen, laufende Unteragenten stoppen und korrigieren, ihr Modell und ihre Denkstufe wechseln, das Aussehen ändern, 5-Stunden- und Wochenlimit im Blick behalten.

Unteragenten, die selbst Unteragenten aufrufen, stehen in einer zweiten Reihe unter ihrem übergeordneten Agenten.

<img src="https://github.com/MikeGT4/agent-tree/releases/download/v0.5.4/readme-agent-tree-4.gif" width="560" alt="Demo der Funktionen oben">

## Installation

Im Terminal:

```bash
claude plugin install agent-tree --marketplace KentaroFujii/agent-tree
```

Danach Claude Code starten, die Leiste öffnet sich.

In einer laufenden Sitzung: `/plugin install agent-tree --marketplace KentaroFujii/agent-tree`

Braucht Claude Code 2.1.292+, wie das Original. Das Original wurde mit 2.1.319 getestet; für diesen Fork ist keine getestete Version festgehalten.

## Codex-Läufe

Ruft ein Agent (oder die Hauptsitzung) die Codex-CLI über Claude Codes Bash-Werkzeug auf, mit `codex exec` oder `codex exec review`, zeigt der Baum den Lauf. Im Kasten des aufrufenden Agenten steht das Codex-Modell neben dem Claude-Modell (`+ ◇ <Modell>`), dahinter die Denkstufe (`+ ◇ gpt-6.1-sol xhigh`; passt die Denkstufe nicht, nur das Modell). Der Balken des Kastens zeigt dann die Denkstufe von Codex, die Denkstufe von Claude steht in der Modellzeile (`Sonnet 5.5 low`). Jeder Lauf zeigt ein Zustandszeichen und die verstrichene Zeit, darunter die erste Zeile der Antwort. Nur `blockiert` steht als Wort; läuft, fertig, fehlgeschlagen und gestoppt stehen als Wörter in der geöffneten Antwort und in der einzeiligen Ansicht. Die Zeile eines Laufs nennt die Denkstufe nur, wenn nicht alle Läufe des Aufrufers gleich tief gingen, oder in einem verschachtelten Kasten, dessen Balken den übergeordneten Agenten nennt. Ein Lauf der Hauptsitzung erscheint im Hauptkasten. Ein Druck auf die Zeile öffnet die Antwort (bis zu 24 Zeilen, in einer niedrigen Leiste 8).

Das Modell kommt aus `-m`, die Denkstufe aus `-c model_reasoning_effort=...`; fehlt eines, aus `~/.codex/config.toml` (`$CODEX_HOME`, falls gesetzt). Die Antwort kommt aus der mit `-o` angegebenen Datei, sonst aus stdout. Die Datei wird gelesen, wenn `-o` ein absoluter Pfad ist, mit `~/`, `$HOME` oder `$TMPDIR` beginnt, eine im selben Befehl gesetzte Variable ist oder ein relativer Pfad nach einem `cd` auf einen absoluten Pfad im selben Befehl. Ein Wert aus `$(mktemp -d)` ist nicht lesbar, die Antwort kommt dann aus stdout.

Agenten werden nur dort einzeilig gezeichnet, wo zwei Kästen nicht nebeneinander passen. Ein Kasten ist 23 Spalten breit, das trifft in einer Leiste unter 49 Spalten zu. In einer niedrigen Leiste bleiben es Kästen, und die Leiste scrollt.

## Was es ausführt

Die automatische Aktualisierung (Auto-update) ist standardmäßig aus. Schaltest du sie ein, geschieht einmal am Tag, in Sitzungen mit Bedienung, Folgendes: Es ruft Claude Codes `plugin list --json` auf, liest seine Versionsnummer von raw.githubusercontent.com und startet bei einer neueren `plugin update agent-tree`. Sonst sendet es nichts ([PRIVACY.md](PRIVACY.md)).

Seine Hooks greifen nur, wenn du in der Leiste handelst; Tippen in der Eingabe beendet nur das Start-Intro.

[Anleitung](docs/GUIDE.de.md) · [PDF](https://github.com/MikeGT4/agent-tree/releases/download/v0.6.0/agent-tree-anleitung.pdf)

MIT, © 2026 Mike Pollow, Digitalroots
