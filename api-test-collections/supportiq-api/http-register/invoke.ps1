. (Join-Path $PSScriptRoot '..\common.ps1')
$body = Get-Content (Join-Path $PSScriptRoot 'sample-data.json') -Raw | ConvertFrom-Json
$body.email = "debug-$([guid]::NewGuid().ToString('N'))@example.test"
Invoke-SupportIqApi -Method POST -Path '/api/auth/register' -Body $body