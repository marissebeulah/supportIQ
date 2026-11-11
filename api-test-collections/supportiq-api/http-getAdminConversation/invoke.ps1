. (Join-Path $PSScriptRoot '..\common.ps1')
$conversationId = $env:SUPPORTIQ_CONVERSATION_ID
if (-not $conversationId) { $conversationId = '1' }
Invoke-SupportIqApi -Method GET -Path "/api/admin/conversations/$conversationId"