param([string]$Model = "gemini-3.8-flash")
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Write-Host "TRP - Direct Gemini API test" -ForegroundColor Cyan
Write-Host "A window will open. Click Paste key to use the SAME API key configured in Render."
Write-Host "This makes one model lookup and one small Hello request directly to Google."
Write-Host ""
function Read-GeminiKeyDialog {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    $dialog = New-Object Windows.Forms.Form
    $dialog.Text = "TRP - Gemini API connection test"
    $dialog.ClientSize = New-Object Drawing.Size(540, 205)
    $dialog.StartPosition = 'CenterScreen'
    $dialog.FormBorderStyle = 'FixedDialog'
    $dialog.MaximizeBox = $false
    $dialog.MinimizeBox = $false
    $dialog.Font = New-Object Drawing.Font('Segoe UI', 10)
    $dialog.AutoScaleMode = 'Dpi'
    $label = New-Object Windows.Forms.Label
    $label.Text = "Copy the exact GEMINI_API_KEY value from Render, then click Paste key."
    $label.SetBounds(20, 18, 500, 48)
    $keyInput = New-Object Windows.Forms.TextBox
    $keyInput.UseSystemPasswordChar = $true
    $keyInput.ShortcutsEnabled = $true
    $keyInput.SetBounds(20, 72, 382, 28)
    $paste = New-Object Windows.Forms.Button
    $paste.Text = 'Paste key'
    $paste.SetBounds(412, 70, 108, 32)
    $status = New-Object Windows.Forms.Label
    $status.Text = 'Input is hidden. The key is used only for this test and is not saved.'
    $status.SetBounds(20, 112, 500, 36)
    $run = New-Object Windows.Forms.Button
    $run.Text = 'Run test'
    $run.Enabled = $false
    $run.DialogResult = [Windows.Forms.DialogResult]::OK
    $run.SetBounds(300, 158, 105, 32)
    $cancel = New-Object Windows.Forms.Button
    $cancel.Text = 'Cancel'
    $cancel.DialogResult = [Windows.Forms.DialogResult]::Cancel
    $cancel.SetBounds(415, 158, 105, 32)
    $paste.Add_Click({
        try {
            if ([Windows.Forms.Clipboard]::ContainsText()) {
                $keyInput.Text = [Windows.Forms.Clipboard]::GetText().Trim()
                $status.Text = 'Key pasted. Click Run test.'
            } else { $status.Text = 'Copy the API key first, then click Paste key.' }
        } catch { $status.Text = 'Clipboard unavailable. Try Ctrl+V in the key field.' }
    }.GetNewClosure())
    $keyInput.Add_TextChanged({ $run.Enabled = -not [string]::IsNullOrWhiteSpace($keyInput.Text) }.GetNewClosure())
    $dialog.AcceptButton = $run
    $dialog.CancelButton = $cancel
    $dialog.Controls.AddRange(@($label, $keyInput, $paste, $status, $run, $cancel))
    try {
        if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { return $null }
        return ConvertTo-SecureString $keyInput.Text.Trim() -AsPlainText -Force
    } finally {
        $keyInput.Clear()
        $dialog.Dispose()
    }
}
$secret = Read-GeminiKeyDialog
if (-not $secret) { Write-Host "Test cancelled."; return }
$pointer = [IntPtr]::Zero
$keyValue = $null
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $keyValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
    if (-not $keyValue) { throw "No key entered." }
    if ($Model -notmatch '^gemini-[a-zA-Z0-9.-]+$') { throw "Invalid model name." }
    $headers = @{ 'x-goog-api-key' = $keyValue }
    $base = "https://generativelanguage.googleapis.com/v1beta/models/" + $Model
    foreach ($test in @('Model access', 'Hello generation')) {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        try {
            if ($test -eq 'Model access') {
                $response = Invoke-WebRequest -UseBasicParsing -Uri $base -Headers $headers -TimeoutSec 10
            } else {
                $body = @{ contents = @(@{ role = 'user'; parts = @(@{ text = 'Reply with the single word Hello.' }) }); generationConfig = @{ maxOutputTokens = 512; thinkingConfig = @{ thinkingLevel = 'low' } } } | ConvertTo-Json -Depth 12 -Compress
                $response = Invoke-WebRequest -UseBasicParsing -Method POST -Uri ($base + ':generateContent') -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 25
            }
            $timer.Stop()
            Write-Host ("{0}: HTTP {1}, {2:N1} seconds" -f $test, [int]$response.StatusCode, $timer.Elapsed.TotalSeconds) -ForegroundColor Green
        } catch {
            $timer.Stop()
            $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            if ($code) { Write-Host ("{0}: HTTP {1}, {2:N1} seconds" -f $test, $code, $timer.Elapsed.TotalSeconds) -ForegroundColor Yellow }
            else { Write-Host ("{0}: timeout or connection failure after {1:N1} seconds" -f $test, $timer.Elapsed.TotalSeconds) -ForegroundColor Yellow }
        }
    }
    Write-Host ""
    Write-Host "Share only the two result lines above. Keep your API key private."
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $keyValue = $null
    $headers = $null
    if ($secret) { $secret.Dispose() }
}
Read-Host "Press Enter to close"
