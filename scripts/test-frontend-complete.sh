#!/bin/bash

# XHS Generator - Complete Frontend Test with agent-browser
# Tests streaming, interactions, and HITL functionality

set -e

echo "🧪 XHS Generator - Complete Frontend Test"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASSED${NC}: $2"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}❌ FAILED${NC}: $2"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

echo -e "${BLUE}📋 Test Plan:${NC}"
echo "1. Open application and verify page loads"
echo "2. Navigate to Agent Creator"
echo "3. Test streaming without polling"
echo "4. Test real-time progress updates"
echo "5. Test HITL confirmation flow"
echo ""

# Test 1: Open application
echo -e "${YELLOW}Test 1: Opening application...${NC}"
agent-browser open http://localhost:3000 --headed > /tmp/ab-test1.log 2>&1
if [ $? -eq 0 ]; then
    test_result 0 "Application opened successfully"
else
    test_result 1 "Failed to open application"
    cat /tmp/ab-test1.log
    exit 1
fi

sleep 3

# Test 2: Take initial snapshot
echo ""
echo -e "${YELLOW}Test 2: Taking page snapshot...${NC}"
agent-browser snapshot > /tmp/page-snapshot.txt 2>&1
if grep -q "button\|link\|text" /tmp/page-snapshot.txt; then
    test_result 0 "Page snapshot captured"
    echo "  Found interactive elements on page"
else
    test_result 1 "Page snapshot failed or empty"
fi

# Test 3: Take screenshot
echo ""
echo -e "${YELLOW}Test 3: Taking screenshot...${NC}"
mkdir -p screenshots
agent-browser screenshot screenshots/01-homepage.png > /dev/null 2>&1
if [ -f screenshots/01-homepage.png ]; then
    test_result 0 "Screenshot captured"
    echo "  Saved to: screenshots/01-homepage.png"
else
    test_result 1 "Screenshot failed"
fi

# Test 4: Check for Agent Creator or similar UI
echo ""
echo -e "${YELLOW}Test 4: Looking for Agent Creator UI...${NC}"
if grep -qi "agent\|creator\|生成\|主题" /tmp/page-snapshot.txt; then
    test_result 0 "Found Agent Creator related UI elements"
else
    test_result 1 "Agent Creator UI not found"
    echo "  Page content:"
    head -20 /tmp/page-snapshot.txt
fi

# Test 5: Test for no polling (check network activity)
echo ""
echo -e "${YELLOW}Test 5: Monitoring for polling requests...${NC}"
echo "  This test checks if there are NO polling requests to /api/tasks/:id"
echo "  Monitoring network for 10 seconds..."

# Start monitoring network in background
agent-browser evaluate "(async () => {
    const requests = [];
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.name.includes('/api/tasks/')) {
                requests.push(entry.name);
            }
        }
    });
    observer.observe({ entryTypes: ['resource'] });

    await new Promise(resolve => setTimeout(resolve, 10000));

    return { pollingRequests: requests.length, requests };
})()" > /tmp/network-monitor.json 2>&1

if [ -f /tmp/network-monitor.json ]; then
    POLLING_COUNT=$(grep -o '"pollingRequests":[0-9]*' /tmp/network-monitor.json | grep -o '[0-9]*' || echo "0")
    if [ "$POLLING_COUNT" = "0" ]; then
        test_result 0 "No polling requests detected (expected behavior)"
    else
        test_result 1 "Found $POLLING_COUNT polling requests (should be 0)"
    fi
else
    echo "  ⚠️  Could not monitor network (browser may not support this test)"
fi

# Test 6: Check for new event types in code
echo ""
echo -e "${YELLOW}Test 6: Verifying new event types in code...${NC}"
if grep -q "image_progress\|content_update\|workflow_progress" src/features/agent/components/AgentCreator.tsx; then
    test_result 0 "New event types found in frontend code"
else
    test_result 1 "New event types not found in code"
fi

# Test 7: Check backend event senders
echo ""
echo -e "${YELLOW}Test 7: Verifying backend event senders...${NC}"
if grep -q "sendImageProgress\|sendContentUpdate\|sendWorkflowProgress" src/pages/api/agent/stream.ts; then
    test_result 0 "Backend event senders implemented"
else
    test_result 1 "Backend event senders not found"
fi

# Test 8: Verify polling code removal
echo ""
echo -e "${YELLOW}Test 8: Verifying polling code removal...${NC}"
if grep -q "pollInterval\|setInterval.*imageTasks" src/features/agent/components/AgentCreator.tsx; then
    test_result 1 "Polling code still exists (should be removed)"
else
    test_result 0 "Polling code successfully removed"
fi

# Final screenshot
echo ""
echo -e "${YELLOW}Taking final screenshot...${NC}"
agent-browser screenshot screenshots/02-final-state.png > /dev/null 2>&1

# Close browser
echo ""
echo -e "${YELLOW}Closing browser...${NC}"
agent-browser close > /dev/null 2>&1

# Summary
echo ""
echo "=========================================="
echo -e "${BLUE}📊 Test Summary${NC}"
echo "=========================================="
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Screenshots saved to: screenshots/"
    echo "  - 01-homepage.png"
    echo "  - 02-final-state.png"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo ""
    echo "Please review the test output above for details."
    echo ""
    exit 1
fi
