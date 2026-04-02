@echo off
setlocal enabledelayedexpansion

echo 🤖 VFS Booking Bot - Portugal Client Setup
echo ──────────────────────────────────────────

:: Step 1: .env + auto secrets
echo [1/3] Preparing .env...
if not exist .env (
    copy .env.example .env
)
node scripts\bootstrap-env.cjs
if %errorlevel% neq 0 (
    echo Node.js required. Install from nodejs.org
    pause
    exit /b 1
)
echo ⚠️ Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env for Telegram.

:: Step 2: Check for Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERROR: Docker is not installed or not running.
    echo Please install Docker Desktop and try again.
    pause
    exit /b 1
)
echo [2/3] Docker detected.

:: Step 3: Run the project
echo [3/3] Starting the bot stack (this may take 5-10 minutes on first run)...
docker-compose up -d --build

echo ──────────────────────────────────────────
echo ✅ SETUP COMPLETE! 
echo 🌐 Dashboard: http://localhost
echo 🤖 Telegram: Check your bot for a /start message.
echo ──────────────────────────────────────────
pause
