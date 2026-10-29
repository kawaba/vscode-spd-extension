import * as vscode from "vscode";
import { buildHtml, FromWebview, handleCommonMessage, webviewOptions } from "./webview";

/**
 * SPD エディタ（.spd ファイルを開いたときのカスタムエディタ）。
 * 内容は VS Code のテキスト文書（TextDocument）が持ち、画面での編集はそのまま文書の書き換えにする。
 * そのため保存・未保存マーク・「元に戻す」メニュー・ファイル外部での変更は VS Code 標準どおりに働く。
 * ファイルを作らずに使う画面は SpdViewProvider。
 */
export class SpdEditorProvider implements vscode.CustomTextEditorProvider {

    static readonly viewType = "spd.editor";

    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
        const webview = panel.webview;
        webview.options = webviewOptions(this.context.extensionUri);
        webview.html = buildHtml(webview, this.context.extensionUri, "editor");

        // 画面からの編集を文書に書き込んでいる途中の内容。その変更通知は画面へ送り返さない
        const applying = new Set<string>();
        let queue: Promise<void> = Promise.resolve();

        const sendDocument = () => webview.postMessage({ type: "update", text: document.getText() });

        /** 画面の内容で文書を置き換える（届いた順に1つずつ） */
        const applyText = (text: string): Promise<void> => {
            queue = queue.then(async () => {
                if (document.getText() === text) {
                    return;
                }
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
                applying.add(text);
                try {
                    await vscode.workspace.applyEdit(edit);
                } finally {
                    applying.delete(text);
                }
            });
            return queue;
        };

        // 「元に戻す」メニュー・元に戻す（Revert）・テキストエディタでの編集・ファイルの外部変更を画面へ反映する
        const changeSub = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() !== document.uri.toString() || e.contentChanges.length === 0) {
                return;
            }
            if (applying.has(document.getText())) {
                return;
            }
            sendDocument();
        });

        const messageSub = webview.onDidReceiveMessage(async (m: FromWebview) => {
            if (await handleCommonMessage(webview, m)) {
                return;
            }
            switch (m.type) {
                case "ready":
                    sendDocument();
                    break;
                case "edit":
                    await applyText(m.text);
                    break;
                case "save":
                    await applyText(m.text);
                    await document.save();
                    break;
            }
        });

        panel.onDidDispose(() => {
            changeSub.dispose();
            messageSub.dispose();
        });
    }
}
