$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
npm run bundle *> 'F:\__AI__\work\bundle.log'
Write-Output ('bundleExit=' + $LASTEXITCODE)
Get-Content 'F:\__AI__\work\bundle.log' -Tail 12