$ErrorActionPreference='Continue'
Set-Location 'F:\__AI__\work'
Remove-Item 'gh3.out','gh3.err' -ErrorAction SilentlyContinue
Set-Content -Path 'enter.txt' -Value "`r`n" -Encoding ascii -NoNewline
$p = Start-Process -FilePath 'gh' -ArgumentList 'auth','refresh','-h','github.com','-s','workflow','-s','delete_repo' -RedirectStandardInput 'enter.txt' -RedirectStandardOutput 'gh3.out' -RedirectStandardError 'gh3.err' -PassThru
$p.WaitForExit()
Write-Output ('exit=' + $p.ExitCode)