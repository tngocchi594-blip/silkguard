@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SilkGuard V2

echo.
echo  SilkGuard V2 - 本地合规案件智能体
echo  ==================================

where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Python 3.10 或更高版本。
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js。
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/4] 创建本地 Python 环境...
  python -m venv .venv
)

echo [2/4] 检查后端依赖...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :failed

echo [3/4] 构建前端...
call npm install
if errorlevel 1 goto :failed
call npm run build
if errorlevel 1 goto :failed

echo [4/4] 启动完整应用：http://127.0.0.1:8000
start "" "http://127.0.0.1:8000"
".venv\Scripts\python.exe" -m backend.main
goto :end

:failed
echo.
echo [错误] 安装或构建失败，请保留本窗口中的报错信息。
pause

:end
