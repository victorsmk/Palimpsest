@echo off
set "PATH=C:\Users\User\AppData\Local\node\node-v24.22.1-win-x64;%PATH%"
cd /d "%~dp0"
echo Starting Palimpsest dev server...
echo Open http://localhost:3000 in your browser.
npm run dev
pause
