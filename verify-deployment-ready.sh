#!/bin/bash
# Pre-Deployment Verification Script
# Run this before deploying to production

set -e

echo "🔍 Gym Manager Pro - Pre-Deployment Verification"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to print status
print_status() {
    if [ "$1" = "OK" ]; then
        echo -e "${GREEN}✓${NC} $2"
    elif [ "$1" = "WARN" ]; then
        echo -e "${YELLOW}⚠${NC} $2"
        ((WARNINGS++))
    else
        echo -e "${RED}✗${NC} $2"
        ((ERRORS++))
    fi
}

echo "1. Checking Git Status..."
echo "-------------------------"

# Check if .env files are tracked
if git ls-files | grep -q "\.env$"; then
    print_status "ERROR" ".env files are tracked by git! Remove them immediately."
else
    print_status "OK" "No .env files tracked by git"
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    print_status "WARN" "You have uncommitted changes"
else
    print_status "OK" "No uncommitted changes"
fi

echo ""
echo "2. Checking Environment Files..."
echo "---------------------------------"

# Check if production templates exist
if [ -f "artifacts/api-server/.env.production.template" ]; then
    print_status "OK" "API server production template exists"
else
    print_status "WARN" "API server production template missing"
fi

if [ -f "artifacts/gym-manager/.env.production.template" ]; then
    print_status "OK" "Mobile app production template exists"
else
    print_status "WARN" "Mobile app production template missing"
fi

# Check if .env files have dev secrets
if [ -f "artifacts/api-server/.env" ]; then
    if grep -q "DevPassword123" "artifacts/api-server/.env"; then
        print_status "WARN" "API server .env contains dev password (OK for local dev)"
    fi
    if grep -q "localhost" "artifacts/api-server/.env"; then
        print_status "OK" "API server .env configured for local development"
    fi
fi

if [ -f "artifacts/gym-manager/.env" ]; then
    if grep -q "localhost" "artifacts/gym-manager/.env"; then
        print_status "OK" "Mobile app .env configured for local development"
    fi
fi

echo ""
echo "3. Checking Dependencies..."
echo "---------------------------"

# Check if node_modules exists
if [ -d "node_modules" ]; then
    print_status "OK" "Dependencies installed"
else
    print_status "ERROR" "Dependencies not installed. Run: pnpm install"
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
    print_status "OK" "pnpm is installed"
else
    print_status "ERROR" "pnpm is not installed"
fi

echo ""
echo "4. Checking TypeScript Configuration..."
echo "----------------------------------------"

# Check if tsconfig files exist
if [ -f "tsconfig.json" ]; then
    print_status "OK" "Root tsconfig.json exists"
else
    print_status "ERROR" "Root tsconfig.json missing"
fi

if [ -f "artifacts/api-server/tsconfig.json" ]; then
    print_status "OK" "API server tsconfig.json exists"
else
    print_status "ERROR" "API server tsconfig.json missing"
fi

if [ -f "artifacts/gym-manager/tsconfig.json" ]; then
    print_status "OK" "Mobile app tsconfig.json exists"
else
    print_status "ERROR" "Mobile app tsconfig.json missing"
fi

echo ""
echo "5. Checking for Sensitive Data..."
echo "----------------------------------"

# Check for hardcoded secrets in source files (excluding node_modules and .env files)
if grep -r "AVNS_Vh7-mUwcXY7M3ORV4Zh" --exclude-dir=node_modules --exclude="*.env" --exclude="*.md" . 2>/dev/null; then
    print_status "ERROR" "Old database password found in source files!"
else
    print_status "OK" "No old database passwords in source files"
fi

# Check for TODO/FIXME in critical files
TODO_COUNT=$(grep -r "TODO\|FIXME" artifacts/api-server/src artifacts/gym-manager/app --exclude-dir=node_modules 2>/dev/null | wc -l || echo "0")
if [ "$TODO_COUNT" -gt 0 ]; then
    print_status "WARN" "Found $TODO_COUNT TODO/FIXME comments in source code"
else
    print_status "OK" "No TODO/FIXME comments in critical source files"
fi

echo ""
echo "6. Checking Documentation..."
echo "-----------------------------"

# Check if deployment docs exist
if [ -f "DEPLOYMENT-GUIDE.md" ]; then
    print_status "OK" "Deployment guide exists"
else
    print_status "WARN" "Deployment guide missing"
fi

if [ -f "ENVIRONMENT-SETUP.md" ]; then
    print_status "OK" "Environment setup guide exists"
else
    print_status "WARN" "Environment setup guide missing"
fi

if [ -f "PRE-DEPLOYMENT-CHECKLIST.md" ]; then
    print_status "OK" "Pre-deployment checklist exists"
else
    print_status "WARN" "Pre-deployment checklist missing"
fi

echo ""
echo "7. Checking Build Configuration..."
echo "-----------------------------------"

# Check if build scripts exist
if [ -f "artifacts/api-server/build.ts" ]; then
    print_status "OK" "API server build script exists"
else
    print_status "ERROR" "API server build script missing"
fi

if [ -f "artifacts/gym-manager/scripts/build.js" ]; then
    print_status "OK" "Mobile app build script exists"
else
    print_status "ERROR" "Mobile app build script missing"
fi

echo ""
echo "================================================"
echo "Summary:"
echo "--------"
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}❌ DEPLOYMENT BLOCKED${NC}"
    echo "Fix all errors before deploying to production."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  WARNINGS FOUND${NC}"
    echo "Review warnings before deploying to production."
    exit 0
else
    echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
    echo "Project is ready for deployment!"
    exit 0
fi
