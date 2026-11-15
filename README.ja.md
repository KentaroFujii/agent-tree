# Agent Tree

[English](README.md) · [Deutsch](README.de.md)

Claude Code のサイドペイン（画面の脇に出る表示欄）です。セッション内のエージェントを、リアルタイムのツリーで見せます。

アドバイザーの切り替え、メインセッションの effort（思考の深さ）の設定、実行中のサブエージェントの停止と修正、サブエージェントのモデルと effort の切り替え、見た目の変更、5時間と週ごとの上限の確認ができます。

<img src="https://github.com/MikeGT4/agent-tree/releases/download/v0.5.4/readme-agent-tree-4.gif" width="560" alt="上記の機能のデモ">

## Install

ターミナルで次を実行します。

```bash
claude plugin install agent-tree --marketplace MikeGT4/agent-tree
```

そのあと Claude Code を起動すると、ペインが開きます。

セッションの中では `/plugin install agent-tree --marketplace MikeGT4/agent-tree` でも入れられます。

Claude Code 2.1.292 以上が必要です。動作確認は 2.1.319 で行っています。

## Codex runs

エージェント（またはメインセッション）が、Claude Code の Bash ツール経由で Codex CLI を `codex exec` か `codex exec review` で呼ぶと、ツリーにその実行が出ます。呼び出したエージェントのボックスには、Claude のモデルの隣に Codex のモデルが `+ ◇ <model>` の形で並びます。続けて effort、状態（running、done、failed、blocked、stopped のいずれか）、経過時間、回答の1行目が出ます。メインセッションの実行は、メインのボックスに出ます。その行を押すと回答が開きます（最大24行。低いペインでは8行）。

モデルは `-m` から、effort は `-c model_reasoning_effort=...` から取ります。どちらかが無いときは `~/.codex/config.toml`（`$CODEX_HOME` があればそちら）から取ります。回答は `-o` で指定したファイルから、無ければ stdout（標準出力）から取ります。ファイルを読ませるには、`-o` を絶対パスで書くか、同じコマンド内で設定した変数で書きます。`$(mktemp -d)` から得た値は読めないため、その場合の回答は stdout から取ります。

エージェントを1行ずつ描くのは、2つのボックスを横に並べられないときだけです。低いペインではボックスのままで、ペインがスクロールします。

## What it runs

1日に1回、対話型のセッションで、Claude Code の `plugin list --json` を実行し、raw.githubusercontent.com からバージョン番号を読みます。それが新しければ `plugin update agent-tree` を実行します。これ以外は何も送りません（[PRIVACY.md](PRIVACY.md)）。

フックが動くのは、ペインで操作したあとだけです。プロンプトへの入力で終わるのは、起動時のイントロだけです。

[Guide](docs/GUIDE.md) · [PDF](https://github.com/MikeGT4/agent-tree/releases/download/v0.6.0/agent-tree-guide.pdf)

MIT, © 2026 Mike Pollow, Digitalroots
