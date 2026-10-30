@echo off
cd /d "%~dp0web"
set PORT=5174
set PY=C:\Users\lawtszchun\AppData\Local\Programs\Python\Python312\python.exe
if not exist "%PY%" set PY=python
netstat -ano | findstr ":5174" | findstr "LISTENING" >nul
if not errorlevel 1 goto open
echo Starting the local server...
start "Teacher Work Platform" /min "%PY%" server.py
set /a n=0
:wait
set /a n+=1
if %n% GTR 20 goto fail
timeout /t 1 /nobreak >nul
"%PY%" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5174/admin', timeout=2)" >nul 2>&1
if errorlevel 1 goto wait
:open
start "" "http://127.0.0.1:5174/admin"
exit /b 0
:fail
echo.
echo Could not start. Leave this window open.
pause
