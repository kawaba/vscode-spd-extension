/* VS Code 拡張機能と SPD エディタ（editor.html）の仲立ち。editor.html のスクリプトより先に読み込む。
   editor.html は Eclipse プラグインと同じ約束事（元の仕様書 §6.13・§7.13e）で動くので、
   Eclipse の Java 側（SpdBrowser.java の BrowserFunction）に当たる関数をここで postMessage を使って用意する。

     拡張機能 → 画面 : { type: "update", text }               … loadSpd(text) で読み込む
                       { type: "clipboardText", id, text }    … spdGetClipboardText() の結果
     画面 → 拡張機能 : { type: "ready" }                      … 読み込みが終わった（内容を送ってほしい）
                       { type: "edit", text }                 … 編集された（spdNotifyChanged）
                       { type: "save", text }                 … Ctrl+S・「保存」ボタン（spdRequestSave）
                       { type: "readClipboard", id } / { type: "writeClipboard", text } / { type: "alert", text } */
(function () {
  const vscode = acquireVsCodeApi();
  const host = JSON.parse(document.getElementById("spd-host").textContent);

  // spd-config.js の代わり（言語は VS Code の設定 spd.languages・spd.defaultLanguage から）
  window.SPD_CONFIG = host.config;

  // editor.html は URL の mode=view で「保存…」（名前を付けて保存）の表示にする
  if (host.mode === "view") {
    try {
      const sep = location.search ? "&" : "?";
      history.replaceState(null, "", location.pathname + location.search + sep + "mode=view" + location.hash);
    } catch (e) { /* 表示が「保存」のままになるだけ */ }
  }

  // ---- JS → 拡張機能（Eclipse の BrowserFunction に当たる。存在すると editor.html は IN_ECLIPSE になる） ----

  // 内容は読み込み後に update で送られてくるので、ここでは空を返す
  window.spdGetInitialText = () => "";
  window.spdNotifyChanged = () => vscode.postMessage({ type: "edit", text: getSpdText() });
  // 最後の編集がまだ通知されていなくても保存されるよう、内容を一緒に送る
  window.spdRequestSave = () => vscode.postMessage({ type: "save", text: getSpdText() });

  // Import 用のクリップボード読み取り。Webview では navigator.clipboard.readText() が使えないことがあるため、
  // 拡張機能の vscode.env.clipboard で読む（editor.html の readClipboardText() は Promise も受け付ける）
  let clipboardSeq = 0;
  const clipboardWaits = new Map();
  window.spdGetClipboardText = () => new Promise(resolve => {
    const id = ++clipboardSeq;
    clipboardWaits.set(id, resolve);
    vscode.postMessage({ type: "readClipboard", id });
  });
  // Export の書き込みも同じ理由で拡張機能に任せる
  if (navigator.clipboard) {
    try {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: text => {
          vscode.postMessage({ type: "writeClipboard", text: String(text) });
          return Promise.resolve();
        }
      });
    } catch (e) { /* 元の writeText のまま */ }
  }

  // Webview ではダイアログが出せないので、VS Code の通知にする
  window.alert = message => vscode.postMessage({ type: "alert", text: String(message) });

  // ---- 拡張機能 → JS ----

  window.addEventListener("message", e => {
    const m = e.data;
    if (m.type === "update") {
      // 自分の編集が戻ってきただけなら読み込み直さない（カーソルや履歴を消さないため）
      if (typeof currentJSON === "function" && currentJSON() === m.text) return;
      loadSpd(m.text);
    } else if (m.type === "clipboardText") {
      const resolve = clipboardWaits.get(m.id);
      clipboardWaits.delete(m.id);
      if (resolve) resolve(m.text || "");
    }
  });

  // ---- キー操作 ----
  // Webview のキー操作は VS Code にも伝わり、Ctrl+Z は .spd のテキスト文書の「元に戻す」、Ctrl+S は保存として働く。
  // SPD エディタの履歴と二重に動かないよう、ここ（window の捕捉段階＝最初）で受け取って VS Code へは渡さない。
  window.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const inInput = e.target && e.target.id === "cap";
    if (k === "z" || k === "y") {
      e.stopPropagation();
      if (inInput) return;              // 文字入力欄の中は入力欄の取り消しのまま
      e.preventDefault();
      if (k === "y" || e.shiftKey) redo();
      else undo();
    } else if (k === "s") {
      e.stopPropagation();
      e.preventDefault();
      window.spdRequestSave();
    }
  }, true);

  window.addEventListener("load", () => vscode.postMessage({ type: "ready" }));
})();
