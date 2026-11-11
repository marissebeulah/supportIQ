. (Join-Path $PSScriptRoot '..\common.ps1')
$body = Get-Content (Join-Path $PSScriptRoot 'sample-data.json') -Raw | ConvertFrom-Json
Invoke-SupportIqApi -Method PUT -Path '/api/admin/settings' -Body $body