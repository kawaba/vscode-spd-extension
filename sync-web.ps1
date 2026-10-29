<#
  元の SPD エディタ（kawaba/spd-editor）から、拡張機能の media/ へファイルを複製する。
  media/editor.html などはこのスクリプトで上書きするので、直接編集しない（直すのは元の spd-editor.html）。
  UTF-8 でないファイル（Shift_JIS）は UTF-8 に変換して複製する。
  あわせて、拡張機能の版（package.json の version）を SPD エディタの版（ver. X.Y.Z）にそろえる。

    元の spd-editor.html                → media/editor.html
    元の 2-java/javase-patterns.js      → media/javase-patterns.js
    元の 2-java/spring-patterns.js      → media/spring-patterns.js
    元の 2-java/thymeleaf-patterns.js   → media/thymeleaf-patterns.js
    元の 1-python/python-patterns.js    → media/python-patterns.js
    元の 3-C/c-patterns.js              → media/c-patterns.js

  spd-config.js は使わない（言語の設定は VS Code の設定 spd.languages・spd.defaultLanguage から bridge.js が渡す）。
  media/bridge.js・media/vscode-theme.css は拡張機能専用なので複製しない。

  使い方（リポジトリの直下で）:
    powershell -ExecutionPolicy Bypass -File .\sync-web.ps1
    powershell -ExecutionPolicy Bypass -File .\sync-web.ps1 -Source D:\work\spd-editor
#>
param(
    # 元の SPD エディタのフォルダ
    [string]$Source = "D:\★SPD\spd-editor"
)

$ErrorActionPreference = "Stop"
$media = Join-Path $PSScriptRoot "media"

$files = @(
    @{ From = "spd-editor.html";              To = "editor.html" },
    @{ From = "2-java\javase-patterns.js";    To = "javase-patterns.js" },
    @{ From = "2-java\spring-patterns.js";    To = "spring-patterns.js" },
    @{ From = "2-java\thymeleaf-patterns.js"; To = "thymeleaf-patterns.js" },
    @{ From = "1-python\python-patterns.js";  To = "python-patterns.js" },
    @{ From = "3-C\c-patterns.js";            To = "c-patterns.js" }
)

# editor.html は UTF-8 のページで、JS も UTF-8 として読む。元が UTF-8 でなければ
# （メモ帳などで Shift_JIS 保存された場合）文字化けしてスケルトンが出なくなるので、Shift_JIS とみなして UTF-8 に変換する
$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)   # BOM なし・不正なバイトで例外
$sjis = [System.Text.Encoding]::GetEncoding(932)

foreach ($f in $files) {
    $from = Join-Path $Source $f.From
    $to   = Join-Path $media $f.To
    if (-not (Test-Path $from)) { throw "見つかりません: $from" }
    $bytes = [System.IO.File]::ReadAllBytes($from)
    $note = ""
    try {
        $null = $utf8Strict.GetString($bytes)
    } catch [System.Text.DecoderFallbackException] {
        $bytes = $utf8Strict.GetBytes($sjis.GetString($bytes))
        $note = "（Shift_JIS → UTF-8 に変換）"
        Write-Warning ("UTF-8 ではありません。元のファイルも UTF-8 で保存し直してください: " + $from)
    }
    $same = (Test-Path $to) -and ([Convert]::ToBase64String($bytes) -eq [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($to)))
    if ($same) {
        Write-Host ("変更なし  " + $f.To + $note)
    } else {
        [System.IO.File]::WriteAllBytes($to, $bytes)
        Write-Host ("更新      " + $f.To + "  ← " + $f.From + $note)
    }
}

# 表示バージョン（画面右上の ver. X.Y.Z）を知らせる
$m = Select-String -Path (Join-Path $media "editor.html") -Pattern 'class="ver">ver\. ([0-9]+\.[0-9]+\.[0-9]+)<' | Select-Object -First 1
if (-not $m) { throw "editor.html に ver. X.Y.Z が見つかりません" }
$ver = $m.Matches[0].Groups[1].Value
Write-Host ("SPD エディタ ver. " + $ver)

# 拡張機能の版を SPD エディタの版にそろえる（package.json の書式はそのままで "version" の行だけ書き換える）
$pkg = Join-Path $PSScriptRoot "package.json"
$text = [System.IO.File]::ReadAllText($pkg, $utf8Strict)
$cur = [regex]::Match($text, '"version"\s*:\s*"([^"]*)"').Groups[1].Value
if ($cur -eq $ver) {
    Write-Host ("拡張機能の版  変更なし（$cur）")
} else {
    $text = [regex]::Replace($text, '("version"\s*:\s*")[^"]*(")', "`${1}$ver`${2}", 1)
    [System.IO.File]::WriteAllText($pkg, $text, $utf8Strict)
    Write-Host ("拡張機能の版  $cur → $ver")
}
