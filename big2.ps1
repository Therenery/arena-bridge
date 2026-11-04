$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
$all = @()
Get-ChildItem '.git\objects\pack\*.idx' | ForEach-Object {
  $out = git verify-pack -v $_.FullName
  $all += $out | Where-Object { $_ -match '^[0-9a-f]{40} blob ' } | ForEach-Object {
    $f = $_ -split '\s+'; [pscustomobject]@{ Sha=$f[0]; Size=[int64]$f[3] }
  }
}
Write-Output ('blobs=' + $all.Count)
$map = @{}
[System.IO.File]::ReadAllLines('F:\__AI__\work\objs.txt') | ForEach-Object { $i = $_.IndexOf(' '); if ($i -gt 0) { $map[$_.Substring(0,$i)] = $_.Substring($i+1) } }
$all | Sort-Object Size -Descending | Select-Object -First 10 | ForEach-Object {
  $p = $map[$_.Sha]; if (-not $p) { $p = '(no path)' }
  Write-Output ('{0,8:N1} MB  {1}' -f ($_.Size/1MB), $p)
}