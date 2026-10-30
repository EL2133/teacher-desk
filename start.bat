@echo off
cd /d "%~dp0web"
set PORT=5174
set PY=C:\Users\lawtszchun\AppData\Local\Programs\Python\Python312\python.exe
if not exist "%PY%" set PY=python
echo.
echo Teacher Work Platform
echo Stopping old server on port 5174...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5174" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1
timeout /t 1 /nobreak >nul
echo Starting server...
start "Teacher Work Platform" /min "%PY%" server.py
set /a n=0
:wait
set /a n+=1
if %n% GTR 20 goto fail
timeout /t 1 /nobreak >nul
"%PY%" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5174/', timeout=2)" >nul 2>&1
if errorlevel 1 goto wait
echo Opening http://localhost:5174
start http://localhost:5174
exit /b 0
:fail
echo.
echo Could not start. Is Python installed?
echo Leave this window open and tell the teacher.
pause
