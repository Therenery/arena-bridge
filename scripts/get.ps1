# 一行命令安装 Arena CLI + 桥：irm https://raw.githubusercontent.com/Therenery/arena-bridge/master/scripts/get.ps1 | iex
$ErrorActionPreference = "Stop"
Write-Host "  正在获取 Arena 最新发行版..." -ForegroundColor Cyan
$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/Therenery/arena-bridge/releases/latest" -Headers @{ "User-Agent" = "arena-installer" }
$asset = $rel.assets | Where-Object { $_.name -match "^arena-setup-.*\.zip$" } | Select-Object -First 1
if (-not $asset) { throw "未找到 arena-setup-*.zip 发行包" }

$tmp = Join-Path $env:TEMP ("arena-setup-" + [guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$zip = Join-Path $tmp $asset.name
Write-Host ("  下载 " + $asset.name + " ...")
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $tmp -Force

$inst = Get-ChildItem -Path $tmp -Filter "install.ps1" -Recurse | Select-Object -First 1
if (-not $inst) { throw "安装包内未找到 install.ps1" }
& powershell -NoProfile -ExecutionPolicy Bypass -File $inst.FullName
Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
