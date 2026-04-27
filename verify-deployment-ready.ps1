# Pre-Deployment Verification Script
# Run: powershell -ExecutionPolicy Bypass -File verify-deployment-ready.ps1

Write-Host "Pre-Deployment Verification" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host ""

$ERRORS = 0
$WARNINGS = 0

Write-Host "1. Checking Git Status..." -ForegroundColor Yellow

$envFiles = git ls-files | Select-String "\.env$"
if ($envFiles) {
    Write-Host "[ERROR] .env files are tracked by git!" -ForegroundColor Red
    $ERRORS++
} else {
    Write-Host "[OK] No .env files tracked by git" -ForegroundColor Green
}

$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "[WARN] You have uncommitted changes" -ForegroundColor Yellow
    $WARNINGS++
} else {
    Write-Host "[OK] No uncommitted changes" -ForegroundColor Green
}

Write-Host ""
Write-Host "2. Checking Environment Files..." -ForegroundColor Yellow

if (Test-Path "artifacts/api-server/.env.production.template") {
    Write-Host "[OK] API server production template exists" -ForegroundColor Green
} else {
    Write-Host "[WARN] API server production template missing" -ForegroundColor Yellow
    $WARNINGS++
}

if (Test-Path "artifacts/gym-manager/.env.production.template") {
    Write-Host "[OK] Mobile app production template exists" -ForegroundColor Green
} else {
    Write-Host "[WARN] Mobile app production template missing" -ForegroundColor Yellow
    $WARNINGS++
}

Write-Host ""
Write-Host "3. Checking Dependencies..." -ForegroundColor Yellow

if (Test-Path "node_modules") {
    Write-Host "[OK] Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Dependencies not installed" -ForegroundColor Red
    $ERRORS++
}

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Host "[OK] pnpm is installed" -ForegroundColor Green
} else {
    Write-Host "[ERROR] pnpm is not installed" -ForegroundColor Red
    $ERRORS++
}

Write-Host ""
Write-Host "4. Checking Documentation..." -ForegroundColor Yellow

if (Test-Path "DEPLOYMENT-GUIDE.md") {
    Write-Host "[OK] Deployment guide exists" -ForegroundColor Green
} else {
    Write-Host "[WARN] Deployment guide missing" -ForegroundColor Yellow
    $WARNINGS++
}

if (Test-Path "ENVIRONMENT-SETUP.md") {
    Write-Host "[OK] Environment setup guide exists" -ForegroundColor Green
} else {
    Write-Host "[WARN] Environment setup guide missing" -ForegroundColor Yellow
    $WARNINGS++
}

Write-Host ""
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "-------" -ForegroundColor Cyan
Write-Host "Errors: $ERRORS" -ForegroundColor $(if ($ERRORS -gt 0) { "Red" } else { "Green" })
Write-Host "Warnings: $WARNINGS" -ForegroundColor $(if ($WARNINGS -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

if ($ERRORS -gt 0) {
    Write-Host "DEPLOYMENT BLOCKED - Fix all errors first" -ForegroundColor Red
    exit 1
} elseif ($WARNINGS -gt 0) {
    Write-Host "WARNINGS FOUND - Review before deploying" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "ALL CHECKS PASSED - Ready for deployment!" -ForegroundColor Green
    exit 0
}
