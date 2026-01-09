import { db } from '../db/database';

/**
 * Generate the next unique number
 * Format: "PREFIX-SEQ" where PREFIX increments by 1, SEQ increments by 1
 * Example: 3532-001 -> 3533-002 -> 3534-003
 * Reuses deleted numbers by finding the first available gap
 */
export async function generateNextUniqueNumber(): Promise<string> {
  const settings = await db.settings.get(1);
  if (!settings) {
    throw new Error('Settings not initialized');
  }

  // Get all existing unique numbers as a Set for fast lookup
  const participants = await db.participants.toArray();
  const existingNumbersSet = new Set(
    participants
      .map(p => p.uniqueNumber)
      .filter(n => n) // Remove empty/null
  );

  // Start from the beginning of the sequence
  // We'll check each number sequentially until we find a gap
  let prefix = 3531; // Starting prefix
  let seq = 1; // Starting sequence

  // Search for the first available number
  // Check up to a reasonable limit (e.g., 10000 numbers)
  for (let i = 0; i < 10000; i++) {
    const candidateNumber = formatUniqueNumber(prefix, seq);
    
    // If this number doesn't exist in the database, we found our gap!
    if (!existingNumbersSet.has(candidateNumber)) {
      // Update settings to remember the highest number we've used
      await db.settings.update(1, {
        lastUniquePrefix: prefix,
        lastUniqueSeq: seq
      });
      return candidateNumber;
    }
    
    // Increment for next iteration
    prefix++;
    seq++;
  }

  // Fallback (should never reach here in normal operation)
  throw new Error('Could not generate unique number - too many participants');
}

/**
 * Generate unique number for active group only
 * Priority: finds the lowest available number considering ONLY participants in the active group
 * Planned groups do NOT affect numbering
 */
export async function generateUniqueNumberForActiveGroup(): Promise<string> {
  const settings = await db.settings.get(1);
  if (!settings) {
    throw new Error('Settings not initialized');
  }

  // Get active group
  const activeGroup = await db.groups.where('status').equals('active').first();
  if (!activeGroup) {
    // No active group - use normal generation
    return generateNextUniqueNumber();
  }

  // Get ONLY participants in the active group
  const activeParticipants = await db.participants
    .where('groupNumber')
    .equals(activeGroup.groupNumber)
    .toArray();

  const activeNumbersSet = new Set(
    activeParticipants
      .map(p => p.uniqueNumber)
      .filter(n => n)
  );

  // Find the first available number in the sequence
  let prefix = 3531;
  let seq = 1;

  for (let i = 0; i < 10000; i++) {
    const candidateNumber = formatUniqueNumber(prefix, seq);
    
    // If not used in active group, we found it!
    if (!activeNumbersSet.has(candidateNumber)) {
      await db.settings.update(1, {
        lastUniquePrefix: prefix,
        lastUniqueSeq: seq
      });
      return candidateNumber;
    }
    
    prefix++;
    seq++;
  }

  throw new Error('Could not generate unique number - too many participants');
}

/**
 * Format unique number as "NNNN-NNN"
 */
export function formatUniqueNumber(prefix: number, seq: number): string {
  const prefixStr = prefix.toString().padStart(4, '0');
  const seqStr = seq.toString().padStart(3, '0');
  return `${prefixStr}-${seqStr}`;
}

/**
 * Parse unique number string to extract prefix and seq
 */
export function parseUniqueNumber(uniqueNumber: string): { prefix: number; seq: number } | null {
  const match = uniqueNumber.match(/^(\d{4})-(\d{3})$/);
  if (!match) {
    return null;
  }
  return {
    prefix: parseInt(match[1], 10),
    seq: parseInt(match[2], 10)
  };
}

/**
 * Validate unique number format
 */
export function isValidUniqueNumberFormat(uniqueNumber: string): boolean {
  return /^\d{4}-\d{3}$/.test(uniqueNumber);
}

/**
 * Check if unique number is available (not already in use)
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
 * Check if there is a gap in the unique number sequence
 * Returns the first gap number if found, null otherwise
 */
export async function checkForGaps(): Promise<string | null> {
  const participants = await db.participants.toArray();
  const existingNumbers = participants
    .map(p => p.uniqueNumber)
    .filter(n => n)
    .sort();

  if (existingNumbers.length === 0) {
    return null;
  }

  // Get all numbers as a Set for fast lookup
  const existingNumbersSet = new Set(existingNumbers);

  // Find the maximum number to know our range
  const maxNumber = existingNumbers[existingNumbers.length - 1];
  const maxParsed = parseUniqueNumber(maxNumber);
  if (!maxParsed) return null;

  // Check from start (3531-001) to max number
  let prefix = 3531;
  let seq = 1;

  for (let i = 0; i < 10000; i++) {
    const candidateNumber = formatUniqueNumber(prefix, seq);
    
    // If we reached beyond the max number, no gaps
    if (prefix > maxParsed.prefix || (prefix === maxParsed.prefix && seq > maxParsed.seq)) {
      return null;
    }
    
    // Found a gap!
    if (!existingNumbersSet.has(candidateNumber)) {
      return candidateNumber;
    }
    
    prefix++;
    seq++;
  }

  return null;
}

/**
 * Reset yearly sequence
 * Sets lastUniqueSeq to 0, so next number will have seq=001
 * Prefix continues to increment
 */
export async function resetYearlySequence(): Promise<void> {
  const settings = await db.settings.get(1);
  if (!settings) {
    throw new Error('Settings not initialized');
  }

  await db.settings.update(1, {
    lastUniqueSeq: 0,
    lastResetYear: new Date().getFullYear()
  });
}
