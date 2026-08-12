$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$examplePath = Join-Path $projectRoot ".env.example"
$targetPath = Join-Path $projectRoot ".env.local"

Write-Host ""
Write-Host "SilkGuard V2 - DeepSeek local key setup" -ForegroundColor Cyan
Write-Host "The key is stored only in .env.local and never bundled into the frontend." -ForegroundColor DarkGray
Write-Host ""

$secureKey = Read-Host "Enter the DeepSeek API Key" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ([string]::IsNullOrWhiteSpace($plainKey) -or -not $plainKey.StartsWith("sk-")) {
        throw "Invalid key format. No file was changed."
    }

    if (Test-Path -LiteralPath $targetPath) {
        $lines = [Collections.Generic.List[string]](Get-Content -LiteralPath $targetPath -Encoding UTF8)
    }
    else {
        $lines = [Collections.Generic.List[string]](Get-Content -LiteralPath $examplePath -Encoding UTF8)
    }

    $replaced = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match "^DEEPSEEK_API_KEY=") {
            $lines[$index] = "DEEPSEEK_API_KEY=$plainKey"
            $replaced = $true
            break
        }
    }
    if (-not $replaced) {
        $lines.Add("DEEPSEEK_API_KEY=$plainKey")
    }

    [IO.File]::WriteAllLines($targetPath, $lines, [Text.UTF8Encoding]::new($false))
    Write-Host ""
    Write-Host "Configuration complete: .env.local was updated." -ForegroundColor Green
    Write-Host "Restart the SilkGuard V2 backend to load the new key." -ForegroundColor Cyan
}
finally {
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
    $plainKey = $null
}
