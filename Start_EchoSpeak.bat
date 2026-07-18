@echo off
title EchoSpeak Local Server Launcher
echo ==================================================
echo   EchoSpeak Web App - Local Server Launcher
echo ==================================================
echo.
echo Starting local web server...
echo Server URL: http://localhost:8000
echo.
echo Press Ctrl+C in this window to stop the server.
echo ==================================================
start http://localhost:8000
python -m http.server 8000
