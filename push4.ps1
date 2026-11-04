$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work\qwen-code'
Write-Output '=== object ==='
git cat-file -t de49b34c706169d0c661d7c7b825e9426783473d 2>&1
Write-Output '=== clone ==='
if (Test-Path 'F:\__AI__\work\arena-cli-bare.git') { Remove-Item -Recurse -Force 'F:\__AI__\work\arena-cli-bare.git' }
git clone --bare --no-local 'F:\__AI__\work\qwen-code' 'F:\__AI__\work\arena-cli-bare.git' 2>&1 | Select-Object -Last 3
Write-Output '=== push ==='
Set-Location 'F:\__AI__\work\arena-cli-bare.git'
git push --force https://github.com/Therenery/arena-cli.git main 2>&1 | Out-String -Width 200