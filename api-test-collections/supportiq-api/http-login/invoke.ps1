. (Join-Path $PSScriptRoot '..\common.ps1')
$body = Get-Content (Join-Path $PSScriptRoot 'sample-data.json') -Raw | ConvertFrom-Json
Invoke-SupportIqApi -Method POST -Path '/api/auth/login' -Body $body