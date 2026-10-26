@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ============================================================
REM  START-ALL.bat  (one-click launcher)
REM
REM  1. Ensure workshop MySQL is running (port 3307)
REM  2. Build learning content (content.bundle.js)
REM  3. Start Spring Boot backend (port 8080)
REM  4. Start static server and open browser (port 5173)
REM
REM  Never touches your existing MySQL84 (3306) or global Maven.
REM
REM  Pure ASCII on purpose: cmd.exe re-reads batch files by BYTE
REM  OFFSET after chcp 65001 and corrupts multi-byte UTF-8,
REM  splitting lines in half. Chinese text lives in
REM  tools\messages.json and is printed by tools\msg.mjs.
REM ============================================================

node tools\msg.mjs banner start.banner

where java >nul 2>&1
if errorlevel 1 goto :nojava
node tools\msg.mjs step start.java_ok

if not exist "tools\maven\maven-3.9.9\bin\mvn.cmd" goto :nomaven
node tools\msg.mjs step start.maven_ok

netstat -ano | findstr ":3307 " | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  node tools\msg.mjs step start.db_start
  call tools\db-up.bat
) else (
  node tools\msg.mjs step start.db_skip
)

node tools\msg.mjs step start.build
node tools\build-content.mjs
if errorlevel 1 goto :buildfail

if not exist "%CD%\logs" mkdir "%CD%\logs"
netstat -ano | findstr ":8080 " | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  node tools\msg.mjs step start.backend
  start "bookhub-backend" /min cmd /c "cd /d %CD%\project\bookhub && mvnw.cmd spring-boot:run > %CD%\logs\server.log 2>&1"
) else (
  node tools\msg.mjs step start.backend_skip
)

netstat -ano | findstr ":5173 " | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  node tools\msg.mjs step start.static
  start "bookhub-static" /min cmd /c "cd /d %CD% && node tools\serve.mjs 5173 > %CD%\logs\serve.log 2>&1"
)

node tools\msg.mjs info start.waiting

set N=0
:waitloop
ping -n 3 127.0.0.1 >nul
curl -s -o nul "http://127.0.0.1:8080/api/books?page=1&size=1" 2>nul
if not errorlevel 1 goto :ready
set /a N+=1
if !N! LSS 25 goto :waitloop
node tools\msg.mjs warn start.not_ready
goto :open

:ready
node tools\msg.mjs ok start.ready

:open
ping -n 3 127.0.0.1 >nul
start "" "http://127.0.0.1:5173/learning-system/"
node tools\msg.mjs urls
node tools\msg.mjs info start.close_hint
if not "%LS_NOPAUSE%"=="1" pause
goto :eof

:nojava
node tools\msg.mjs err err.no_java
if not "%LS_NOPAUSE%"=="1" pause
exit /b 1

:nomaven
node tools\msg.mjs err err.no_maven
node tools\msg.mjs info err.no_maven_why
if not "%LS_NOPAUSE%"=="1" pause
exit /b 1

:buildfail
node tools\msg.mjs err err.build_fail
if not "%LS_NOPAUSE%"=="1" pause
exit /b 1