# 把 arena 用的浏览器窗口缩到最小
Start-Sleep -Milliseconds 1200
$names = @("chrome", "msedge", "brave", "chromium", "vivaldi")
if ($env:ARB_CHROME -and (Test-Path -LiteralPath $env:ARB_CHROME)) {
  $bn = [IO.Path]::GetFileNameWithoutExtension($env:ARB_CHROME)
  if ($bn -and ($names -notcontains $bn)) { $names += $bn }
}
$all = Get-Process -Name $names -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
$p = $all | Where-Object { $_.MainWindowTitle -match "arena" } | Select-Object -First 1
if (-not $p) { $p = $all | Select-Object -First 1 }
if (-not $p) { exit 0 }
Add-Type -Name Win -Namespace Native -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
"@
[Native.Win]::ShowWindow($p.MainWindowHandle, 6) | Out-Null
