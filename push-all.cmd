@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo [XU-AI-Assistant] Submit and push current repository
echo.

git --version >nul 2>nul
if errorlevel 1 (
  echo Git is not available. Please install Git first.
  echo.
  pause
  exit /b 1
)

if not exist ".git" (
  echo This folder is not a Git repository.
  echo Current folder: %cd%
  echo.
  pause
  exit /b 1
)

set HAS_CHANGES=
for /f "delims=" %%i in ('git status --porcelain') do set HAS_CHANGES=1

if not defined HAS_CHANGES (
  echo Nothing to commit. Working tree is clean.
  echo.
  pause
  exit /b 0
)

echo Changed files:
git status --short
echo.

set COMMIT_MSG=
set /p COMMIT_MSG=Commit message, press Enter to use default: 
if "%COMMIT_MSG%"=="" set COMMIT_MSG=chore: update XU AI Assistant

for /f "delims=" %%b in ('git branch --show-current') do set BRANCH=%%b
if "%BRANCH%"=="" set BRANCH=main

echo.
echo Adding files...
git add -A
if errorlevel 1 goto failed

echo Committing...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 goto failed

echo Pushing to origin/%BRANCH%...
git push origin "%BRANCH%"
if errorlevel 1 goto failed

echo.
echo Done.
pause
exit /b 0

:failed
echo.
echo Failed. Please keep this window for error details.
pause
exit /b 1
