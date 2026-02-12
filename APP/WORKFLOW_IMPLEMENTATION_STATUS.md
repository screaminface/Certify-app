# Active/Planned/Completed Workflow Implementation Status

## ✅ COMPLETED

### 1. Database Schema Updates
- **database.ts**: Added `status`, `createdAt`, `updatedAt` to Group interface
- **Version 3 migration**: Migrates existing groups (first as active, rest as planned)
- **date-fns**: Installed for calendar month calculations

### 2. Medical Validity Module
- **medicalValidation.ts**: Created with:
  - `isMedicalDateValid()`: Checks if medical date is within 6 calendar months
  - `formatDateBG()`: Converts ISO to DD.MM.YYYY
  - `parseDateBG()`: Converts DD.MM.YYYY to ISO
  - `MEDICAL_EXPIRED_MESSAGE`: Bulgarian error message

### 3. Group Workflow Core Logic
- **groupUtils.ts**: Completely rewritten with:
  - `getActiveGroup()`: Gets the one active group
  - `getPlannedGroups()`: Gets all planned groups
  - `getSuggestedGroup()`: Finds appropriate group for courseStartDate
  - `createGroup()`: Creates new group with status
  - `closeActiveGroup()`: Closes active, auto-promotes next planned
  - `activateGroup()`: Manually activates a planned group
  - `deleteGroupIfEmpty()`: Cleanup for planned groups with no participants
  - `syncGroups()`: Maintains group table with workflow states

## 🔄 IN PROGRESS (NEEDS COMPLETION)

### 4. useParticipants Hook Updates
**File**: `src/hooks/useParticipants.ts`

**Required changes**:
```typescript
// 1. Add medical validation import
import { isMedicalDateValid, MEDICAL_EXPIRED_MESSAGE } from '../utils/medicalValidation';
import { getSuggestedGroup, createGroup, getActiveGroup } from '../utils/groupUtils';

// 2. Update addParticipant to:
//    - Check medical validity (throw error if expired)
//    - Get suggested group or create planned group
//    - Support manual group override
//    - Auto-activate planned group if no active exists

// 3. Update updateParticipant to:
//    - Check medical validity on medicalDate change
//    - Handle group reassignment with suggested logic
```

### 5. ParticipantModal UI Updates
**File**: `src/components/ParticipantModal.tsx`

**Required changes**:
- Add medical date validation with error message
- Show suggested course dates in BG format
- Add group assignment radio buttons:
  * "Auto (по медицинско)" (default)
  * "Вкарай в активната група" (if active exists)
  * "Избери група" (dropdown with all groups)
- Show warning modal if selected group != suggested
- Display dates in DD.MM.YYYY format

### 6. UI Components - Bulgarian Date Format
**Files to update**:
- `ParticipantList.tsx`: Format courseStartDate, courseEndDate with `formatDateBG()`
- `ParticipantCardList.tsx`: Format all date displays
- `FiltersDrawer.tsx`: Keep date inputs as ISO but display labels in BG
- `StatsPills.tsx`: No date display, no changes needed

### 7. Group Status Badges
**File**: Create `src/components/ui/GroupStatusBadge.tsx`

```typescript
interface GroupStatusBadgeProps {
  status: 'active' | 'planned' | 'completed';
}

// Blue for active, slate for planned, emerald for completed
```

Then add to ParticipantList and ParticipantCardList alongside group number.

### 8. Close Active Group Action
**File**: `src/components/ToolsPage.tsx`

**Required additions**:
- New section: "Group Management"
- Button: "Приключи активната група"
- Confirmation modal before closing
- Show which group will become active next
- Call `closeActiveGroup()` from groupUtils

### 9. Export/Import Updates
**File**: `src/components/ToolsPage.tsx` (export functions)

**Required changes**:
- Export: Include group status, createdAt, updatedAt
- Import: Restore groups with statuses
- Excel/CSV: Show dates in DD.MM.YYYY format

## 📋 TESTING CHECKLIST

After implementation, verify:

1. **Medical Validity**:
   - [ ] Cannot create participant with medical date > 6 months old
   - [ ] Error message displays correctly

2. **Group Assignment**:
   - [ ] First participant creates active group
   - [ ] Participant with matching courseStart joins active group
   - [ ] Participant with future courseStart creates planned group
   - [ ] Only ONE active group exists at any time

3. **Manual Override**:
   - [ ] Warning modal shows when selected != suggested
   - [ ] Can force assignment to different group
   - [ ] Manual override persists on edit

4. **Close Active Group**:
   - [ ] Active becomes completed
   - [ ] Next planned becomes active (if exists)
   - [ ] Works with no planned groups remaining

5. **Bulgarian Dates**:
   - [ ] All dates display as DD.MM.YYYY
   - [ ] Date filters work correctly
   - [ ] Export shows BG format

6. **Data Integrity**:
   - [ ] Group numbers remain sequential
   - [ ] No duplicate group numbers
   - [ ] Empty planned groups are deleted
   - [ ] Active group cannot be deleted

## 🚀 NEXT STEPS

1. Update `useParticipants.ts` with medical validation and new group logic
2. Refactor `ParticipantModal.tsx` for group selection UI
3. Add `formatDateBG()` calls to all date displays
4. Create `GroupStatusBadge` component
5. Add "Close Active Group" to ToolsPage
6. Update export/import to include group metadata
7. Build and test all workflows
8. Test with real data scenarios

## 📝 NOTES

- Keep backward compatibility with existing data via migrations
- Offline-first behavior preserved
- Manual group override stored in `manualGroup` field
- Auto-promotion happens when closing active group
