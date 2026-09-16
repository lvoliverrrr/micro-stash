@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title PartVault - 电子元件收纳管理系统
cd /d "%~dp0"

echo.
echo   ==========================================================
echo     PartVault  ·  电子元件收纳管理系统
echo   ==========================================================
echo.

rem ---------- 1. 找 Node.js ----------
set "NODE_EXE="
for %%P in (node.exe) do if not defined NODE_EXE set "NODE_EXE=%%~$PATH:P"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe"        set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe"  set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "D:\node\node.exe"                     set "NODE_EXE=D:\node\node.exe"

if not defined NODE_EXE (
  echo   [X] 没有找到 Node.js。
  echo.
  echo       请先安装 Node.js 22.5 或更高版本（免费，一路下一步即可）：
  echo       https://nodejs.org/zh-cn/download
  echo.
  echo       装完后重新双击本文件。
  echo.
  pause
  exit /b 1
)

rem ---------- 2. 检查 Node 版本是否 ^>= 22.5 ----------
for /f "tokens=1,2 delims=." %%A in ('"%NODE_EXE%" -v 2^>nul') do (
  set "NMAJ=%%A" & set "NMIN=%%B"
)
set "NMAJ=!NMAJ:v=!"
if !NMAJ! LSS 22 (
  echo   [X] Node.js 版本太低（当前 v!NMAJ!.!NMIN!），需要 22.5 或更高。
  echo       请到 https://nodejs.org/ 下载新版覆盖安装。
  echo.
  pause
  exit /b 1
)

rem ---------- 3. 数据库放到 Windows 本地盘 ----------
rem  项目目录在 WSL/网络盘上，SQLite 拿不到文件锁，所以显式指定本地目录。
if not defined PV_DATA_DIR set "PV_DATA_DIR=%LOCALAPPDATA%\PartVault"

echo   Node.js   : %NODE_EXE%
echo   数据目录  : %PV_DATA_DIR%
echo.
echo   浏览器将自动打开 http://127.0.0.1:7788/
echo   想停止服务：直接关掉这个黑窗口，或按 Ctrl + C
echo.

"%NODE_EXE%" --no-warnings "%~dp0server.js" --port 7788 --open

echo.
echo   服务已退出。
pause
