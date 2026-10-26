@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM ============================================================
REM  mvnw.cmd - workshop Maven wrapper
REM
REM  Uses tools\maven\maven-3.9.9 with an isolated local repo.
REM  Does NOT touch your global Maven 4.0.0-rc or ~/.m2.
REM  Usage is identical to mvn.
REM
REM  Pure ASCII on purpose: see tools\messages.json note.
REM ============================================================

set MVN_HOME=%~dp0..\..\tools\maven\maven-3.9.9
set MVN_CFG=%~dp0..\..\tools\maven\settings.xml

if not exist "%MVN_HOME%\bin\mvn.cmd" goto :nomaven

call "%MVN_HOME%\bin\mvn.cmd" -s "%MVN_CFG%" %*
endlocal
goto :eof

:nomaven
echo [X] Maven not found: %MVN_HOME%
exit /b 1