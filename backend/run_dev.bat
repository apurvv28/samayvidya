@echo off
REM Always start the API with the project venv (includes reportlab for PDF export).
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
  echo [ERROR] venv not found in %cd%
  echo Create it:  python -m venv venv
  echo Then:      venv\Scripts\pip install -r requirements.txt
  exit /b 1
)
echo Using: %cd%\venv\Scripts\python.exe
REM Set PYTHONPATH to include the backend directory for proper module resolution
set PYTHONPATH=%cd%
echo PYTHONPATH: %PYTHONPATH%
venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
