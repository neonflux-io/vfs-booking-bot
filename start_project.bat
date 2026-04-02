@echo off
setlocal
title VFS Booking Bot - Industrial Setup

echo ============================================================
echo   VFS GLOBAL BOOKING BOT - QUICK START ENGINE
echo ============================================================
echo.

:: Ensure .env exists and has JWT / encryption secrets (backend will not start without them)
echo [* ] Preparing .env (auto-fill dev secrets if missing)...
node scripts\bootstrap-env.cjs
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required for scripts\bootstrap-env.cjs — install Node or copy .env.example to .env and fill secrets manually.
    pause
    exit /b 1
)
echo [! ] Still add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env for Telegram commands.

:: Check for backend/.env file
if not exist backend\.env (
    echo [! ] Backend .env file not found.
    echo [* ] Creating backend/.env...
    copy .env.example backend\.env
)

:: Check for Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not running.
    echo [!] Please install Docker Desktop to run this project.
    pause
    exit /b
)

echo [OK] Docker detected.
echo [* ] Starting project in development mode...
echo [* ] This will build containers and start PostgreSQL, Redis, Backend, and Frontend.
echo.

docker-compose -f docker-compose.dev.yml up --build

echo.
echo [DONE] Project is shutting down.
pause
