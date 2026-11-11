. (Join-Path $PSScriptRoot '..\common.ps1')
$ticketId = $env:SUPPORTIQ_TICKET_ID
if (-not $ticketId) { $ticketId = '1' }
$body = Get-Content (Join-Path $PSScriptRoot 'sample-data.json') -Raw | ConvertFrom-Json
Invoke-SupportIqApi -Method POST -Path "/api/tickets/$ticketId/messages" -Body $body