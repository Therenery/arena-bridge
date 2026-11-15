# 检查 arena.ai 登录状态；未登录时拉起浏览器等待登录，登录后自动后台并退出 0
param([string]$Base = "http://127.0.0.1:17892", [int]$TimeoutSec = 300)
$ErrorActionPreference = "SilentlyContinue"
try {
  $r = Invoke-RestMethod -Uri "$Base/auth/ensure" -Method Post -TimeoutSec 20
} catch { exit 0 }
if ($r -and $r.loggedIn) { exit 0 }

Write-Host ""
Write-Host "  [Arena] 检测到尚未登录 arena.ai，已将浏览器拉到前台。" -ForegroundColor Yellow
Write-Host "  请在浏览器中完成登录，登录成功后会自动将浏览器收起并进入 CLI..." -ForegroundColor Cyan
Write-Host ""

$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  try {
    $st = Invoke-RestMethod -Uri "$Base/auth/status" -Method Get -TimeoutSec 10
    if ($st -and $st.loggedIn) {
      Invoke-RestMethod -Uri "$Base/auth/ensure" -Method Post -TimeoutSec 10 | Out-Null
      Write-Host "  [Arena] 登录成功，浏览器已退到后台，正在启动 CLI..." -ForegroundColor Green
      exit 0
    }
  } catch {}
}
Write-Host "  [Arena] 等待登录超时，仍尝试继续启动 CLI。" -ForegroundColor Yellow
exit 0
