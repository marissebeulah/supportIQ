# SupportIQ API test collection

Each endpoint has an `invoke.ps1` script under `supportiq-api/`. Run scripts from any directory with PowerShell 5.1 or later. They print the HTTP status and response body; state-changing endpoints may update the local SQLite database.

Start the API first. For protected routes, log in with `http-auth-login\invoke.ps1`, copy the printed session cookie token, then set it for the current PowerShell session:

```powershell
$env:SUPPORTIQ_COOKIE = '<session-cookie-token>'
```

Local seeded accounts use password `support123`: `maya@northwind.co` (customer), `alex@supportiq.app` (support agent), and `admin@supportiq.app` (admin). The login sample defaults to the customer account; edit its adjacent `sample-data.json` to test another role. Never use these demo credentials outside the local development database.

Resource-specific scripts accept IDs through `SUPPORTIQ_TICKET_ID`, `SUPPORTIQ_CONVERSATION_ID`, `SUPPORTIQ_KB_ID`, `SUPPORTIQ_CANNED_REPLY_ID`, and `SUPPORTIQ_ATTACHMENT_ID`. Most default to `1`; set the relevant variable to an existing resource ID when needed. Upload invocation omits a file and exercises the API's missing-file validation response.