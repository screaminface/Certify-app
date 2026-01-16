import { v4 as uuidv4 } from 'uuid';
import { db, Group } from '../db/database';
import { computeCourseDates } from './dateUtils';
import { formatUniqueNumber } from './uniqueNumberUtils';

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
export async function generateUniqueNumbersForGroup(courseStartDate: string): Promise<void> {
  // Get all participants in this period that need unique numbers
  const participants = await db.participants
    .where('courseStartDate')
    .equals(courseStartDate)
    .toArray();
  
  const participantsNeedingNumbers = participants.filter(p => !p.uniqueNumber);
  if (participantsNeedingNumbers.length === 0) return;
  
  // Get all existing unique numbers from ALL participants
  const allParticipants = await db.participants.toArray();
  const existingNumbersSet = new Set(
    allParticipants
      .map(p => p.uniqueNumber)
      .filter(n => n)
  );
  
  // Generate sequential unique numbers for all participants in batch
  let prefix = 3531;
  let seq = 1;
  const assignedNumbers: { participantId: string; uniqueNumber: string }[] = [];
  
  for (const participant of participantsNeedingNumbers) {
    // Find next available number
    while (true) {
      const candidateNumber = formatUniqueNumber(prefix, seq);
      
      // Check if not in existing set AND not already assigned in this batch
      if (!existingNumbersSet.has(candidateNumber) && 
          !assignedNumbers.some(a => a.uniqueNumber === candidateNumber)) {
        assignedNumbers.push({
          participantId: participant.id!,
          uniqueNumber: candidateNumber
        });
        break;
      }
      
      prefix++;
      seq++;
      
      if (prefix > 9999) {
        throw new Error('Could not generate unique numbers - sequence exhausted');
      }
    }
    
    prefix++;
    seq++;
  }
  
  // Update all participants with their new unique numbers
  for (const assignment of assignedNumbers) {
    await db.participants.update(assignment.participantId, {
      uniqueNumber: assignment.uniqueNumber
    });
  }
  
  // Update settings with the last used prefix/seq
  if (assignedNumbers.length > 0) {
    await db.settings.update(1, {
      lastUniquePrefix: prefix - 1,
      lastUniqueSeq: seq - 1
    });
  }
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
 * Get suggested group for a courseStartDate
 * Returns active group if it matches AND is not completed, or finds/creates planned group
 * NEVER returns a completed group
 */
export async function getSuggestedGroup(courseStartDate: string): Promise<{ group: Group | null; shouldCreate: boolean }> {
  // Check if active group matches AND is not completed
  const activeGroup = await getActiveGroup();
  if (activeGroup && activeGroup.courseStartDate === courseStartDate && activeGroup.status !== 'completed') {
    return { group: activeGroup, shouldCreate: false };
  }
  
  // Check if planned group exists for this date
  const plannedGroup = await db.groups
    .where('courseStartDate')
    .equals(courseStartDate)
    .and(g => g.status === 'planned')
    .first();
    
  if (plannedGroup) {
    return { group: plannedGroup, shouldCreate: false };
  }
  
  // No suitable group exists - should create planned group
  // This happens when:
  // 1. No active group exists
  // 2. Active group exists but has different date
  // 3. Active group is completed (archived)
  return { group: null, shouldCreate: true };
}

/**
 * Create a new group (planned by default)
 * Planned groups do NOT get groupNumber - it's assigned when activated
 */
export async function createGroup(courseStartDate: string, status: 'active' | 'planned' = 'planned'): Promise<Group> {
  let groupNumber: number | null = null;
  
  // Only assign groupNumber for active groups
  // Planned groups get null (assigned when activated)
  if (status === 'active') {
    const allGroups = await db.groups.toArray();
    const existingNumbers = allGroups
      .map(g => g.groupNumber)
      .filter((n): n is number => n !== null);
    const maxGroupNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    groupNumber = maxGroupNumber + 1;
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
  
  // Mark active group as completed (archived) and locked
  await db.groups.update(activeGroup.id, {
    status: 'completed',
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
 * @deprecated NO LONGER NEEDED - Participants no longer have autoGroup/groupNumber
 * Participants are now identified by courseStartDate only
 * 
 * Recalculate all auto groups and sync with current workflow
 * This maintains sequential group numbers
 */
export async function recalculateAllAutoGroups(): Promise<number> {
  // This function is no longer needed but kept for backward compatibility
  return 0;
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
  const now = new Date().toISOString();
  
  // 1. Fix Active groups with missing groupNumber
  const activeGroup = allGroups.find(g => g.status === 'active');
  if (activeGroup && (activeGroup.groupNumber === null || activeGroup.groupNumber === undefined)) {
    console.warn(`⚠️ Active Group found without number! Fixing...`);
    
    // Calculate new number
    const existingNumbers = allGroups
      .map(g => g.groupNumber)
      .filter((n): n is number => n !== null && n !== undefined);
    const maxGroupNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    const newNumber = maxGroupNumber + 1;
    
    await db.groups.update(activeGroup.id, {
      groupNumber: newNumber,
      updatedAt: now
    });
    console.log(`✅ Fixed Active Group: Assigned number ${newNumber}`);
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
    // Use dateUtils logic (importing logic manually here to avoid dependency cycle if any)
    const dayOfWeek = today.getDay(); 
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    baseDate = new Date(today);
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
  
  // 4. Cleanup ONLY old empty planned groups (not required ones)
  // Refresh groups list
  const refreshedGroups = await db.groups.toArray();
  const participantCounts = new Map<string, number>();
  allParticipants.forEach(p => {
    participantCounts.set(p.courseStartDate, (participantCounts.get(p.courseStartDate) || 0) + 1);
  });

  for (const group of refreshedGroups) {
    // Only cleanup PLANNED groups
    if (group.status !== 'planned') continue;
    
    // Don't delete if it has participants
    if ((participantCounts.get(group.courseStartDate) || 0) > 0) continue;
    
    // Don't delete if it is one of our required future periods
    if (requiredPeriods.has(group.courseStartDate)) continue;
    
    // If we are here, it's an empty planned group that is NOT in the immediate future
    // Safe to delete (e.g. was created for a participant who moved dates, or is old)
    console.log(`Cleaning up old empty planned group: ${group.courseStartDate}`);
    await db.groups.delete(group.id);
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
 * Legacy function - replaced by syncGroups
 * @deprecated Use syncGroups instead
 */
export async function cleanupEmptyGroups(): Promise<number> {
  await syncGroups();
  return 0;
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
    }
  }
  
  // Assign groupNumber if this is a planned group being activated
  let groupNumber = group.groupNumber;
  if (group.status === 'planned' && groupNumber === null) {
    // Get next available groupNumber
    const allGroups = await db.groups.toArray();
    const existingNumbers = allGroups
      .map(g => g.groupNumber)
      .filter((n): n is number => n !== null);
    const maxGroupNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    groupNumber = maxGroupNumber + 1;
  }
  
  // Activate the selected group
  await db.groups.update(groupId, {
    groupNumber, // Assign number if it was null
    status: 'active',
    activatedAt: now,
    updatedAt: now,
    isLocked: false // Unlock if it was locked (for reopening archived)
  });
  
  // Generate unique numbers for participants in this period
  await generateUniqueNumbersForGroup(group.courseStartDate);
  
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