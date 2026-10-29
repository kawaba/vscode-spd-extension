# CLAUDE.md — SPD Editor for VS Code

HTML/JavaScript 製の SPD エディタを VS Code 拡張機能にするプロジェクト。計画は `docs/plan.md`。
Eclipse 版（`I:\eclipse-spd-plugin`、GitHub: kawaba/eclipse-spd-plugin）と同じ考え方で作っている。

## 基本方針

- **画面（SPDの描画・編集）は HTML/JavaScript のまま使う。** TypeScript 側は VS Code との連携だけ
  （ファイル入出力、保存、未保存マーク、コマンド、設定）
- CDN は使わない。必要なものはすべて `media/` に同梱する（授業環境はオフラインやプロキシ下の場合がある）
- コメント・UI 文言・コミットメッセージは日本語

## 構成

```
src/extension.ts          起動、コマンド（新規SPDファイル・SPDエディタを開く・フォントのフォルダを開く）
src/spdEditorProvider.ts  .spd のカスタムエディタ（CustomTextEditorProvider。内容は TextDocument が持つ）
src/spdViewProvider.ts    ファイルなしで使う SPD ビュー（パネル）。globalStorage/spd-view.json に自動保管、保存は「名前を付けて」
src/webview.ts            editor.html を Webview 用に組み立てる（CSP・<base>・nonce・bridge.js・テーマ CSS を差し込む）
media/editor.html         元の SPD エディタ（spd-editor.html）の複製。sync-web.ps1 で上書きする。直接編集しない
media/*-patterns.js       スケルトン。元の 1-python・2-java・3-C から sync-web.ps1 で複製する。直接編集しない
media/bridge.js           拡張機能専用。Eclipse の Java 側（SpdBrowser.java）に当たる関数を postMessage で用意する
media/vscode-theme.css    拡張機能専用。editor.html の色を VS Code のテーマ変数で上書きする
media/fonts/              PlemolJP HS（Eclipse 版の web/fonts/ と同じもの）
```

## 元の SPD エディタとの関係（二重管理しない）

- 画面の本体は `D:\★SPD\spd-editor\spd-editor.html`。修正は元で行い（版と仕様書 `spd-editor-spec.md` も上げる）、
  `powershell -ExecutionPolicy Bypass -File .\sync-web.ps1` で複製する。拡張機能の版（package.json）も SPD エディタの版にそろう
- editor.html は Eclipse 連携（元の仕様書 §6.13・§7.13e）の約束事で動かしている。`window.spdGetInitialText` があると
  「Eclipse 内」（`IN_ECLIPSE`）と判断して、自動保存・離脱確認・「開く」ボタンを止め、保存を `spdRequestSave()` に回す
- 約束事（`loadSpd`・`getSpdText`・`spdNotifyChanged` など）を元で変えるときは、Eclipse 版の SpdBrowser.java と
  この拡張機能の `media/bridge.js` も同時に直す
- `spd-config.js` は使わない。`bridge.js` が `SPD_CONFIG` を渡す（`src/webview.ts` の `spdConfig()`）
- 言語のラジオは **Python・C だけ**（2026-10-29 決定）。`src/webview.ts` の `LANGS` で決め、新規SPDファイルの言語もこの中から選ぶ。
  既定の言語は設定 `spd.defaultLanguage`。Java 系で保存した `.spd` を開くと、editor.html がその言語のラジオを足す（CF-06）。
  Java 系のスケルトン（`javase-` / `spring-` / `thymeleaf-patterns.js`）はそのようなファイルのために残している
- 画面の文言に「Eclipse」と出る所（保存ボタンの title）は元の editor.html のまま

## 拡張機能 ⇔ Webview のメッセージ（`media/bridge.js` と `src/*.ts`）

| 方向 | type | 説明 |
|---|---|---|
| Webview → 拡張 | `ready` | 読み込みが終わった。拡張は `update` で内容を送る |
| 拡張 → Webview | `update` | `loadSpd(text)` で読み込む（今の内容と同じなら何もしない） |
| Webview → 拡張 | `edit` | 編集された（`spdNotifyChanged`）。エディタは文書を置き換え、ビューは自動保管 |
| Webview → 拡張 | `save` | Ctrl+S・「保存」（`spdRequestSave`）。内容も一緒に送る |
| Webview → 拡張 | `readClipboard` / `writeClipboard` | Import / Export のクリップボード（`vscode.env.clipboard`） |
| Webview → 拡張 | `alert` | `alert()` の代わり（VS Code の通知） |

- Ctrl+Z / Ctrl+Y / Ctrl+S は bridge.js が window の捕捉段階で受け取り、VS Code へは渡さない
  （渡すと TextDocument の「元に戻す」・保存も動いて二重になる）。キーの取り消しは SPD エディタ自身の履歴
- 「編集 → 元に戻す」メニューや外部での変更は TextDocument の変更として `update` で画面へ送る（`loadSpd` は画面の履歴を消す）
- 画面からの編集を文書に書き込む途中の変更通知は送り返さない（`spdEditorProvider.ts` の `applying`）

## ビルド

```
npm install
npm run compile      # out/ に出力
npm run package      # spd-editor-X.Y.Z.vsix を作る
```

F5 で拡張機能開発ホストが起動する（`.vscode/launch.json`）。
