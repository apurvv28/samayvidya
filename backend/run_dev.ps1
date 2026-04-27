# Start the API with the project venv so ReportLab and other deps match requirements.txt.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "[ERROR] venv not found at $py"
    Write-Host "Create:  python -m venv venv"
    Write-Host "Then:    .\venv\Scripts\pip install -r requirements.txt"
    exit 1
}
Write-Host "Using: $py"
# Set PYTHONPATH to include the backend directory for proper module resolution
$env:PYTHONPATH = $PSScriptRoot
Write-Host "PYTHONPATH: $env:PYTHONPATH"
& $py -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
