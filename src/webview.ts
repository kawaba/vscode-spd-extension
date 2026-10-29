import * as fs from "fs";
import * as vscode from "vscode";

/**
 * SPD エディタの画面（media/editor.html）を Webview に載せるための共通処理。
 * editor.html は元の SPD エディタ（spd-editor.html）の複製で直接編集しないので、
 * Webview に必要なもの（CSP・<base>・nonce・bridge.js・テーマの CSS）は読み込むときに差し込む。
 */

/**
 * VS Code 版で使う言語の値（editor.html の LANGS のうち Python・C だけ）と表示名。
 * 言語ラジオにはこれだけを出す（SPD_CONFIG.langs・元の仕様書 §6.10 CF-06）。
 * Eclipse 版などで別の言語で保存した .spd を開いたときは、editor.html がその言語のラジオを足す。
 */
export const LANGS = [
    { value: "python", label: "Python" },
    { value: "c", label: "C" },
] as const;

/** 画面の種類。editor＝.spd ファイルのエディタ、view＝ファイルなしで使う SPD ビュー */
export type SpdMode = "editor" | "view";

/** Webview から届くメッセージ（media/bridge.js） */
export type FromWebview =
    | { type: "ready" }
    | { type: "edit"; text: string }
    | { type: "save"; text: string }
    | { type: "readClipboard"; id: number }
    | { type: "writeClipboard"; text: string }
    | { type: "alert"; text: string };

export function mediaUri(extensionUri: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(extensionUri, "media");
}

export function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return { enableScripts: true, localResourceRoots: [mediaUri(extensionUri)] };
}

/** spd-config.js の SPD_CONFIG に当たるもの。既定の言語は VS Code の設定 spd.defaultLanguage */
export function spdConfig(): { lang: string; langs: string[] } {
    const langs = LANGS.map(l => l.value as string);
    const lang = vscode.workspace.getConfiguration("spd").get<string>("defaultLanguage", "python");
    return { lang: langs.includes(lang) ? lang : langs[0], langs };
}

export function buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri, mode: SpdMode): string {
    const media = mediaUri(extensionUri);
    let html = fs.readFileSync(vscode.Uri.joinPath(media, "editor.html").fsPath, "utf8");
    const nonce = makeNonce();
    const base = webview.asWebviewUri(media).toString() + "/";
    const src = webview.cspSource;
    // スケルトン（xxx-patterns.js）は editor.html が <script> 要素を作って読むので、media/ からの読み込みを許す
    const csp = [
        "default-src 'none'",
        `img-src ${src} data:`,
        `font-src ${src}`,
        `style-src ${src} 'unsafe-inline'`,
        `script-src 'nonce-${nonce}' ${src}`,
    ].join("; ");
    const hostJson = JSON.stringify({ mode, config: spdConfig() }).replace(/</g, "\\u003c");

    // 設定は bridge.js が SPD_CONFIG として渡すので、spd-config.js は読まない
    html = html.replace(/<script[^>]*\bsrc="spd-config\.js"[^>]*><\/script>/, "");
    html = html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
    html = html.replace(/<head>/i, `<head>
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base href="${base}">
<script id="spd-host" type="application/json">${hostJson}</script>
<script nonce="${nonce}" src="bridge.js"></script>`);
    html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="vscode-theme.css">
</head>`);
    return html;
}

function makeNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 32; i++) {
        s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
}

/** 画面の種類によらない依頼（クリップボード・通知）を処理する。処理したら true */
export async function handleCommonMessage(webview: vscode.Webview, m: FromWebview): Promise<boolean> {
    switch (m.type) {
        case "readClipboard":
            await webview.postMessage({ type: "clipboardText", id: m.id, text: await vscode.env.clipboard.readText() });
            return true;
        case "writeClipboard":
            await vscode.env.clipboard.writeText(m.text);
            return true;
        case "alert":
            vscode.window.showWarningMessage(m.text);
            return true;
        default:
            return false;
    }
}

/** 新規 .spd の中身（空のグリッド）。editor.html の JSON.stringify(..., null, 2) と同じ書式にする */
export function initialJson(lang: string): string {
    return `{\n  "lang": "${lang}",\n  "data": {}\n}`;
}

/** アクティブなエディタのファイルと同じフォルダー・同じ名前の .spd（例：Hello.java → Hello.spd）を提案する */
export function suggestSpdUri(): vscode.Uri | undefined {
    const doc = vscode.window.activeTextEditor?.document;
    if (doc && doc.uri.scheme === "file") {
        return vscode.Uri.file(doc.uri.fsPath.replace(/\.[^.\\/]*$/, "") + ".spd");
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? vscode.Uri.joinPath(folder.uri, "spd.spd") : undefined;
}
