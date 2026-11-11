function Invoke-SupportIqApi {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body = $null
    )

    $baseUrl = if ($env:SUPPORTIQ_API_URL) { $env:SUPPORTIQ_API_URL.TrimEnd('/') } else { 'http://localhost:3001' }
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(15)
    $request = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::new($Method),
        [Uri]::new("$baseUrl$Path")
    )

    if ($env:SUPPORTIQ_COOKIE) {
        $request.Headers.TryAddWithoutValidation('Cookie', "siq_session=$($env:SUPPORTIQ_COOKIE)") | Out-Null
    }
    if ($null -ne $Body) {
        $json = ConvertTo-Json -InputObject $Body -Depth 20
        $request.Content = [System.Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
    }

    try {
        $response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        Write-Output "HTTP $([int]$response.StatusCode) $($response.ReasonPhrase)"

        if ($Path -eq '/api/events') {
            Write-Output 'Event stream connected; response body is intentionally left open.'
            return
        }

        if ($Path.StartsWith('/api/attachments/')) {
            Write-Output "Content type: $($response.Content.Headers.ContentType.MediaType)"
            Write-Output "Content length: $($response.Content.Headers.ContentLength)"
            return
        }

        $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ($content) { Write-Output $content }

        if ($response.Headers.Contains('Set-Cookie')) {
            $cookieHeaders = $response.Headers.GetValues('Set-Cookie') -join '; '
            $match = [regex]::Match($cookieHeaders, 'siq_session=([^;]+)')
            if ($match.Success) { Write-Output "Session cookie token: $($match.Groups[1].Value)" }
        }
    }
    finally {
        $request.Dispose()
        $client.Dispose()
    }
}