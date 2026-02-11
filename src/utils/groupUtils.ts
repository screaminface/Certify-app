import { v4 as uuidv4 } from 'uuid';
import { db, Group } from '../db/database';
import { computeCourseDates } from './dateUtils';


/**
 * Get the active group (only one can be active at a time)
 */
export async function getActiveGroup(): Promise<Group | undefined> {
  return db.groups.where('status').equals('active').first();
}

/**
 * Generate unique numbers for all participants in a period/group
 * Used when planned group becomes active
 */
/**
 * Generate unique numbers for all participants in a period/group
 * Used when planned group becomes active
 * REFACTORED to use strict Global Max logic via assignUniqueNumbersForGroupActivation
 */
export async function generateUniqueNumbersForGroup(courseStartDate: string): Promise<void> {
  // Find group by date
  const group = await db.groups.where('courseStartDate').equals(courseStartDate).first();
  if (!group) return;

  const { assignUniqueNumbersForGroupActivation } = await import('./uniqueNumberUtils');
  await assignUniqueNumbersForGroupActivation(group.id);
}

/**
 * Sync group dates with its participants' earliest medical date
 */
export async function syncGroupDates(groupNumber: number): Promise<void> {
  const group = await db.groups.where('groupNumber').equals(groupNumber).first();
  if (!group) return;
  
  // Get all participants in this group
  const participants = await db.participants.where('groupNumber').equals(groupNumber).toArray();
  if (participants.length === 0) return;
  
  // Find earliest medical date
  const medicalDates = participants.map(p => p.medicalDate).sort();
  const earliestMedical = medicalDates[0];
  
  // Compute correct course dates
  const { courseStartDate, courseEndDate } = computeCourseDates(earliestMedical);
  
  // Update group if dates differ
  if (group.courseStartDate !== courseStartDate || group.courseEndDate !== courseEndDate) {
    await db.groups.update(group.id!, {
      courseStartDate,
      courseEndDate,
      updatedAt: new Date().toISOString()
    });
    
    // Also update all participants in this group
    for (const p of participants) {
      await db.participants.update(p.id!, {
        courseStartDate,
        courseEndDate
      });
    }
  }
}

/**
 * Get all planned groups sorted by courseStartDate
 */
export async function getPlannedGroups(): Promise<Group[]> {
  return db.groups.where('status').equals('planned').sortBy('courseStartDate');
}

/**
 * Get suggested group for a medicalDate
 * Smart Logic:
 * 1. Calculate strict start date (next Monday)
 * 2. If that group is completed, look for next available (Active/Planned) group
 * 3. Validate if medical date is still valid for the new candidate group (<= 6 months)
 */
/**
 * Get suggested group for a medicalDate
 * Strict Logic:
 * 1. Calculate strict start date (next Monday)
 * 2. Find group for that date.
 * 3. If Completed -> Return it (Caller blocks).
 * 4. If Active/Planned -> Return it.
 * 5. If None:
 *    - If date < ActiveGroup.date -> Return "Completed" stub (Block).
 *    - Else -> Suggest Creation.
 */
export async function getSuggestedGroup(medicalDate: string): Promise<{ group: Group | null; shouldCreate: boolean; createsForDate?: string }> {
  const { computeCourseDates } = await import('./dateUtils');
  const { isMedicalValidForCourse } = await import('./medicalValidation');
  
  // 1. Calculate strict start date
  const { courseStartDate } = computeCourseDates(medicalDate);
  
  // 2. Fetch ALL groups to avoid repeated queries
  // We need to check strict date, and potentially future dates
  const allGroups = await db.groups.toArray();
  const activeGroup = allGroups.find(g => g.status === 'active');
  const plannedGroups = allGroups.filter(g => g.status === 'planned').sort((a, b) => a.courseStartDate.localeCompare(b.courseStartDate));
  
  // PRIORITY CHECK: Try to assign to Active Group FIRST if medically valid
  // Logic: If medical date allows course to start on/before active group date, 
  // and medical is valid for active group (< 6 months), prefer active group
  if (activeGroup && courseStartDate <= activeGroup.courseStartDate) {
    // Medical allows for course starting on courseStartDate (strict monday)
    // Active group starts on/after that date
    // Check if medical is valid for active group (< 6 months from active start)
    if (isMedicalValidForCourse(medicalDate, activeGroup.courseStartDate)) {
      return { group: activeGroup, shouldCreate: false };
    }
  }
  
  // Check strict match first
  const strictMatchGroup = allGroups.find(g => g.courseStartDate === courseStartDate);

  // SCENARIO 1: Strict match exists and is COMPLETED (Archived)
  // User wants: "If archived, try to assign to first possible active/planned group"
  if (strictMatchGroup && strictMatchGroup.status === 'completed') {
       // Only fallback if medical date is still valid for next available group
       
       // Candidates: Active Group + All Planned Groups, sorted by date
       const candidates = [];
       if (activeGroup) candidates.push(activeGroup);
       candidates.push(...plannedGroups);
       // Sort by date to find nearest future one
       candidates.sort((a, b) => a.courseStartDate.localeCompare(b.courseStartDate));
       
       // Find first candidate that starts AFTER the strict date (or is the active one even if date mismatch? active might be future)
       // Actually, we just need ANY candidate that is valid for this medical date
       // And strictly, we prefer the 'next' one chronologically to fill gaps.
       
       const validCandidate = candidates.find(g => {
           // Must be chronologically >= strictDate (can't go back in time to an older active group if strict is newer? actually strict is closed, so active MUST be newer)
           if (g.courseStartDate < courseStartDate) return false; 
           
           // Must be medically valid
           return isMedicalValidForCourse(medicalDate, g.courseStartDate);
       });
       
       if (validCandidate) {
           return { group: validCandidate, shouldCreate: false };
       }
       
       // If no valid candidate found (e.g. all future groups are too far, or no future groups exist)
       // We MUST return the Completed group to trigger the BLOCK (Expired/Closed).
       // We do NOT auto-suggest creating a new group here because that might create a duplicate period or skip logic.
       // Although... if no planned groups exist, maybe we should suggest creating the next week?
       // But let's be safe: If strict is closed, and no existing open group fits... BLOCK.
       return { group: strictMatchGroup, shouldCreate: false };
  }

  // SCENARIO 2: Strict match exists and is Active/Planned
  if (strictMatchGroup) {
      return { group: strictMatchGroup, shouldCreate: false };
  }
  
  // SCENARIO 3: No group exists for strict date
  // Is it in the past relative to Active?
  if (activeGroup && courseStartDate < activeGroup.courseStartDate) {
      // Past & Empty -> Block as if completed
      return {
          group: {
              id: 'stub_past',
              status: 'completed',
              courseStartDate,
              courseEndDate: '', 
              groupNumber: -1,
              createdAt: '',
              updatedAt: '',
              isLocked: true
          } as Group,
          shouldCreate: false
      };
  }
  
  // SCENARIO 4: Future date, no group -> Create
  return { group: null, shouldCreate: true, createsForDate: courseStartDate };
}

/**
 * Create a new group (planned by default)
 * Planned groups do NOT get groupNumber - it's assigned when activated
 */
export async function createGroup(courseStartDate: string, status: 'active' | 'planned' = 'planned'): Promise<Group> {
  // CRITICAL: Check if group exists for this date regardless of status
  // A period must be UNIQUE.
  const existingGroup = await db.groups.where('courseStartDate').equals(courseStartDate).first();
  if (existingGroup) {
    if (existingGroup.status !== status && status === 'active') {
       // Only allow status upgrade if requested (e.g. planned -> active)
       // But normally this function is used for creation.
       // We should return the existing one to be safe and avoid duplicates.
       console.warn(`Group for ${courseStartDate} already exists with status ${existingGroup.status}. Returning existing.`);
       return existingGroup;
    }
    return existingGroup;
  }

  let groupNumber: number | null = null;
  
  // Only assign groupNumber for active groups
  // Planned groups get null (assigned when activated)
  if (status === 'active') {
    // Active groups generally don't have numbers until closed, but if we wanted to...
    // Per improved logic: Active groups start with NO number unless restored.
    groupNumber = null;
  }
  
  const courseEndDate = new Date(courseStartDate);
  courseEndDate.setDate(courseEndDate.getDate() + 7);
  
  const now = new Date().toISOString();
  
  const newGroup: Group = {
    id: uuidv4(),
    groupNumber, // null for planned, number for active
    courseStartDate,
    courseEndDate: courseEndDate.toISOString().split('T')[0],
    status,
    createdAt: now,
    updatedAt: now,
    isLocked: false
  };
  
  await db.groups.add(newGroup);
  return newGroup;
}

/**
 * Close/Archive the active group
 * Does NOT auto-activate next planned group
 */
export async function closeActiveGroup(): Promise<void> {
  const activeGroup = await getActiveGroup();
  if (!activeGroup) {
    throw new Error('No active group to close');
  }
  
  const now = new Date().toISOString();
  
  // Determine group number if not already set (re-closing a restored group keeps its number)
  let finalGroupNumber = activeGroup.groupNumber;
  
  if (finalGroupNumber === null || finalGroupNumber === undefined) {
    // Calculate new number: Find smallest missing positive integer (Gap) or use max + 1
    const completedGroups = await db.groups.where('status').equals('completed').toArray();
    const existingNumbers = new Set(
      completedGroups
        .map(g => g.groupNumber)
        .filter((n): n is number => n !== null && n !== undefined && n > 0)
    );
    
    let candidate = 1;
    while (existingNumbers.has(candidate)) {
      candidate++;
    }
    finalGroupNumber = candidate;
    console.log(`Assigning Group Number ${finalGroupNumber} to closed group (Gap filling/Next sequential)`);
  }

  // Mark active group as completed (archived) and locked
  await db.groups.update(activeGroup.id, {
    status: 'completed',
    groupNumber: finalGroupNumber,
    updatedAt: now,
    closedAt: now,
    isLocked: true
  });
  
  // NO automatic activation of next planned group
}

/**
 * Activate a planned group (make it the active group)
 * Closes current active group if exists
 */
export async function activateGroup(groupId: string): Promise<void> {
  const group = await db.groups.get(groupId);
  if (!group) {
    throw new Error('Group not found');
  }
  
  if (group.status !== 'planned') {
    throw new Error('Only planned groups can be activated');
  }
  
  const now = new Date().toISOString();
  
  // Close current active group if exists
  const activeGroup = await getActiveGroup();
  if (activeGroup) {
    await db.groups.update(activeGroup.id, {
      status: 'completed',
      updatedAt: now
    });
  }
  
  // Activate the selected group
  await db.groups.update(groupId, {
    status: 'active',
    updatedAt: now
  });
}

/**
 * Delete a group if it has no participants
 */
export async function deleteGroupIfEmpty(groupId: string): Promise<boolean> {
  const group = await db.groups.get(groupId);
  if (!group) return false;
  
  const participantCount = await db.participants
    .where('courseStartDate')
    .equals(group.courseStartDate)
    .count();
    
  if (participantCount === 0) {
    await db.groups.delete(groupId);
    return true;
  }
  
  return false;
}



/**
 * Sync groups table with current participants and maintain workflow states
 */
/**
 * Sync groups table with current participants and maintain workflow states
 * 1. Ensure Active group has a groupNumber (fix data integrity)
 * 2. Ensure groups exist for all participants
 * 3. Ensure next 2 Planned periods exist (even if empty)
 * 4. Cleanup old empty planned groups
 */
export async function syncGroups(): Promise<void> {
  const allParticipants = await db.participants.toArray();
  const allGroups = await db.groups.toArray();
  
  // 1. Fix Active groups - assign groupNumber if missing
  const activeGroup = allGroups.find(g => g.status === 'active');
  if (activeGroup && (activeGroup.groupNumber === null || activeGroup.groupNumber === undefined)) {
    // Find the next available group number (gap filling or max + 1)
    const existingNumbers = new Set(
      allGroups
        .map(g => g.groupNumber)
        .filter((n): n is number => n !== null && n !== undefined && n > 0)
    );
    
    let candidate = 1;
    while (existingNumbers.has(candidate)) {
      candidate++;
    }
    
    await db.groups.update(activeGroup.id, {
      groupNumber: candidate,
      updatedAt: new Date().toISOString()
    });
    console.log(`✅ Assigned Group Number ${candidate} to active group`);
  }

  // 1.1 Ensure participants in Active groups have unique numbers
  // This handles cases where a planned group became active 'accidentally' or without triggering number generation
  const activeGroupsAll = allGroups.filter(g => g.status === 'active');
  for (const g of activeGroupsAll) {
      await generateUniqueNumbersForGroup(g.courseStartDate);
  }
  

  
  // 1.2 Sanitize Group Dates (Fix local timezone bugs resulting in Sunday dates)
  // If any group starts on a non-Monday, shift it to Monday
  for (const g of allGroups) {
      const d = new Date(g.courseStartDate);
      // d is UTC midnight.
      // But g.courseStartDate string "2026-01-25" (Sunday)
      // d.getDay() for "2026-01-25" is 0 (Sunday).
      if (d.getDay() !== 1) {
          console.warn(`Found invalid group start date ${g.courseStartDate} (Day: ${d.getDay()}). Fixing to Monday.`);
          // Calculate correct Monday
          // We can use the logic from dateUtils, assuming strict ISO parsing
          // But simpler: just add days to get to Monday.
          // Sunday(0) -> +1
          // Tuesday(2) -> +6... wait, we usually want "Next Monday" or "Closest"?
          // For the bug "25.01" (Sunday) which should be "26.01" (Monday), it's +1.
          // If it was "24.01" (Saturday) -> +2.
          const day = d.getDay();
          const add = day === 0 ? 1 : (8 - day);
          
          const correctDate = new Date(d);
          correctDate.setDate(d.getDate() + add);
          const correctDateStr = correctDate.toISOString().split('T')[0];
          
          // Check if target exists to avoid collision? 
          // If 26.01 already exists, we should probably merge or just delete this one if empty?
          // But for now, let's just try to update. If collision, update might fail if ID unique? No, ID is primary.
          // But logic elsewhere relies on unique dates.
          // Let's just update perfectly. Duplicate resolution logic later in syncGroups (Step 4) handles mergers!
          await db.groups.update(g.id, {
             courseStartDate: correctDateStr,
             // Update End Date too
             courseEndDate: new Date(correctDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          });
          
          // Also update participants!
          const participantsInGroup = allParticipants.filter(p => p.courseStartDate === g.courseStartDate);
          for (const p of participantsInGroup) {
              await db.participants.update(p.id, {
                  courseStartDate: correctDateStr,
                  courseEndDate: new Date(correctDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
              });
          }
      }
  }
  
  // 2. Identify all required periods
  const requiredPeriods = new Set<string>();
  
  // A. Add periods from existing participants
  allParticipants.forEach(p => requiredPeriods.add(p.courseStartDate));
  
  // B. Add next 2 future periods based on current state
  // Base date is Active Group start OR current week
  let baseDate: Date;
  if (activeGroup) {
    baseDate = new Date(activeGroup.courseStartDate);
  } else {
    // Determine next Monday from today
    const today = new Date();
    const dayOfWeek = today.getDay(); 
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    baseDate = new Date(today);
    baseDate.setHours(12, 0, 0, 0); // Safe mid-day time to avoid UTC rollover at midnight
    baseDate.setDate(today.getDate() + daysUntilMonday);
    
    // If today is Monday, strict logic might define if we are "in" this week or "before"
    // For safety, let's treat next Monday as the first period
  }
  
  // Generate +1 and +2 weeks ahead needed
  const period1 = new Date(baseDate);
  period1.setDate(period1.getDate() + 7); // Next week
  
  const period2 = new Date(baseDate);
  period2.setDate(period2.getDate() + 14); // Week after next
  
  requiredPeriods.add(period1.toISOString().split('T')[0]);
  requiredPeriods.add(period2.toISOString().split('T')[0]);

  // 3. Ensure all required groups exist
  const existingPeriods = new Set(allGroups.map(g => g.courseStartDate));
  
  for (const date of requiredPeriods) {
    if (!existingPeriods.has(date)) {
      console.log(`Creating missing planned group for ${date}`);
      await createGroup(date, 'planned');
    }
  }
  
  // 4. Cleanup duplicates and old empty groups
  // REFRESH groups list because we might have added some
  const refreshedGroups = await db.groups.toArray();
  const participantCounts = new Map<string, number>();
  allParticipants.forEach(p => {
    participantCounts.set(p.courseStartDate, (participantCounts.get(p.courseStartDate) || 0) + 1);
  });

  // Group ALL groups by date to find duplicates (not just planned)
  const allGroupsByDate = new Map<string, Group[]>();
  refreshedGroups.forEach(g => {
    const list = allGroupsByDate.get(g.courseStartDate) || [];
    list.push(g);
    allGroupsByDate.set(g.courseStartDate, list);
  });

  // Process duplicates with MERGE logic
  for (const [date, groups] of allGroupsByDate) {
    if (groups.length > 1) {
      console.warn(`Found ${groups.length} duplicate groups for ${date}. Merging and cleaning up...`);
      
      // Determine winner: Completed > Active > Planned
      const sorted = groups.sort((a, b) => {
        const score = (g: Group) => {
          if (g.status === 'completed') return 3;
          if (g.status === 'active') return 2;
          return 1;
        };
        const sA = score(a);
        const sB = score(b);
        if (sA !== sB) return sB - sA; // Higher score first
        // Same score -> keep existing ID rules or createdAt 
        return 0; 
      });
      
      const winner = sorted[0];
      const losers = sorted.slice(1);
      
      // MERGE participants from losers to winner
      for (const loser of losers) {
        console.warn(`Merging participants from duplicate group ${loser.id} to ${winner.id}`);
        // Find participants linked to loser (by date - wait, participants link by date string, not ID!)
        // Since participants link by 'courseStartDate', and both loser/winner have SAME date,
        // the participants are ALREADY conceptually linked to both.
        // We just need to delete the loser group objects.
        // No explicit participant update needed unless we stored groupId (which we don't, we store courseStartDate).
        
        // Delete the loser group
        await db.groups.delete(loser.id);
      }
    }
  }
  
  // 5. Cleanup old planned groups BEFORE active group (if empty)
  // Planned groups in the past (before active group) with no participants should be removed
  const finalGroups = await db.groups.toArray();
  const currentActiveGroup = finalGroups.find(g => g.status === 'active');
  
  if (currentActiveGroup) {
    const oldPlannedGroups = finalGroups.filter(g => 
      g.status === 'planned' && 
      g.courseStartDate < currentActiveGroup.courseStartDate &&
      (participantCounts.get(g.courseStartDate) || 0) === 0
    );
    
    for (const oldGroup of oldPlannedGroups) {
      console.log(`Removing old empty planned group before active: ${oldGroup.courseStartDate}`);
      await db.groups.delete(oldGroup.id);
    }
  }
  
  // 6. Enforce Max 2 Planned Groups Rule (AFTER active group)
  // "Allow planned=2 rule to be soft if participants exist"
  // "Drop farthest unused"
  
  const finalRefreshedGroups = await db.groups.toArray();
  const plannedGroups = finalRefreshedGroups.filter(g => g.status === 'planned');
  
  if (plannedGroups.length > 2) {
    // We need to prune.
    // Identify used vs unused.
    const unusedPlanned = plannedGroups.filter(g => (participantCounts.get(g.courseStartDate) || 0) === 0);
    
    // Check total count
    let currentCount = plannedGroups.length;
    
    // Sort unused by date DESC (farthest first)
    // We prune farthest unused first.
    unusedPlanned.sort((a, b) => b.courseStartDate.localeCompare(a.courseStartDate));
    
    for (const group of unusedPlanned) {
      if (currentCount <= 2) break; // Reached limit
      
      // Verify strictness: "Drop farthest planned"
      // We are dropping unused ones.
      // Is there a case where we should keep a farthest unused?
      // "Planned groups should always be the next future Mondays"
      // So we prefer keeping T+1, T+2.
      // If we sort Descending, we drop T+5, T+4... leaving T+1, T+2 last.
      // This is exactly right.
      
      console.log(`Pruning excess empty planned group: ${group.courseStartDate}`);
      await db.groups.delete(group.id);
      currentCount--;
    }
    // If still > 2, it means we have > 2 USED groups. We keep them (Soft limit).
  }
}

/**
 * Get all groups ordered by group number
 */
export async function getAllGroups(): Promise<Group[]> {
  return db.groups.orderBy('groupNumber').toArray();
}

/**
 * Get a group by group number
 */
export async function getGroupByNumber(groupNumber: number): Promise<Group | undefined> {
  return db.groups.where('groupNumber').equals(groupNumber).first();
}

/**
 * Get group by courseStartDate
 */
export async function getGroupByCourseStart(courseStartDate: string): Promise<Group | undefined> {
  return db.groups.where('courseStartDate').equals(courseStartDate).first();
}

/**
 * Check if a group is read-only (completed and locked)
 */
export function isGroupReadOnly(group: Group | undefined): boolean {
  return group ? group.status === 'completed' && group.isLocked : false;
}

/**
 * Unlock a completed group to allow edits
 */
export async function unlockGroup(groupNumber: number): Promise<void> {
  const group = await db.groups.where('groupNumber').equals(groupNumber).first();
  if (!group) {
    throw new Error('Group not found');
  }
  
  if (group.status !== 'completed') {
    throw new Error('Only completed groups can be unlocked');
  }
  
  await db.groups.update(group.id, {
    isLocked: false,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Lock a completed group to prevent edits
 */
export async function lockGroup(groupNumber: number): Promise<void> {
  const group = await db.groups.where('groupNumber').equals(groupNumber).first();
  if (!group) {
    throw new Error('Group not found');
  }
  
  if (group.status !== 'completed') {
    throw new Error('Only completed groups can be locked');
  }
  
  await db.groups.update(group.id, {
    isLocked: true,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get all completed groups sorted by group number (most recent first)
 */
export async function getCompletedGroups(): Promise<Group[]> {
  return db.groups
    .where('status')
    .equals('completed')
    .reverse()
    .sortBy('groupNumber');
}



/**
 * Fix group dates based on participants' medical dates
 * Recalculates course start/end dates for a specific group
 */
export async function fixGroupDates(groupNumber: number): Promise<void> {
  const group = await db.groups.where('groupNumber').equals(groupNumber).first();
  if (!group) {
    throw new Error(`Group ${groupNumber} not found`);
  }

  // Get all participants in this group
  const participants = await db.participants
    .where('groupNumber')
    .equals(groupNumber)
    .toArray();

  if (participants.length === 0) {
    console.log(`Group ${groupNumber} has no participants, skipping`);
    return;
  }

  // Find earliest medical date to determine correct course start
  const medicalDates = participants.map(p => new Date(p.medicalDate));
  const earliestMedical = new Date(Math.min(...medicalDates.map(d => d.getTime())));

  // Import computeCourseDates
  const { computeCourseDates } = await import('./dateUtils');
  const correctDates = computeCourseDates(earliestMedical.toISOString().split('T')[0]);

  // Update group with correct dates
  await db.groups.update(group.id, {
    courseStartDate: correctDates.courseStartDate,
    courseEndDate: correctDates.courseEndDate,
    updatedAt: new Date().toISOString()
  });

  // Update all participants in this group
  for (const participant of participants) {
    await db.participants.update(participant.id, {
      courseStartDate: correctDates.courseStartDate,
      courseEndDate: correctDates.courseEndDate
    });
  }

  console.log(`✅ Fixed Group ${groupNumber}: ${correctDates.courseStartDate} - ${correctDates.courseEndDate}`);
}
/**
 * Make a planned group active
 * Returns true if successful, or object with currentActive if confirmation needed
 */
export async function makeGroupActive(groupId: string): Promise<{ success: boolean; needsConfirm?: boolean; currentActive?: Group }> {
  const group = await db.groups.get(groupId);
  if (!group) {
    throw new Error('Group not found');
  }
  
  if (group.status === 'active') {
    return { success: true }; // Already active
  }
  
  // Check if there's another active group
  const currentActive = await getActiveGroup();
  
  if (currentActive && currentActive.id !== groupId) {
    // Return info for confirmation dialog
    return {
      success: false,
      needsConfirm: true,
      currentActive
    };
  }
  
  // No conflict - proceed with activation
  return await activateGroupDirectly(groupId);
}

/**
 * Activate group directly (after confirmation or if no conflict)
 * If currentActiveId provided, move it to planned first
 * IMPORTANT: Assigns groupNumber when activating planned group
 */
export async function activateGroupDirectly(groupId: string, moveCurrentToPlanned: boolean = false): Promise<{ success: boolean }> {
  const group = await db.groups.get(groupId);
  if (!group) {
    throw new Error('Group not found');
  }
  
  const now = new Date().toISOString();
  
  // If requested, move current active to planned
  if (moveCurrentToPlanned) {
    const currentActive = await getActiveGroup();
    if (currentActive) {
      await db.groups.update(currentActive.id, {
        status: 'planned',
        updatedAt: now,
        activatedAt: undefined,
        groupNumber: null // Remove groupNumber when moving back to planned
      });
      // Clear unique numbers for participants in the group being deactivated
      const { clearUniqueNumbersForGroup } = await import('./uniqueNumberUtils');
      await clearUniqueNumbersForGroup(currentActive.courseStartDate);
    }
  }
  
  // Assign groupNumber if this is a planned group being activated
  let groupNumber = group.groupNumber;
  if (group.status === 'planned' && groupNumber === null) {
    // Find the next available group number (gap filling or max + 1)
    const existingGroups = await db.groups.toArray();
    const existingNumbers = new Set(
      existingGroups
        .map(g => g.groupNumber)
        .filter((n): n is number => n !== null && n !== undefined && n > 0)
    );
    
    let candidate = 1;
    while (existingNumbers.has(candidate)) {
      candidate++;
    }
    groupNumber = candidate;
    console.log(`Assigning Group Number ${groupNumber} to newly activated group`);
  }
  
  // Activate the selected group
  await db.groups.update(groupId, {
    groupNumber, // Assign number if it was null
    status: 'active',
    activatedAt: now,
    updatedAt: now,
    isLocked: false // Unlock if it was locked (for reopening archived)
  });
  
  // PRIMARY TRIGGER: Generate unique numbers for participants in this period
  // using the strict global sequence logic
  const { assignUniqueNumbersForGroupActivation } = await import('./uniqueNumberUtils');
  await assignUniqueNumbersForGroupActivation(groupId);
  
  return { success: true };
}

/**
 * Move active group back to planned
 */
export async function setActiveToPlanned(): Promise<void> {
  const activeGroup = await getActiveGroup();
  if (!activeGroup) {
    throw new Error('No active group to set as planned');
  }
  
  const now = new Date().toISOString();
  
  await db.groups.update(activeGroup.id, {
    status: 'planned',
    updatedAt: now,
    activatedAt: undefined
  });
  
  // Clear unique numbers
  const { clearUniqueNumbersForGroup } = await import('./uniqueNumberUtils');
  await clearUniqueNumbersForGroup(activeGroup.courseStartDate);
}

/**
 * Reopen an archived (completed) group for corrections
 * Returns confirmation info if another group is active
 */
export async function reopenArchivedGroup(groupId: string): Promise<{ success: boolean; needsConfirm?: boolean; currentActive?: Group }> {
  const group = await db.groups.get(groupId);
  if (!group) {
    throw new Error('Group not found');
  }
  
  if (group.status !== 'completed') {
    throw new Error('Only archived groups can be reopened');
  }
  
  // Check if there's another active group
  const currentActive = await getActiveGroup();
  
  if (currentActive) {
    // Return info for confirmation dialog
    return {
      success: false,
      needsConfirm: true,
      currentActive
    };
  }
  
  // No conflict - proceed with reopen
  return await activateGroupDirectly(groupId);
}

/**
 * Ensure only one active group exists (data integrity check)
 * Call on app startup
 */
export async function ensureSingleActiveGroup(): Promise<void> {
  const activeGroups = await db.groups.where('status').equals('active').toArray();
  
  if (activeGroups.length <= 1) {
    return; // OK
  }
  
  console.warn(`⚠️ Found ${activeGroups.length} active groups! Fixing...`);
  
  // Keep the most recently updated as active
  const sorted = activeGroups.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  
  const keepActive = sorted[0];
  const setToPlanned = sorted.slice(1);
  
  const now = new Date().toISOString();
  
  for (const group of setToPlanned) {
    await db.groups.update(group.id, {
      status: 'planned',
      updatedAt: now,
      activatedAt: undefined
    });
    console.warn(`⚠️ Moved Group ${group.groupNumber} from active to planned`);
  }
  
  console.log(`✅ Kept Group ${keepActive.groupNumber} as active`);
}