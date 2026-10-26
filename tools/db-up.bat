@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0.."

REM ============================================================
REM  db-up.bat - start workshop MySQL (port 3307)
REM
REM  Why a separate instance? Your MySQL84 on 3306 has an unknown
REM  root password; touching it would pollute other projects.
REM  This one lives in dbserver\data with known credentials and
REM  can be deleted to start over.
REM
REM  This file is pure ASCII on purpose. cmd.exe re-reads batch
REM  files by BYTE OFFSET after chcp 65001, which corrupts
REM  multi-byte UTF-8 and splits lines in half. All Chinese text
REM  lives in tools\messages.json and is printed by tools\msg.mjs.
REM ============================================================

set BASEDIR=D:\MySQL Server 8.4
set DATADIR=%CD%\dbserver\data
set PORT=3307
set MYSQL_PWD=bh_pwd_2026

if not exist "%BASEDIR%\bin\mysqld.exe" goto :nomysql

node tools\msg.mjs step db.check_port port=%PORT%
netstat -ano | findstr ":%PORT% " | findstr LISTENING >nul
if not errorlevel 1 (
  node tools\msg.mjs info db.port_busy port=%PORT%
  goto :initdb
)

if not exist "%DATADIR%\mysql" (
  node tools\msg.mjs step db.first_run
  if not exist "%DATADIR%" mkdir "%DATADIR%"
  "%BASEDIR%\bin\mysqld.exe" --initialize-insecure --basedir="%BASEDIR%" --datadir="%DATADIR%" --console >nul 2>&1
  if errorlevel 1 goto :initerr
)

node tools\msg.mjs step db.starting port=%PORT%
start "bookhub-mysql-3307" /min "%BASEDIR%\bin\mysqld.exe" --basedir="%BASEDIR%" --datadir="%DATADIR%" --port=%PORT% --console
node tools\msg.mjs info db.waiting

set TRIES=0
:waitloop
REM ping, not timeout: timeout aborts when stdin is redirected
ping -n 3 127.0.0.1 >nul
"%BASEDIR%\bin\mysqladmin.exe" -uroot -h127.0.0.1 -P%PORT% ping >nul 2>&1
if errorlevel 1 (
  set /a TRIES+=1
  if !TRIES! LSS 15 goto :waitloop
  goto :timeout
)

:initdb
node tools\msg.mjs step db.init

set MYSQL_ROOT="%BASEDIR%\bin\mysql.exe" -uroot -h127.0.0.1 -P%PORT% --default-character-set=utf8mb4
set MYSQL_BH="%BASEDIR%\bin\mysql.exe" -ubh -h127.0.0.1 -P%PORT% --default-character-set=utf8mb4

%MYSQL_ROOT% -e "CREATE DATABASE IF NOT EXISTS bookhub DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;" 2>nul
%MYSQL_ROOT% -e "CREATE DATABASE IF NOT EXISTS sql_lab DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;" 2>nul
%MYSQL_ROOT% -e "CREATE USER IF NOT EXISTS 'bh'@'%%' IDENTIFIED BY 'bh_pwd_2026';" 2>nul
%MYSQL_ROOT% -e "GRANT ALL ON bookhub.* TO 'bh'@'%%'; GRANT ALL ON sql_lab.* TO 'bh'@'%%'; FLUSH PRIVILEGES;" 2>nul

%MYSQL_BH% bookhub < "project\bookhub\src\main\resources\db\01-schema.sql" 2>nul
%MYSQL_BH% bookhub < "project\bookhub\src\main\resources\db\02-data.sql" 2>nul

"%BASEDIR%\bin\mysql.exe" -ubh -h127.0.0.1 -P%PORT% --default-character-set=utf8mb4 bookhub -N -e "SELECT COUNT(*) FROM book" > "%TEMP%\ls_bookcount.txt" 2>nul
node tools\msg.mjs dbready %PORT%
set MYSQL_PWD=
goto :eof

:nomysql
node tools\msg.mjs err db.no_mysqld path=%BASEDIR%\bin\mysqld.exe
node tools\msg.mjs info db.edit_basedir
if not "%LS_NOPAUSE%"=="1" pause
exit /b 1

:initerr
node tools\msg.mjs err db.init_fail
if not "%LS_NOPAUSE%"=="1" pause
exit /b 1

:timeout
node tools\msg.mjs err db.timeout
if not "%LS_NOPAUSE%"=="1" pause
exit /b 1