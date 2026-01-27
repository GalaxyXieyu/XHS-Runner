#!/bin/bash

# XHS Generator - Streaming Enhancement Testing Script
# This script helps verify that the streaming enhancement is working correctly

set -e

echo "🧪 XHS Generator - Streaming Enhancement Test Suite"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if server builds
echo "📦 Test 1: Building server..."
if npm run build:server > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server builds successfully${NC}"
else
    echo -e "${RED}❌ Server build failed${NC}"
    exit 1
fi

# Test 2: Check if required files exist
echo ""
echo "📁 Test 2: Checking required files..."

FILES=(
    "src/lib/artifacts.ts"
    "src/lib/logger.ts"
    "src/lib/streaming.ts"
    "src/components/agent/ProgressBar.tsx"
    "src/components/agent/ImageCard.tsx"
    "src/components/agent/AgentEventTimeline.tsx"
    "src/features/agent/hooks/useAgentStreaming.ts"
)

ALL_FILES_EXIST=true
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ $file (missing)${NC}"
        ALL_FILES_EXIST=false
    fi
done

if [ "$ALL_FILES_EXIST" = false ]; then
    echo -e "${RED}❌ Some required files are missing${NC}"
    exit 1
fi

# Test 3: Check if polling code was removed
echo ""
echo "🔍 Test 3: Verifying polling removal..."

if grep -q "pollInterval\|setInterval.*imageTasks" src/features/agent/components/AgentCreator.tsx; then
    echo -e "${RED}❌ Polling code still exists in AgentCreator.tsx${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Polling code successfully removed${NC}"
fi

# Test 4: Check if new event handlers exist
echo ""
echo "🎯 Test 4: Checking event handlers..."

EVENT_HANDLERS=(
    "image_progress"
    "content_update"
    "workflow_progress"
)

ALL_HANDLERS_EXIST=true
for handler in "${EVENT_HANDLERS[@]}"; do
    if grep -q "$handler" src/features/agent/components/AgentCreator.tsx; then
        echo -e "${GREEN}✅ $handler handler exists${NC}"
    else
        echo -e "${RED}❌ $handler handler missing${NC}"
        ALL_HANDLERS_EXIST=false
    fi
done

if [ "$ALL_HANDLERS_EXIST" = false ]; then
    echo -e "${RED}❌ Some event handlers are missing${NC}"
    exit 1
fi

# Test 5: Check if backend event senders exist
echo ""
echo "📡 Test 5: Checking backend event senders..."

SENDERS=(
    "sendImageProgress"
    "sendContentUpdate"
    "sendWorkflowProgress"
)

ALL_SENDERS_EXIST=true
for sender in "${SENDERS[@]}"; do
    if grep -q "$sender" src/pages/api/agent/stream.ts; then
        echo -e "${GREEN}✅ $sender exists${NC}"
    else
        echo -e "${RED}❌ $sender missing${NC}"
        ALL_SENDERS_EXIST=false
    fi
done

if [ "$ALL_SENDERS_EXIST" = false ]; then
    echo -e "${RED}❌ Some event senders are missing${NC}"
    exit 1
fi

# Summary
echo ""
echo "=================================================="
echo -e "${GREEN}✅ All automated tests passed!${NC}"
echo ""
echo "📋 Next Steps:"
echo "1. Start the dev server: npm run dev"
echo "2. Open the app and test agent generation"
echo "3. Open DevTools → Network tab"
echo "4. Verify no polling requests to /api/tasks/:id"
echo "5. Verify image progress updates in real-time"
echo ""
echo "📚 See docs/implementation-complete.md for full testing checklist"
echo ""
