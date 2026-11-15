#Requires -Version 5.1
<#
  Arena 安装脚本

  把 arena-lite 和 arena-bridge 装进 %LOCALAPPDATA%\Programs\Arena，
  加进用户 PATH，建桌面与开始菜单快捷方式。
  全部在用户目录内，不需要管理员权限，不写注册表 Run 键，不起服务。

  用法：
    install.cmd                       # 双击
    powershell -ExecutionPolicy Bypass -File install.ps1
    powershell ... -File install.ps1 -Dir D:\Arena
#>
param(
  [string]$Dir = '',
  [switch]$NoShortcut
)

$ErrorActionPreference = 'Stop'

function Say($m)  { Write-Host "  $m" }
function Ok($m)   { Write-Host "  [OK] $m"   -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]  $m"   -ForegroundColor Yellow }
function Die($m)  { Write-Host "  [X]  $m"   -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host '  Arena 安装程序' -ForegroundColor Cyan
Write-Host '  ----------------------------------------'
Write-Host ''

$src = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Dir) { $Dir = Join-Path $env:LOCALAPPDATA 'Programs\Arena' }
$Dir = [IO.Path]::GetFullPath($Dir)

# ---------------------------------------------------------------- 1. node
$node = $null
$cands = @()
$c = Get-Command node -ErrorAction SilentlyContinue
if ($c) { $cands += $c.Source }
$cands += @(
  (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
)
foreach ($p in $cands) {
  if ($p -and (Test-Path -LiteralPath $p)) { $node = $p; break }
}
if (-not $node) {
  Die @'
没找到 Node.js。桥是一段 node 程序，没有它跑不起来。

  装一个：https://nodejs.org/  （选 LTS，一路下一步）
  装完关掉这个窗口重新双击 install.cmd
'@
}
$verText = (& $node -v 2>$null)
if ($verText -notmatch '^v(\d+)\.') { Die "node 版本读不出来：$verText" }
$major = [int]$Matches[1]
if ($major -lt 21) { Die "node 版本太旧（$verText），至少要 21。请到 nodejs.org 装新版。" }
Ok "node $verText"

# ---------------------------------------------------------------- 2. 浏览器检测与选择
function Find-InstalledBrowsers {
  $specs = @(
    @{ Name = 'Google Chrome';  Kind = 'cdp'; Exe = 'chrome.exe';   Paths = @(
      (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
      (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )},
    @{ Name = 'Microsoft Edge'; Kind = 'cdp'; Exe = 'msedge.exe';   Paths = @(
      (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
      (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
    )},
    @{ Name = 'Brave';          Kind = 'cdp'; Exe = 'brave.exe';    Paths = @(
      (Join-Path $env:ProgramFiles 'BraveSoftware\Brave-Browser\Application\brave.exe'),
      (Join-Path $env:LOCALAPPDATA 'BraveSoftware\Brave-Browser\Application\brave.exe')
    )},
    @{ Name = 'Chromium';       Kind = 'cdp'; Exe = 'chromium.exe'; Paths = @(
      (Join-Path $env:LOCALAPPDATA 'Chromium\Application\chrome.exe')
    )},
    @{ Name = 'Mozilla Firefox'; Kind = 'bidi'; Exe = 'firefox.exe'; Paths = @(
      (Join-Path $env:ProgramFiles 'Mozilla Firefox\firefox.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Mozilla Firefox\firefox.exe')
    )}
  )
  $found = @()
  foreach ($sp in $specs) {
    $hit = $null
    foreach ($p in $sp.Paths) { if ($p -and (Test-Path -LiteralPath $p)) { $hit = $p; break } }
    if (-not $hit) {
      foreach ($hive in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\')) {
        $reg = $hive + $sp.Exe
        if (Test-Path $reg) {
          $v = (Get-ItemProperty -Path $reg -ErrorAction SilentlyContinue).'(default)'
          if ($v -and (Test-Path -LiteralPath $v)) { $hit = $v; break }
        }
      }
    }
    if ($hit) { $found += [PSCustomObject]@{ Name = $sp.Name; Kind = $sp.Kind; Path = $hit } }
  }
  return $found
}

$detected = @(Find-InstalledBrowsers)
$browser = $null
if ($detected.Count -gt 0) {
  Say '检测到以下浏览器：'
  for ($i = 0; $i -lt $detected.Count; $i++) {
    $b = $detected[$i]
    $tag = if ($b.Kind -eq 'cdp') { '[推荐/CDP]' } else { '[暂不兼容CDP，需BiDi]' }
    Say ("  [{0}] {1} {2} -> {3}" -f ($i + 1), $b.Name, $tag, $b.Path)
  }
  Say '  [M] 手动输入自定义浏览器路径'
  $defIdx = 0
  for ($i = 0; $i -lt $detected.Count; $i++) { if ($detected[$i].Kind -eq 'cdp') { $defIdx = $i; break } }
  if ([Environment]::UserInteractive) {
    $pick = Read-Host ("请选择浏览器编号 (默认 " + ($defIdx + 1) + ")")
    if (-not $pick) { $pick = [string]($defIdx + 1) }
    if ($pick -match '^[mM]

# ---------------------------------------------------------------- 3. 复制文件
if (Test-Path -LiteralPath $Dir) {
  $alive = Get-Process arena-lite -ErrorAction SilentlyContinue
  if ($alive) { Die "Arena 正在运行（pid $($alive[0].Id)），先关掉它再装。" }
}
New-Item -ItemType Directory -Path $Dir -Force | Out-Null

if ($src.TrimEnd('\').ToLower() -eq $Dir.TrimEnd('\').ToLower()) {
  Ok '已经解压在安装目录里，跳过复制'
} else {
  foreach ($f in @('arena-lite.exe', 'arena.cmd', 'VERSION', 'README.md',
                   'install.cmd', 'install.ps1', 'uninstall.cmd', 'uninstall.ps1')) {
    $s = Join-Path $src $f
    if (Test-Path -LiteralPath $s) { Copy-Item -LiteralPath $s -Destination $Dir -Force }
  }
  foreach ($d in @('bridge', 'scripts')) {
    $s = Join-Path $src $d
    if (Test-Path -LiteralPath $s) {
      Copy-Item -LiteralPath $s -Destination $Dir -Recurse -Force
    }
  }
  Ok "文件装到 $Dir"
}

# ---------------------------------------------------------------- 4. PATH
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) { $userPath = '' }
$parts = @($userPath -split ';' | Where-Object { $_ -ne '' })
$lower = $parts | ForEach-Object { $_.TrimEnd('\').ToLower() }
if ($lower -notcontains $Dir.TrimEnd('\').ToLower()) {
  $newPath = (@($parts) + $Dir) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Ok '已加入用户 PATH'
} else {
  Ok 'PATH 里已有，跳过'
}
# 当前这个进程也要能立刻用到
$env:Path = "$Dir;$env:Path"

# ---------------------------------------------------------------- 5. 环境变量
$restore = Join-Path $Dir 'scripts\restore-chrome.ps1'
$restoreCmd = 'powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $restore + '"'
[Environment]::SetEnvironmentVariable('ARB_RESTORE_CMD', $restoreCmd, 'User')
$env:ARB_RESTORE_CMD = $restoreCmd
Ok 'ARB_RESTORE_CMD 已设置（撞上人机验证时把浏览器拉到前台）'
$minimize = Join-Path $Dir 'scripts\minimize-chrome.ps1'
$minimizeCmd = 'powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $minimize + '"'
[Environment]::SetEnvironmentVariable('ARB_MINIMIZE_CMD', $minimizeCmd, 'User')
$env:ARB_MINIMIZE_CMD = $minimizeCmd
Ok 'ARB_MINIMIZE_CMD 已设置（登录后自动将浏览器退到后台）'

# ---------------------------------------------------------------- 6. 快捷方式
if (-not $NoShortcut) {
  $ws = New-Object -ComObject WScript.Shell
  $exe = Join-Path $Dir 'arena-lite.exe'
  $cmd = Join-Path $Dir 'arena.cmd'

  $desktop = [Environment]::GetFolderPath('Desktop')
  if ($desktop) {
    $l = $ws.CreateShortcut((Join-Path $desktop 'Arena.lnk'))
    $l.TargetPath = $cmd
    $l.WorkingDirectory = $Dir
    $l.IconLocation = "$exe,0"
    $l.Description = 'Arena 终端客户端'
    $l.Save()
  }

  $sm = Join-Path ([Environment]::GetFolderPath('Programs')) 'Arena'
  New-Item -ItemType Directory -Path $sm -Force | Out-Null

  $l = $ws.CreateShortcut((Join-Path $sm 'Arena.lnk'))
  $l.TargetPath = $cmd
  $l.WorkingDirectory = $Dir
  $l.IconLocation = "$exe,0"
  $l.Description = 'Arena 终端客户端'
  $l.Save()

  $un = Join-Path $Dir 'uninstall.cmd'
  if (Test-Path -LiteralPath $un) {
    $l = $ws.CreateShortcut((Join-Path $sm '卸载 Arena.lnk'))
    $l.TargetPath = $un
    $l.WorkingDirectory = $Dir
    $l.IconLocation = "$exe,0"
    $l.Save()
  }
  Ok '桌面与开始菜单快捷方式已建'
}

# ---------------------------------------------------------------- 7. 收尾
$v = 'unknown'
$vf = Join-Path $Dir 'VERSION'
if (Test-Path -LiteralPath $vf) { $v = (Get-Content -LiteralPath $vf -Raw).Trim() }

Write-Host ''
Write-Host '  ----------------------------------------'
Write-Host "  装好了：Arena $v" -ForegroundColor Green
Write-Host ''
Write-Host '  开始用：'
Write-Host '    双击桌面上的 Arena，或在任意终端敲  arena'
Write-Host ''
Write-Host '  第一次启动会自己拉起 Chrome 和桥，稍等几秒。'
Write-Host "  数据（登录态、会话地址）在 $env:USERPROFILE\.arena-bridge"
Write-Host '  卸载：开始菜单 > Arena > 卸载 Arena'
Write-Host ''
) {
      $custom = Read-Host '请输入浏览器可执行文件完整路径'
      if ($custom -and (Test-Path -LiteralPath $custom)) { $browser = $custom }
    } elseif ($pick -match '^\d+

# ---------------------------------------------------------------- 3. 复制文件
if (Test-Path -LiteralPath $Dir) {
  $alive = Get-Process arena-lite -ErrorAction SilentlyContinue
  if ($alive) { Die "Arena 正在运行（pid $($alive[0].Id)），先关掉它再装。" }
}
New-Item -ItemType Directory -Path $Dir -Force | Out-Null

if ($src.TrimEnd('\').ToLower() -eq $Dir.TrimEnd('\').ToLower()) {
  Ok '已经解压在安装目录里，跳过复制'
} else {
  foreach ($f in @('arena-lite.exe', 'arena.cmd', 'VERSION', 'README.md',
                   'install.cmd', 'install.ps1', 'uninstall.cmd', 'uninstall.ps1')) {
    $s = Join-Path $src $f
    if (Test-Path -LiteralPath $s) { Copy-Item -LiteralPath $s -Destination $Dir -Force }
  }
  foreach ($d in @('bridge', 'scripts')) {
    $s = Join-Path $src $d
    if (Test-Path -LiteralPath $s) {
      Copy-Item -LiteralPath $s -Destination $Dir -Recurse -Force
    }
  }
  Ok "文件装到 $Dir"
}

# ---------------------------------------------------------------- 4. PATH
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) { $userPath = '' }
$parts = @($userPath -split ';' | Where-Object { $_ -ne '' })
$lower = $parts | ForEach-Object { $_.TrimEnd('\').ToLower() }
if ($lower -notcontains $Dir.TrimEnd('\').ToLower()) {
  $newPath = (@($parts) + $Dir) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Ok '已加入用户 PATH'
} else {
  Ok 'PATH 里已有，跳过'
}
# 当前这个进程也要能立刻用到
$env:Path = "$Dir;$env:Path"

# ---------------------------------------------------------------- 5. 环境变量
$restore = Join-Path $Dir 'scripts\restore-chrome.ps1'
$restoreCmd = 'powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $restore + '"'
[Environment]::SetEnvironmentVariable('ARB_RESTORE_CMD', $restoreCmd, 'User')
$env:ARB_RESTORE_CMD = $restoreCmd
Ok 'ARB_RESTORE_CMD 已设置（撞上人机验证时把浏览器拉到前台）'

# ---------------------------------------------------------------- 6. 快捷方式
if (-not $NoShortcut) {
  $ws = New-Object -ComObject WScript.Shell
  $exe = Join-Path $Dir 'arena-lite.exe'
  $cmd = Join-Path $Dir 'arena.cmd'

  $desktop = [Environment]::GetFolderPath('Desktop')
  if ($desktop) {
    $l = $ws.CreateShortcut((Join-Path $desktop 'Arena.lnk'))
    $l.TargetPath = $cmd
    $l.WorkingDirectory = $Dir
    $l.IconLocation = "$exe,0"
    $l.Description = 'Arena 终端客户端'
    $l.Save()
  }

  $sm = Join-Path ([Environment]::GetFolderPath('Programs')) 'Arena'
  New-Item -ItemType Directory -Path $sm -Force | Out-Null

  $l = $ws.CreateShortcut((Join-Path $sm 'Arena.lnk'))
  $l.TargetPath = $cmd
  $l.WorkingDirectory = $Dir
  $l.IconLocation = "$exe,0"
  $l.Description = 'Arena 终端客户端'
  $l.Save()

  $un = Join-Path $Dir 'uninstall.cmd'
  if (Test-Path -LiteralPath $un) {
    $l = $ws.CreateShortcut((Join-Path $sm '卸载 Arena.lnk'))
    $l.TargetPath = $un
    $l.WorkingDirectory = $Dir
    $l.IconLocation = "$exe,0"
    $l.Save()
  }
  Ok '桌面与开始菜单快捷方式已建'
}

# ---------------------------------------------------------------- 7. 收尾
$v = 'unknown'
$vf = Join-Path $Dir 'VERSION'
if (Test-Path -LiteralPath $vf) { $v = (Get-Content -LiteralPath $vf -Raw).Trim() }

Write-Host ''
Write-Host '  ----------------------------------------'
Write-Host "  装好了：Arena $v" -ForegroundColor Green
Write-Host ''
Write-Host '  开始用：'
Write-Host '    双击桌面上的 Arena，或在任意终端敲  arena'
Write-Host ''
Write-Host '  第一次启动会自己拉起 Chrome 和桥，稍等几秒。'
Write-Host "  数据（登录态、会话地址）在 $env:USERPROFILE\.arena-bridge"
Write-Host '  卸载：开始菜单 > Arena > 卸载 Arena'
Write-Host ''
 -and [int]$pick -ge 1 -and [int]$pick -le $detected.Count) {
      $chosen = $detected[[int]$pick - 1]
      if ($chosen.Kind -ne 'cdp') {
        Warn "$($chosen.Name) 仅支持 WebDriver BiDi，当前桥接基于 CDP。若使用请确认内核兼容，或改选 Chrome/Edge/Brave。"
      }
      $browser = $chosen.Path
    }
  }
  if (-not $browser) { $browser = $detected[$defIdx].Path }
}
if (-not $browser -and [Environment]::UserInteractive) {
  $custom = Read-Host '未自动检测到可用浏览器，请输入可执行文件路径（回车跳过）'
  if ($custom -and (Test-Path -LiteralPath $custom)) { $browser = $custom }
}
if ($browser) {
  [Environment]::SetEnvironmentVariable('ARB_CHROME', $browser, 'User')
  $env:ARB_CHROME = $browser
  Ok "已选浏览器：$browser"
} else {
  Warn '未配置浏览器，桥运行时将按默认路径查找 Chrome / Edge。'
}

# ---------------------------------------------------------------- 3. 复制文件
if (Test-Path -LiteralPath $Dir) {
  $alive = Get-Process arena-lite -ErrorAction SilentlyContinue
  if ($alive) { Die "Arena 正在运行（pid $($alive[0].Id)），先关掉它再装。" }
}
New-Item -ItemType Directory -Path $Dir -Force | Out-Null

if ($src.TrimEnd('\').ToLower() -eq $Dir.TrimEnd('\').ToLower()) {
  Ok '已经解压在安装目录里，跳过复制'
} else {
  foreach ($f in @('arena-lite.exe', 'arena.cmd', 'VERSION', 'README.md',
                   'install.cmd', 'install.ps1', 'uninstall.cmd', 'uninstall.ps1')) {
    $s = Join-Path $src $f
    if (Test-Path -LiteralPath $s) { Copy-Item -LiteralPath $s -Destination $Dir -Force }
  }
  foreach ($d in @('bridge', 'scripts')) {
    $s = Join-Path $src $d
    if (Test-Path -LiteralPath $s) {
      Copy-Item -LiteralPath $s -Destination $Dir -Recurse -Force
    }
  }
  Ok "文件装到 $Dir"
}

# ---------------------------------------------------------------- 4. PATH
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) { $userPath = '' }
$parts = @($userPath -split ';' | Where-Object { $_ -ne '' })
$lower = $parts | ForEach-Object { $_.TrimEnd('\').ToLower() }
if ($lower -notcontains $Dir.TrimEnd('\').ToLower()) {
  $newPath = (@($parts) + $Dir) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Ok '已加入用户 PATH'
} else {
  Ok 'PATH 里已有，跳过'
}
# 当前这个进程也要能立刻用到
$env:Path = "$Dir;$env:Path"

# ---------------------------------------------------------------- 5. 环境变量
$restore = Join-Path $Dir 'scripts\restore-chrome.ps1'
$restoreCmd = 'powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $restore + '"'
[Environment]::SetEnvironmentVariable('ARB_RESTORE_CMD', $restoreCmd, 'User')
$env:ARB_RESTORE_CMD = $restoreCmd
Ok 'ARB_RESTORE_CMD 已设置（撞上人机验证时把浏览器拉到前台）'

# ---------------------------------------------------------------- 6. 快捷方式
if (-not $NoShortcut) {
  $ws = New-Object -ComObject WScript.Shell
  $exe = Join-Path $Dir 'arena-lite.exe'
  $cmd = Join-Path $Dir 'arena.cmd'

  $desktop = [Environment]::GetFolderPath('Desktop')
  if ($desktop) {
    $l = $ws.CreateShortcut((Join-Path $desktop 'Arena.lnk'))
    $l.TargetPath = $cmd
    $l.WorkingDirectory = $Dir
    $l.IconLocation = "$exe,0"
    $l.Description = 'Arena 终端客户端'
    $l.Save()
  }

  $sm = Join-Path ([Environment]::GetFolderPath('Programs')) 'Arena'
  New-Item -ItemType Directory -Path $sm -Force | Out-Null

  $l = $ws.CreateShortcut((Join-Path $sm 'Arena.lnk'))
  $l.TargetPath = $cmd
  $l.WorkingDirectory = $Dir
  $l.IconLocation = "$exe,0"
  $l.Description = 'Arena 终端客户端'
  $l.Save()

  $un = Join-Path $Dir 'uninstall.cmd'
  if (Test-Path -LiteralPath $un) {
    $l = $ws.CreateShortcut((Join-Path $sm '卸载 Arena.lnk'))
    $l.TargetPath = $un
    $l.WorkingDirectory = $Dir
    $l.IconLocation = "$exe,0"
    $l.Save()
  }
  Ok '桌面与开始菜单快捷方式已建'
}

# ---------------------------------------------------------------- 7. 收尾
$v = 'unknown'
$vf = Join-Path $Dir 'VERSION'
if (Test-Path -LiteralPath $vf) { $v = (Get-Content -LiteralPath $vf -Raw).Trim() }

Write-Host ''
Write-Host '  ----------------------------------------'
Write-Host "  装好了：Arena $v" -ForegroundColor Green
Write-Host ''
Write-Host '  开始用：'
Write-Host '    双击桌面上的 Arena，或在任意终端敲  arena'
Write-Host ''
Write-Host '  第一次启动会自己拉起 Chrome 和桥，稍等几秒。'
Write-Host "  数据（登录态、会话地址）在 $env:USERPROFILE\.arena-bridge"
Write-Host '  卸载：开始菜单 > Arena > 卸载 Arena'
Write-Host ''
