$ErrorActionPreference='Continue'
$b = gh api 'repos/Therenery/arena-cli/contents/bridge?ref=archive' | ConvertFrom-Json
Write-Output ('bridgeItems=' + $b.Count)
$b | Select-Object -First 12 | ForEach-Object { Write-Output ('  ' + $_.name) }
$r = gh api repos/Therenery/arena-cli | ConvertFrom-Json
Write-Output ('visibility=' + $r.visibility + ' default=' + $r.default_branch + ' sizeKB=' + $r.size)