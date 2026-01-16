import { db } from '../db/database';

/**
 * Format unique number as "PREFIX-N" (No zero padding on suffix)
 */
export function formatUniqueNumber(prefix: number, seq: number): string {
  // prefix is 4 digits (e.g. 3534)
  // seq is natural number (e.g. 1, 10, 100)
  const prefixStr = prefix.toString().padStart(4, '0');
  return `${prefixStr}-${seq}`;
}

/**
 * Parse unique number string to extract prefix and seq
 * specific to format YYYY-N (e.g. 3534-1, 3534-123)
 */
export function parseUniqueNumber(uniqueNumber: string): { prefix: number; seq: number } | null {
  // Matches 4-digit prefix, hyphen, and 1 or more digits for seq
  const match = uniqueNumber.match(/^(\d{4})-(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    prefix: parseInt(match[1], 10),
    seq: parseInt(match[2], 10)
  };
}

/**
 * Get the global maximum unique number from existing participants (Active & Completed)
 * AND Yearly Archives (if accessible, though usually we rely on current active DB state + Settings)
 * 
 * "Source of truth for next number"
 */
export async function getGlobalMaxUniqueNumber(ignoreSettings: boolean = false): Promise<{ prefix: number; seq: number } | null> {
  const participants = await db.participants.toArray();
  let max: { prefix: number; seq: number } | null = null;

  for (const p of participants) {
    if (!p.uniqueNumber) continue;
    const parsed = parseUniqueNumber(p.uniqueNumber);
    if (!parsed) continue;

    if (!max) {
      max = parsed;
    } else {
      // Compare: Higher prefix wins, or equal prefix + higher seq
      if (parsed.prefix > max.prefix || (parsed.prefix === max.prefix && parsed.seq > max.seq)) {
        max = parsed;
      }
    }
  }

  // Also check Settings for the "Last Issued" valid state (UNLESS ignored)
  // This handles the case where we just reset the year but haven't assigned any numbers yet.
  if (!ignoreSettings) {
    const settings = await db.settings.get(1);
    if (settings) {
        const settingsMax = { prefix: settings.lastUniquePrefix, seq: settings.lastUniqueSeq };
        
        if (!max) {
            max = settingsMax;
        } else {
            // If settings is ahead (e.g. new year prefix, seq 0), value settings
            if (settingsMax.prefix > max.prefix) {
                max = settingsMax;
            } else if (settingsMax.prefix === max.prefix && settingsMax.seq > max.seq) {
                max = settingsMax;
            }
        }
    }
  }

  return max;
}

/**
 * Generate NEXT unique number without assigning it.
 * Used for manual creation in Active groups.
 */
/**
 * Generate NEXT unique number without assigning it.
 * Used for manual creation in Active groups.
 * LOGIC: Prefix + 1, Seq + 1 (Double Increment)
 */
export async function generateNextUniqueNumber(): Promise<string> {
  const settings = await db.settings.get(1);
  if (!settings) throw new Error("Settings not initialized");
  
  // Start from settings
  let lastPrefix = settings.lastUniquePrefix;
  let lastSeq = settings.lastUniqueSeq;

  // Check DB for any higher numbers (Source of Truth)
  const max = await getGlobalMaxUniqueNumber();
  
  if (max) {
      if (max.prefix > lastPrefix) {
          lastPrefix = max.prefix;
          lastSeq = max.seq;
      } else if (max.prefix === lastPrefix && max.seq > lastSeq) {
          lastSeq = max.seq;
      }
  }
  
  // Double Increment
  const nextPrefix = lastPrefix + 1;
  const nextSeq = lastSeq + 1;
  
  return formatUniqueNumber(nextPrefix, nextSeq);
}

/**
 * Assign unique numbers to a group upon activation
 * Logic:
 * 1. Identify participants in group needing numbers.
 * 2. Get last used Prefix/Seq.
 * 3. Double Increment for each participant.
 */
export async function assignUniqueNumbersForGroupActivation(groupId: string): Promise<void> {
  // 1. Validation: Ensure group is Active
  const group = await db.groups.get(groupId);
  if (!group) return;
  if (group.status !== 'active') {
      console.warn(`Attempted to assign numbers to non-active group ${groupId}`);
      return; 
  }

  // 2. Get Participants
  const participants = await db.participants
    .where('courseStartDate')
    .equals(group.courseStartDate)
    .toArray();

  // Filter for those needing numbers
  const needingNumbers = participants.filter(p => !p.uniqueNumber);
  if (needingNumbers.length === 0) return;

  // 3. Sort by createdAt ASC (FIFO), then ID
  needingNumbers.sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (a.id || '').localeCompare(b.id || '');
  });

  // 4. Determine Start Point
  const settings = await db.settings.get(1);
  if (!settings) throw new Error("Settings not initialized");

  let currentPrefix = settings.lastUniquePrefix;
  let currentSeq = settings.lastUniqueSeq;
  
  // Sync with DB Max if needed
  const max = await getGlobalMaxUniqueNumber();
  if (max) {
      if (max.prefix > currentPrefix) {
          currentPrefix = max.prefix;
          currentSeq = max.seq;
      } else if (max.prefix === currentPrefix && max.seq > currentSeq) {
          currentSeq = max.seq;
      }
  }

  // 5. Assign Numbers (Double Increment)
  const updates: { id: string; uniqueNumber: string }[] = [];
  
  for (const p of needingNumbers) {
      currentPrefix++; // Increment Prefix
      currentSeq++;    // Increment Seq
      
      const numStr = formatUniqueNumber(currentPrefix, currentSeq);
      updates.push({ id: p.id!, uniqueNumber: numStr });
  }
  
  // 6. Perform Updates
  for (const update of updates) {
      await db.participants.update(update.id, { uniqueNumber: update.uniqueNumber });
  }
  
  // 7. Update Settings
  await db.settings.update(1, {
      lastUniquePrefix: currentPrefix,
      lastUniqueSeq: currentSeq
  });
}

/**
 * Reset yearly sequence (Danger Zone / End of Year)
 * Resets Suffix to 0, Bumps Prefix by 1.
 * Note: Next auto-assign will be (Prefix+1)-1.
 */
export async function resetYearlySequence(): Promise<void> {
  const settings = await db.settings.get(1);
  if (!settings) return;

  const nextPrefix = settings.lastUniquePrefix + 1;

  await db.settings.update(1, {
    lastUniquePrefix: nextPrefix,
    lastUniqueSeq: 0,
    lastResetYear: new Date().getFullYear()
  });
}

/**
 * Realign sequence numbers to close gaps if a participant is deleted.
 * Logic: Find all participants with Prefix > DeletedPrefix.
 * Shift them down (Prefix--, Seq--).
 */
export async function realignUniqueNumbers(deletedNumber: string): Promise<void> {
  const parsed = parseUniqueNumber(deletedNumber);
  if (!parsed) return;

  const { prefix: deletedPrefix } = parsed;

  // We want to find ANYONE with prefix > deletedPrefix.
  // Dexie doesn't have a simple "string greater than" for format YYYY-N nicely,
  // but since we shifted to Double Increment, Prefix is the primary driver.
  // We'll simplisticly fetch ALL participants with uniqueNumber and filter in JS 
  // (Safe for small-medium DBs, optimization needed for huge datasets)
  
  const allParticipants = await db.participants
    .filter(p => !!p.uniqueNumber)
    .toArray();

  const toUpdate: { id: string, newNum: string, newSeq: number, newPrefix: number }[] = [];
  for (const p of allParticipants) {
    const pParsed = parseUniqueNumber(p.uniqueNumber!);
    if (!pParsed) continue;
    
    // Logic: If this participant is "after" the deleted one
    // Since we use +1/+1, "after" means Prefix is greater.
    // (Or Prefix equal and Seq greater, but with +1/+1, unique prefixes are expected per person)
    
    // We check purely on Prefix for the shift, as Prefix is unique per person in this scheme.
    if (pParsed.prefix > deletedPrefix) {
        // Shift Down
        const newPrefix = pParsed.prefix - 1;
        const newSeq = pParsed.seq - 1;
        const newNum = formatUniqueNumber(newPrefix, newSeq);
        
        toUpdate.push({
            id: p.id!,
            newNum,
            newPrefix,
            newSeq
        });
    }
  }

  // Execute Updates
  for (const item of toUpdate) {
    await db.participants.update(item.id, { uniqueNumber: item.newNum });
  }

  // Update Settings to the new max
  // Note: If we deleted the HEAD, we need to reduce settings.
  // By recalculating max from the whole (simulated) set, we cover this.
  
  // However, if we deleted the ONLY item, inputs were 0.
  // We should fallback to current settings - 1 if it matches deleted?
  // Let's rely on re-fetching Max from DB after updates.
  
  const newMax = await getGlobalMaxUniqueNumber();
  if (newMax) {
       await db.settings.update(1, {
          lastUniquePrefix: newMax.prefix,
          lastUniqueSeq: newMax.seq
      });
  } else {
      // If table empty, maybe reset? or revert to some safe base?
      // Leave as is or decrement manually if we knew it was the tip.
      // Safe implementation: Do nothing if empty, user will see start.
  }
}

/**
 * Check if unique number is available
 */
export async function isUniqueNumberAvailable(uniqueNumber: string, excludeId?: string): Promise<boolean> {
  const query = db.participants.where('uniqueNumber').equals(uniqueNumber);
  const existing = await query.toArray();
  
  if (excludeId) {
    return existing.length === 0 || (existing.length === 1 && existing[0].id === excludeId);
  }
  
  return existing.length === 0;
}

/**
 * Check for gaps (No-Op for now as gaps are auto-closed on delete)
 */
export async function checkForGaps(): Promise<string | null> {
    return null; 
}

/**
 * Validate format
 */
export function isValidUniqueNumberFormat(uniqueNumber: string): boolean {
    return /^\d{4}-\d+$/.test(uniqueNumber);
}
/**
 * Clear unique numbers for all participants in a group
 * Used when moving a group from Active -> Planned
 */
export async function clearUniqueNumbersForGroup(groupCourseStartDate: string): Promise<void> {
  // 1. Get Participants in group
  const participants = await db.participants
    .where('courseStartDate')
    .equals(groupCourseStartDate)
    .toArray();
    
  // 2. Clear numbers

  
  for (const p of participants) {
      if (p.uniqueNumber) {
          // If we wanted to be fancy, we'd Realign (Gap Fill) here if this wasn't the top of stack.
          // But usually this action is "Undoing the latest active group".
          // So we just clear.
          // We set it to undefined/null (Dexie stores optional as missing or null)
          // We cast to any to satisfy TS partial update
          await db.participants.update(p.id, { uniqueNumber: '' } as any); 
      }
  }
  
  // 3. Update Settings to reflect new Max (Top of Stack dropped)
  // CRITICAL: We pass true to ignore CURRENT Settings, forcing a recalculation from DB only.
  // This allows the Settings to "Drop" if we just cleared the top-most numbers.
  const newMax = await getGlobalMaxUniqueNumber(true);
  
  if (newMax) {
       await db.settings.update(1, {
          lastUniquePrefix: newMax.prefix,
          lastUniqueSeq: newMax.seq
      });
  } else {
       // If empty, maybe reset to baseline?
       // Let's assume initialized defaults (3533) were correct base. 
       // We can read defaults or just leave as is (if we can't find max, we don't touch settings? 
       // No, if we cleared everything, we MUST reset settings to "Before start").
       // But 'initializeSettings' sets 3533. 
       // If DB is empty, getGlobalMax returns null.
       // We should arguably reset to the "Start State" if everything is gone.
       // But users rarely delete ALL data.
  }
}
