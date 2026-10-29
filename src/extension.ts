import * as vscode from "vscode";
import { SpdEditorProvider } from "./spdEditorProvider";
import { SpdViewProvider } from "./spdViewProvider";
import { initialJson, LANGS, spdConfig, suggestSpdUri } from "./webview";

/** 前回選んだ言語を覚えておくキー（globalState） */
const LAST_LANG_KEY = "spd.newFile.lang";

let viewProvider: SpdViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
    viewProvider = new SpdViewProvider(context);

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(SpdEditorProvider.viewType, new SpdEditorProvider(context), {
            // タブを切り替えても画面（カーソル・アンドゥの履歴）を残す
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.window.registerWebviewViewProvider(SpdViewProvider.viewType, viewProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.commands.registerCommand("spd.newFile", (folder?: vscode.Uri) => newSpdFile(context, folder)),
        // 「ファイル → 新しいファイル…」の一覧に「SPD ファイル」と出すためのもの（中身は spd.newFile と同じ）
        vscode.commands.registerCommand("spd.newFileMenu", () => newSpdFile(context)),
        vscode.commands.registerCommand("spd.openView", () =>
            vscode.commands.executeCommand(`${SpdViewProvider.viewType}.focus`)),
        vscode.commands.registerCommand("spd.openFontFolder", () =>
            vscode.commands.executeCommand("revealFileInOS",
                vscode.Uri.joinPath(context.extensionUri, "media", "fonts", "PlemolJPHS-Regular.ttf"))),
    );
}

export async function deactivate(): Promise<void> {
    await viewProvider?.persist();
}

/**
 * 新規 SPD ファイルを作る。言語を選び、空の .spd（JSON）を書いて SPD エディタで開く。
 * エクスプローラーのフォルダーの右クリックから呼ばれたときはそのフォルダーに、それ以外は保存ダイアログで場所を決める。
 */
async function newSpdFile(context: vscode.ExtensionContext, folder?: vscode.Uri): Promise<void> {
    const last = context.globalState.get<string>(LAST_LANG_KEY) ?? spdConfig().lang;
    const items = LANGS
        .map(l => ({ label: l.label, value: l.value as string, picked: l.value === last }))
        .sort((a, b) => Number(b.picked) - Number(a.picked));
    const lang = items.length === 1 ? items[0] : await vscode.window.showQuickPick(items, {
        title: "新規 SPD ファイル",
        placeHolder: "言語を選んでください",
    });
    if (!lang) {
        return;
    }

    let uri: vscode.Uri | undefined;
    if (folder) {
        const name = await vscode.window.showInputBox({
            title: "新規 SPD ファイル",
            prompt: "ファイル名（拡張子 .spd は省略可）",
            value: "spd.spd",
            valueSelection: [0, 3],
            validateInput: v => /^[^\\/:*?"<>|]+$/.test(v.trim()) ? undefined : "ファイル名に使えない文字があります",
        });
        if (!name) {
            return;
        }
        uri = vscode.Uri.joinPath(folder, name.trim());
    } else {
        uri = await vscode.window.showSaveDialog({
            title: "新規 SPD ファイル",
            defaultUri: suggestSpdUri(),
            filters: { "SPD ファイル": ["spd"] },
        });
        if (!uri) {
            return;
        }
    }
    if (!/\.spd$/i.test(uri.path)) {
        uri = uri.with({ path: uri.path + ".spd" });
    }
    if (folder && await exists(uri)) {
        vscode.window.showErrorMessage(`すでにあります: ${uri.fsPath}`);
        return;
    }

    await vscode.workspace.fs.writeFile(uri, Buffer.from(initialJson(lang.value), "utf8"));
    await context.globalState.update(LAST_LANG_KEY, lang.value);
    await vscode.commands.executeCommand("vscode.openWith", uri, SpdEditorProvider.viewType);
}

async function exists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}
