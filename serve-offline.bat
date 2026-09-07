@echo off
set PORT=%1
if "%PORT%"=="" set PORT=8000
echo Starting BSESS Accreditation Evidence Portal on http://localhost:%PORT%
echo Press Ctrl+C to stop.
where python >nul 2>nul
if %ERRORLEVEL%==0 ( python -m http.server %PORT% & goto :eof )
where py >nul 2>nul
if %ERRORLEVEL%==0 ( py -m http.server %PORT% & goto :eof )
where npx >nul 2>nul
if %ERRORLEVEL%==0 ( npx --yes serve -l %PORT% . & goto :eof )
echo No Python or Node/npx found. Install Python 3, or open index.html directly.
pause
