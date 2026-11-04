$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code\bridge'
Get-ChildItem -Force | ForEach-Object {
  if ($_.PSIsContainer) {
    $s = (Get-ChildItem $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    Write-Output ('{0,-16} {1,10:N1} MB' -f $_.Name, ($s/1MB))
  } else { Write-Output ('{0,-16} {1,10:N1} KB' -f $_.Name, ($_.Length/1KB)) }
}