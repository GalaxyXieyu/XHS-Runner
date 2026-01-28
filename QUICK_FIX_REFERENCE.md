# Quick Fix Reference

## Problem 1: Image Plan Styling Lost
**Root Cause**: Duplicate inline JSON parsing code (lines 1302-1363) bypassed ConfirmationCard component

**Fix**: Removed duplicate code, let ConfirmationCard handle all image_plans confirmations

**File**: `src/features/agent/components/AgentCreator.tsx`

## Problem 2: Images Not Rendering
**Root Cause**:
- Frontend: `assetId: imgEvent.taskId` (wrong field)
- Backend: Used non-existent `generatedImages` instead of `generatedImagePaths`

**Fixes**:
1. Added `extractAssetId()` helper to parse asset IDs from URLs
2. Fixed frontend: `assetId: extractAssetId(imgEvent.url)`
3. Fixed backend: Use `generatedImagePaths` and extract asset IDs

**Files**:
- `src/features/agent/components/AgentCreator.tsx` (lines 47-67, 342-367)
- `src/pages/api/agent/stream.ts` (lines 406-424)
- `src/features/agent/components/ConfirmationCard.tsx` (type definition)

## Key Code Changes

### Frontend Image Progress Handler
```typescript
// BEFORE (WRONG)
assetId: imgEvent.taskId

// AFTER (CORRECT)
assetId: extractAssetId(imgEvent.url)
```

### Backend Image Completion
```typescript
// BEFORE (WRONG)
output.generatedImages?.forEach((img: any, index: number) => {
  sendImageProgress(index + 1, 'complete', 1, img.url);
});

// AFTER (CORRECT)
output.generatedImagePaths?.forEach((path: string, index: number) => {
  const assetIdMatch = path.match(/\/api\/assets\/(\d+)/);
  const assetId = assetIdMatch ? assetIdMatch[1] : path;
  sendImageProgress(index + 1, 'complete', 1, assetId);
});
```

## Testing
1. Create new content with images
2. Verify image plans show in carousel (not raw JSON)
3. Verify images render after generation (not loading spinners)
4. Check browser console for errors

## Rollback
If issues occur, revert these commits:
- AgentCreator.tsx: Restore lines 1302-1363, revert image_progress handler
- stream.ts: Revert to generatedImages logic
- ConfirmationCard.tsx: Revert type definition
