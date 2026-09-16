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
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe"           set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe"     set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

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

rem ---------- 2. 检查 Node 版本是否 ^>= 22.5（node:sqlite 需要）----------
set "NMAJ=0"
set "NMIN=0"
for /f "tokens=1,2 delims=." %%A in ('"%NODE_EXE%" -v 2^>nul') do (
  set "NMAJ=%%A" & set "NMIN=%%B"
)
set "NMAJ=!NMAJ:v=!"
if "!NMIN!"=="" set "NMIN=0"
set /a "NV = NMAJ*1000 + NMIN" 2>nul
if not defined NV set "NV=0"
if !NV! LSS 22005 (
  echo   [X] Node.js 版本太低（当前 v!NMAJ!.!NMIN!），需要 22.5 或更高。
  echo       原因：内置的 node:sqlite 数据库模块从 22.5 才开始提供。
  echo       到 https://nodejs.org/ 下载 LTS 版覆盖安装即可，旧项目不受影响。
  echo.
  pause
  exit /b 1
)
if !NV! LSS 22013 (
  echo   提示：Node v!NMAJ!.!NMIN! 的 node:sqlite 需要 --experimental-sqlite，
  echo         程序会自己带上该参数重启一次，你不用手动操作。
  echo         想彻底避开就升到 22.13+（到 https://nodejs.org/ 覆盖安装即可）。
  echo.
)

rem ---------- 3. 数据目录 ----------
rem  默认交给 server.js 自己探测：优先放项目里的 data\ 目录，
rem  探测不到可写可锁的位置时再依次退到 %LOCALAPPDATA%\PartVault、用户目录、临时目录。
rem  想固定位置就自己设环境变量 PV_DATA_DIR，比如：
rem      set PV_DATA_DIR=D:\PartVaultData
if defined PV_DATA_DIR (
  echo   数据目录   : %PV_DATA_DIR%   ^(来自环境变量^)
)

echo   Node.js   : !NODE_EXE!  ^(v!NMAJ!.!NMIN!^)
echo.
echo   浏览器将自动打开 http://127.0.0.1:7788/
echo   实际数据库路径以启动后打印的「数据库」一行为准。
echo   想停止服务：直接关掉这个黑窗口，或按 Ctrl + C
echo.

"!NODE_EXE!" --no-warnings "%~dp0server.js" --port 7788 --open

echo.
echo   服务已退出。
pause
