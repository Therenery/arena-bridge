$ErrorActionPreference = 'Continue'

# 前台调试用：起桥、等 6 秒、把日志尾巴打出来。
# 常驻运行请用 start-bridge.cmd 或计划任务 arena-bridge。

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'bridge.log'
$err = Join-Path $here 'bridge.err.log'

$p = Start-Process -FilePath 'node' `
  -ArgumentList (Join-Path $here 'arena_bridge.js') `
  -WorkingDirectory $here `
  -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $out `
  -RedirectStandardError $err

Start-Sleep -Seconds 6
if ($p.HasExited) { "EXITED " + $p.ExitCode } else { "RUNNING " + $p.Id }
"---LOG---"
if (Test-Path $out) { Get-Content $out -Tail 10 } else { "no log" }
"---ERR---"
if (Test-Path $err) { Get-Content $err -Tail 10 } else { "no err" }
