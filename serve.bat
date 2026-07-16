@echo off
REM Double-click this to preview the site locally.
REM Serves this folder on http://localhost:8765 and opens home.html (the site's landing page).
REM Close the "MIT Collab Server" window it opens to stop the server.

cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    start "MIT Collab Server" cmd /k py -m http.server 8765
    goto opened
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "MIT Collab Server" cmd /k python -m http.server 8765
    goto opened
)

start "MIT Collab Server" cmd /k npx serve -l 8765 .

:opened
timeout /t 2 /nobreak >nul
start "" "http://localhost:8765/home.html"
