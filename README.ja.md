# Agent Tree

[English](README.md) · [Deutsch](README.de.md)

Claude Code のサイドペイン（画面の脇に出る表示欄）です。セッション内のエージェントを、リアルタイムのツリーで見せます。

[MikeGT4/agent-tree](https://github.com/MikeGT4/agent-tree) の fork です。

アドバイザーの切り替え、メインセッションの effort（思考の深さ）の設定、実行中のサブエージェントの停止と修正、サブエージェントのモデルと effort の切り替え、見た目の変更、5時間と週ごとの上限の確認ができます。

サブエージェントが呼んだサブエージェントは、親の下の2段目に描きます。

<img src="https://github.com/KentaroFujii/agent-tree/releases/download/v1.0.0/readme-agent-tree.gif" width="560" alt="上記の機能のデモ">

## インストール

ターミナルで次を実行します。

```bash
claude plugin install agent-tree --marketplace KentaroFujii/agent-tree
```

そのあと Claude Code を起動すると、ペインが開きます。

セッションの中では `/plugin install agent-tree --marketplace KentaroFujii/agent-tree` でも入れられます。

Claude Code 2.1.292 以上が必要です（fork 元と同じ条件）。fork 元は 2.1.319 で動作確認しています。この fork で動作確認した版は記録していません。

## Codex の実行

エージェント（またはメインセッション）が、Claude Code の Bash ツール経由で Codex CLI を `codex exec` か `codex exec review` で呼ぶと、ツリーにその実行が出ます。呼び出したエージェントのボックスには、Claude のモデルの隣に Codex のモデルが `+ ◇ <model>` の形で並び、その後ろに effort が付きます（`+ ◇ gpt-6.1-sol xhigh`。幅が足りなければモデル名だけ）。ボックスの effort バーは Codex の effort を示し、Claude の effort はモデル行に移ります（`Sonnet 5.5 low`）。各実行には状態の印と経過時間が出て、その下に回答の1行目が出ます。単語で出るのは `blocked` だけです。running・done・failed・stopped は、開いた回答と1行表示で単語になります。実行の行に effort が出るのは、呼び出し元の実行の effort が揃っていないときと、バーが親を示す入れ子のボックスのときだけです。メインセッションの実行は、メインのボックスに出ます。その行を押すと回答が開きます（最大24行。低いペインでは8行）。

モデルは `-m` から、effort は `-c model_reasoning_effort=...` から取ります。どちらかが無いときは `~/.codex/config.toml`（`$CODEX_HOME` があればそちら）から取ります。回答は `-o` で指定したファイルから、無ければ stdout（標準出力）から取ります。ファイルを読めるのは、`-o` が絶対パスのとき、`~/`・`$HOME`・`$TMPDIR` で始まるとき、同じコマンド内で設定した変数のとき、同じコマンド内で絶対パスへ `cd` したあとの相対パスのときです。`$(mktemp -d)` から得た値は読めないため、その場合の回答は stdout から取ります。

エージェントを1行ずつ描くのは、2つのボックスを横に並べられないときだけです。ボックスの幅は23字なので、ペインの幅が49列未満のときがこれに当たります。低いペインではボックスのままで、ペインがスクロールします。

## 実行するもの

Auto-update は既定でオフです。オンにすると、1日に1回、対話型のセッションで次を行います。Claude Code の `plugin list --json` を実行し、raw.githubusercontent.com からバージョン番号を読み、それが新しければ `plugin update agent-tree` を実行します。これ以外は何も送りません（[PRIVACY.md](PRIVACY.md)）。

フックが動くのは、ペインで操作したあとだけです。プロンプトへの入力で終わるのは、起動時のイントロだけです。

[ガイド（英語）](docs/GUIDE.md) · [PDF（英語）](https://github.com/KentaroFujii/agent-tree/releases/download/v1.0.0/agent-tree-guide.pdf)

MIT, © 2026 Mike Pollow, Digitalroots
