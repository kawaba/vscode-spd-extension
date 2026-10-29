SPD エディタ用フォント PlemolJP HS
====================================

このフォルダには次のファイルがあります。

  PlemolJPHS-Regular.ttf  フォント PlemolJP HS（v3.1.0）
  LICENSE-PlemolJP.txt    フォントのライセンス（SIL Open Font License 1.1）
  README.txt              この説明


■ SPD エディタの画面

  何もしなくても、SPD エディタの画面はこのフォントで表示されます。
  （このフォルダのフォントを SPD エディタが直接読み込みます。インストールは不要です）


■ Export した SPD がソースコードのエディタでずれるとき

  SPD の罫線（─ │ ├ など）は、全角の幅で表示するフォントでないと桁がずれます。
  Java や Python のファイルに貼り付けた SPD がずれる場合は、
  次の 1・2 を行うと、SPD エディタと同じフォントで表示されます。

  1. フォントを Windows にインストールする
     PlemolJPHS-Regular.ttf を右クリック →「インストール」
     （管理者権限は不要です。すでにインストール済みなら不要です）

  2. VS Code のフォント設定を変える
     (1) VS Code のメニュー「ファイル → ユーザー設定 → 設定」（Ctrl+,）
     (2) 検索欄に「font family」と入力
     (3)「Editor: Font Family」の先頭に 'PlemolJP HS', を書き足す
         例：'PlemolJP HS', Consolas, 'Courier New', monospace
     （settings.json に直接書く場合は "editor.fontFamily": "'PlemolJP HS', Consolas, monospace"）

  ※ 必ず 1 を先に行ってください。フォントが無いまま 2 を行うと、次の候補のフォントで表示されます。


■ フォントについて

  PlemolJP（作者 Yuko OTAWARA 氏）https://github.com/yuru7/PlemolJP
  SIL Open Font License 1.1 に従って、改変せずに同梱しています。
