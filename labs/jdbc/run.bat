@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM ============================================================
REM  run.bat —— 编译并运行 JDBC 对照实验
REM  不需要 Maven、不需要 Spring，只用 JDK + MySQL 驱动 jar
REM ============================================================

set JAVA=D:\Java 21
set DRIVER=..\..\tools\maven\repo\com\mysql\mysql-connector-j\8.3.0\mysql-connector-j-8.3.0.jar

if not exist "%DRIVER%" (
  echo [X] 找不到 MySQL 驱动：%DRIVER%
  echo     请先在 project\bookhub 执行一次 mvnw.cmd dependency:resolve
  pause & exit /b 1
)

echo [1/2] 编译...
if not exist out mkdir out
"%JAVA%\bin\javac.exe" -encoding UTF-8 -d out JdbcLab.java
if errorlevel 1 ( echo [X] 编译失败 & pause & exit /b 1 )

echo [2/2] 运行...
echo.
"%JAVA%\bin\java.exe" -Dfile.encoding=UTF-8 -cp "out;%DRIVER%" jdbc.JdbcLab

echo.
pause
endlocal
