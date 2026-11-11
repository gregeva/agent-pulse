<#
.SYNOPSIS
  Set up agent-pulse on Windows: Python venv + Playwright.
.PARAMETER WithChromium
  Also download Playwright's bundled Chromium. Only needed when Google Chrome isn't installed.
#>
param([switch]$WithChromium)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Keep this script Windows PowerShell 5.1-compatible (no ?. / ?? operators).
$pyCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pyCmd) {
    throw "Python 3.11+ not found. Install it (e.g. 'winget install Python.Python.3.12') and re-run."
}
$python = $pyCmd.Source
& $python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if ($LASTEXITCODE -ne 0) { throw "Python 3.11+ required; found: $(& $python --version)" }

if (-not (Test-Path .venv)) {
    Write-Host "Creating .venv"
    & $python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "venv creation failed" }
}
$venvPy = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'

& $venvPy -m pip install --upgrade pip --quiet
& $venvPy -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) {
    Write-Host "Google Chrome found: $chrome"
} elseif (-not $WithChromium) {
    Write-Warning "Google Chrome not found. Install Chrome, set AGENT_PULSE_CHROME to a Chrome/Chromium exe, or re-run with -WithChromium."
}
if ($WithChromium) {
    & $venvPy -m playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw "playwright install chromium failed" }
}

Write-Host "`nSetup complete. Next: .venv\Scripts\python -m agent_pulse browser"
