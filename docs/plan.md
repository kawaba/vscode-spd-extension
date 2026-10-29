# SPDエディタ VS Code拡張機能化 計画書

## 1. 背景

- SPDエディタは現在 **HTML + JavaScript** で作られている。
- 先に、同じSPDエディタを **Eclipse拡張機能（プラグイン）** として作成した。
- 今回は同じことを **VS Code拡張機能** として実現したい。
- 授業では VS Code（ポータブル版の自動セットアップ環境）を使っており、学生がすぐ使える形で配布したい。

## 2. 実現可能性

十分に実現可能。Eclipse版よりも作りやすいと考えられる。

- VS Code拡張機能は TypeScript / JavaScript で記述し、画面は **Webview**（HTML/CSS/JSの表示領域）で作る。
- 既存のSPDエディタ（HTML+JS）をほぼそのまま流用できる。
- Eclipse版のように「Java（SWT）にブラウザ部品を埋め込む」という言語をまたぐ層が不要。

| 観点 | Eclipse版 | VS Code版 |
|---|---|---|
| 拡張本体の言語 | Java | TypeScript / JavaScript |
| 既存HTML/JSの流用 | Browser部品に埋め込み | Webviewにほぼそのまま載る |
| ひな形 | プラグインプロジェクト | `yo code`（Yeoman）で生成 |
| 配布形式 | 更新サイト / Eclipse Marketplace | `.vsix` / VS Code Marketplace・Open VSX |
| 生成AIとの連携 | 別途工夫が必要 | Copilot Chat・Language Model APIと直接連携可能 |

## 3. 実装方式

### ① Webviewパネル方式（最も簡単）
コマンド「SPDエディタを開く」で、既存のSPDエディタをタブやサイドパネルに表示する。最初に動くものを作る段階向き。

### ② カスタムエディタ方式（採用推奨）
`CustomTextEditorProvider` を使い、`.spd` ファイルを開いたときにSPDエディタの画面で編集できるようにする。

- 保存、Undo/Redo、未保存マークなどは VS Code のテキスト文書と同期される
- 「普通のファイルとして扱えるSPDエディタ」になり、授業での使い勝手が良い

### ③ 付加機能（後から追加）
- **シンタックスハイライト**：TextMate文法（JSON）で `.spd` をテキストとして開いた場合も色付け
- **スニペット**：SPDの定型パターンを補完候補として登録
- **コード生成連携**：Chat Participant API で `@spd` のようなチャット参加者を作り、開いているSPDから Java / Python コードを生成。Language Model API（`vscode.lm`）経由で Copilot のモデルを拡張機能から呼び出せる

## 4. 既存コード移植時の注意点

| 項目 | 内容 |
|---|---|
| ファイル読み書き | Webview内のJSは直接ファイルにアクセスできない。`postMessage` で拡張本体とやり取りし、保存は本体側で行う |
| リソース参照 | CSS・画像・JSのパスは `webview.asWebviewUri()` で変換し、`localResourceRoots` で許可する |
| CSP | インラインスクリプトやCDN読み込みは制限される。nonce付きスクリプトにし、ライブラリはローカル同梱にする |
| 状態保持 | `localStorage` ではなく `vscode.getState()` / `setState()` を使う |
| テーマ対応 | VS CodeのCSS変数（`--vscode-editor-background` など）を使い、ダーク/ライトテーマになじませる |

## 5. 作成手順

1. Node.js を用意し、ひな形を生成する
   ```
   npx --package yo --package generator-code -- yo code
   ```
   （TypeScript の "New Extension" を選択）
2. 既存SPDエディタの HTML / JS / CSS を `media/` フォルダへコピー
3. `CustomTextEditorProvider` で `.spd` ファイル用カスタムエディタとして組み込む
4. F5 で拡張機能開発ホストを起動し、動作確認
5. `vsce package` で `.vsix` を作成し、授業用に配布
6. 公開する場合は VS Code Marketplace（Publisher登録が必要）、必要に応じて Open VSX にも登録

## 6. 配布の想定

- ポータブルVS Codeの自動セットアップ環境に `.vsix` を同梱し、自動インストールさせる
- Marketplace公開前でも `.vsix` で配布可能

## 7. Claude Code への依頼内容

以下を実装してください。

1. `yo code` で生成した TypeScript 拡張機能プロジェクトをベースにする
2. 既存のSPDエディタ（HTML+JavaScript、`media/` に配置）を Webview で表示する
3. `CustomTextEditorProvider` を用いて、拡張子 `.spd` のファイルをSPDエディタで開けるようにする
   - Webview と TextDocument の内容を双方向に同期する（`postMessage` 経由）
   - 保存・Undo・未保存マークが VS Code 標準どおり動作すること
4. コマンド「SPD: 新規SPDファイルを作成」「SPD: SPDエディタを開く」を追加する
5. Webview は CSP を設定し、リソースは `asWebviewUri()` で参照する
6. VS Code のテーマ（ライト/ダーク）に合わせた配色にする
7. 最初は Eclipse版と同じ機能範囲を移植し、付加機能（ハイライト・スニペット・`@spd` チャット連携）は後の段階とする
8. `vsce package` で `.vsix` を作成できる状態にし、README.md（使い方・インストール方法）を用意する
