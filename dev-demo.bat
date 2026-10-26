@echo off
set "PATH=C:\Users\User\AppData\Local\node\node-v24.22.1-win-x64;%PATH%"
cd /d "%~dp0"
echo Starting the Palimpsest demo with accounts...
npm run dev:demo
pause
