<#
  元の SPD エディタ（kawaba/spd-editor）から、拡張機能の media/ へファイルを複製する。
  media/editor.html などはこのスクリプトで上書きするので、直接編集しない（直すのは元の spd-editor.html）。
  UTF-8 でないファイル（Shift_JIS）は UTF-8 に変換して複製する。
  あわせて、拡張機能の版（package.json の version）を SPD エディタの版（ver. X.Y.Z）にそろえる
  （拡張機能だけ直して版を上げたあとで、SPD エディタの版の方が古いときはそのままにする）。

    元の spd-editor.html                → media/editor.html
    元の patterns/javase-patterns.js    → media/patterns/javase-patterns.js
    元の patterns/spring-patterns.js    → media/patterns/spring-patterns.js
    元の patterns/thymeleaf-patterns.js → media/patterns/thymeleaf-patterns.js
    元の patterns/python-patterns.js    → media/patterns/python-patterns.js
    元の patterns/c-patterns.js         → media/patterns/c-patterns.js

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
    @{ From = "patterns\javase-patterns.js";    To = "patterns\javase-patterns.js" },
    @{ From = "patterns\spring-patterns.js";    To = "patterns\spring-patterns.js" },
    @{ From = "patterns\thymeleaf-patterns.js"; To = "patterns\thymeleaf-patterns.js" },
    @{ From = "patterns\python-patterns.js";    To = "patterns\python-patterns.js" },
    @{ From = "patterns\c-patterns.js";         To = "patterns\c-patterns.js" }
)

# 元で使わなくなった置き場所（v1.22.x までの media/ 直下のスケルトン）は media/ からも消す
foreach ($old in @("javase-patterns.js", "spring-patterns.js", "thymeleaf-patterns.js", "python-patterns.js", "c-patterns.js")) {
    $p = Join-Path $media $old
    if (Test-Path $p) {
        Remove-Item $p
        Write-Host ("削除      " + $old)
    }
}

# editor.html は UTF-8 のページで、JS も UTF-8 として読む。元が UTF-8 でなければ
# （メモ帳などで Shift_JIS 保存された場合）文字化けしてスケルトンが出なくなるので、Shift_JIS とみなして UTF-8 に変換する
$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)   # BOM なし・不正なバイトで例外
$sjis = [System.Text.Encoding]::GetEncoding(932)
$updated = $false

foreach ($f in $files) {
    $from = Join-Path $Source $f.From
    $to   = Join-Path $media $f.To
    if (-not (Test-Path $from)) { throw "見つかりません: $from" }
    New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
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
        $updated = $true
        Write-Host ("更新      " + $f.To + "  ← " + $f.From + $note)
    }
}

# 表示バージョン（画面右上の ver. X.Y.Z）を知らせる
$m = Select-String -Path (Join-Path $media "editor.html") -Pattern 'class="ver">ver\. ([0-9]+\.[0-9]+\.[0-9]+)<' | Select-Object -First 1
if (-not $m) { throw "editor.html に ver. X.Y.Z が見つかりません" }
$ver = $m.Matches[0].Groups[1].Value
Write-Host ("SPD エディタ ver. " + $ver)

# 拡張機能の版を SPD エディタの版にそろえる（package.json の書式はそのままで "version" の行だけ書き換える）
# 拡張機能だけ直して Z を上げた（1.22.0 → 1.22.1）ときは、SPD エディタの版より先に進んでいることがある。
# Marketplace は同じ版を二度出せないので、そのときは版を戻さない
$pkg = Join-Path $PSScriptRoot "package.json"
$text = [System.IO.File]::ReadAllText($pkg, $utf8Strict)
$cur = [regex]::Match($text, '"version"\s*:\s*"([^"]*)"').Groups[1].Value
if ($cur -eq $ver) {
    Write-Host ("拡張機能の版  変更なし（$cur）")
} elseif ([version]$cur -gt [version]$ver) {
    Write-Host ("拡張機能の版  変更なし（$cur。SPD エディタ ver. $ver より進んでいる）")
    if ($updated) {
        Write-Warning ("画面を更新しました。$cur を公開済みなら、package.json の版を手で上げてください（Z を 1 つ上げる）")
    }
} else {
    $text = [regex]::Replace($text, '("version"\s*:\s*")[^"]*(")', "`${1}$ver`${2}", 1)
    [System.IO.File]::WriteAllText($pkg, $text, $utf8Strict)
    Write-Host ("拡張機能の版  $cur → $ver")
}
