. (Join-Path $PSScriptRoot '..\common.ps1')
$ticketId = $env:SUPPORTIQ_TICKET_ID
if (-not $ticketId) { $ticketId = '1' }
Invoke-SupportIqApi -Method POST -Path "/api/tickets/$ticketId/read"