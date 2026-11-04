$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\arena-bridge'
git count-objects -vH
Write-Output '=== top blobs ==='
git rev-list --objects --all | ForEach-Object { $p = $_ -split ' ', 2; if ($p.Count -eq 2) { $p[0] + ' ' + $p[1] } } | Out-File -Encoding ascii 'F:\__AI__\work\objs.txt'
git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' --batch-all-objects | Where-Object { $_ -like 'blob*' } | ForEach-Object { $f = $_ -split ' '; [pscustomobject]@{ S = [int64]$f[2]; R = ($f[3..($f.Count-1)] -join ' ') } } | Sort-Object S -Descending | Select-Object -First 6 | ForEach-Object { Write-Output ('{0,9:N0} KB  {1}' -f ($_.S/1KB), $_.R) }