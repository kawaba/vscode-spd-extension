import * as vscode from "vscode";
import { buildHtml, FromWebview, handleCommonMessage, suggestSpdUri, webviewOptions } from "./webview";

/**
 * SPD ビュー（パネル「SPD」。コマンド「SPD: SPDエディタを開く」）。
 * ファイルを作らずに使える。ソースコードとの受け渡しは画面の Import / Export で行い、
 * ファイルに残したいときだけ「保存…」（Ctrl+S）で名前を付けて .spd に保存する。
 * 内容は拡張機能の保存領域（globalStorage）に自動で保管し、VS Code を再起動しても前回の続きから使える。
 */
export class SpdViewProvider implements vscode.WebviewViewProvider {

    static readonly viewType = "spd.view";

    /** 自動保管先（globalStorage/spd-view.json） */
    private static readonly STATE_FILE = "spd-view.json";
    /** 編集が止まってから自動保管するまでの時間（ミリ秒） */
    private static readonly PERSIST_DELAY = 1000;

    private text: string | undefined;
    private persistTimer: NodeJS.Timeout | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        const webview = view.webview;
        webview.options = webviewOptions(this.context.extensionUri);
        webview.html = buildHtml(webview, this.context.extensionUri, "view");

        webview.onDidReceiveMessage(async (m: FromWebview) => {
            if (await handleCommonMessage(webview, m)) {
                return;
            }
            switch (m.type) {
                case "ready":
                    await webview.postMessage({ type: "update", text: await this.readState() });
                    break;
                case "edit":
                    this.text = m.text;
                    this.schedulePersist();
                    break;
                case "save":
                    this.text = m.text;
                    this.schedulePersist();
                    await this.saveAs(m.text);
                    break;
            }
        });
    }

    // ---------------------------------------------------------------
    // 自動保管（VS Code を閉じても内容を残す）
    // ---------------------------------------------------------------

    private schedulePersist(): void {
        if (this.persistTimer) {
            return;
        }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = undefined;
            void this.persist();
        }, SpdViewProvider.PERSIST_DELAY);
    }

    /** 保管していない内容があれば書き込む（拡張機能の終了時にも呼ぶ） */
    async persist(): Promise<void> {
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
            this.persistTimer = undefined;
        }
        if (this.text === undefined) {
            return;
        }
        try {
            await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
            await vscode.workspace.fs.writeFile(this.stateUri(), Buffer.from(this.text, "utf8"));
        } catch (e) {
            console.error(e);
        }
    }

    private async readState(): Promise<string> {
        if (this.text !== undefined) {
            return this.text;
        }
        try {
            return Buffer.from(await vscode.workspace.fs.readFile(this.stateUri())).toString("utf8");
        } catch {
            return "";
        }
    }

    private stateUri(): vscode.Uri {
        return vscode.Uri.joinPath(this.context.globalStorageUri, SpdViewProvider.STATE_FILE);
    }

    // ---------------------------------------------------------------
    // 名前を付けて .spd に保存
    // ---------------------------------------------------------------

    private async saveAs(text: string): Promise<void> {
        let uri = await vscode.window.showSaveDialog({
            title: "SPD をファイルに保存",
            defaultUri: suggestSpdUri(),
            filters: { "SPD ファイル": ["spd"] },
        });
        if (!uri) {
            return;
        }
        if (!/\.spd$/i.test(uri.path)) {
            uri = uri.with({ path: uri.path + ".spd" });
        }
        try {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
        } catch (e) {
            vscode.window.showErrorMessage(`保存できませんでした: ${e instanceof Error ? e.message : e}`);
            return;
        }
        const open = "開く";
        const choice = await vscode.window.showInformationMessage(`SPD を保存しました: ${uri.fsPath}`, open);
        if (choice === open) {
            await vscode.commands.executeCommand("vscode.openWith", uri, "spd.editor");
        }
    }
}
