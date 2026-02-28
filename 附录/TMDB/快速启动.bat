@echo off
REM TMDB 电视剧重命名工具 - Windows 快速启动脚本
REM 拖放电视剧文件夹到此脚本上自动启动服务

setlocal enabledelayedexpansion

REM 获取脚本目录
set SCRIPT_DIR=%~dp0

REM 如果没有参数，显示使用说明
if "%~1"=="" (
    echo ╔════════════════════════════════════════════════════════════╗
    echo ║  TMDB 电视剧重命名工具 - Web 版本启动脚本                 ║
    echo ╚════════════════════════════════════════════════════════════╝
    echo.
    echo 使用方法1（拖放）：
    echo   直接将电视剧文件夹拖放到此脚本上
    echo.
    echo 使用方法2（命令行）：
    echo   %~nx0 "D:\TV\Breaking Bad" 8000
    echo.
    echo 参数说明：
    echo   参数1: 电视剧目录路径（必须）
    echo   参数2: HTTP服务端口（可选，默认8000）
    echo.
    echo 按任意键退出...
    pause >nul
    exit /b 0
)

REM 检查Python
where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo ✗ 未找到 Python 3
    echo.
    echo 请安装 Python 3: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM 检查 requests
python -c "import requests" >nul 2>&1
if errorlevel 1 (
    echo.
    echo ⏳ 正在安装依赖 requests...
    pip install requests -q
    echo ✓ 依赖安装完成
    echo.
)

REM 获取参数
set TV_DIR=%~1
set PORT=%~2

REM 如果没有指定端口，使用默认值
if "!PORT!"=="" set PORT=8000

REM 验证目录
if not exist "!TV_DIR!" (
    echo.
    echo ✗ 目录不存在: !TV_DIR!
    echo.
    pause
    exit /b 1
)

REM 启动服务
cls
echo ╔════════════════════════════════════════════════════════════╗
echo ║  TMDB 电视剧重命名工具 - Web 版本                          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo ✓ 正在启动服务...
echo.
echo 📁 处理目录: !TV_DIR!
echo 🌐 服务端口: !PORT!
echo.
echo 🎯 请在浏览器中打开:
echo    http://localhost:!PORT!
echo.
echo 第一次启动可能需要加载依赖，请稍候...
echo 按 Ctrl+C 停止服务
echo.

REM 切换到脚本目录
cd /d "!SCRIPT_DIR!"

REM 启动Python服务
python tmdb-renamer.py "!TV_DIR!" !PORT!

REM 如果脚本退出，保持窗口打开
if errorlevel 1 (
    echo.
    echo ✗ 服务启动失败
    echo.
    pause
)
