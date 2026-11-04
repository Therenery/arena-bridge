$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== missing ==='
$m = git fsck --full 2>&1 | Select-String 'missing|broken'
Write-Output ('missingCount=' + $m.Count)
$m | Select-Object -First 5 | ForEach-Object { $_.ToString() }
Write-Output '=== remotes ==='
git remote -v | Select-Object -First 4
Write-Output '=== fetch ==='
git fetch --force origin '+refs/heads/*:refs/remotes/origin/*' 2>&1 | Select-Object -Last 4
Write-Output '=== recheck ==='
$m2 = git fsck --full 2>&1 | Select-String 'missing|broken'
Write-Output ('missingCount2=' + $m2.Count)