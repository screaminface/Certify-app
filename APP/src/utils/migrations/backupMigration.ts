/**
 * Backup Migration System
 * Handles migrating old backup data structures to the current application schema.
 * 
 * CORE PRINCIPLES:
 * 1. Sequential: Applies migrations one by one (v1 -> v2 -> v3).
 * 2. Atomic: If any step fails, the whole import fails.
 * 3. Pure: Migrations transform data without side effects.
 */

import { Participant, Group, Settings } from '../../db/database';

export const CURRENT_BACKUP_VERSION = 2; // INCREMENT THIS WHEN SCHEMA CHANGES

// -- Interfaces for specific backup versions --

// V1: The Schema before Version 2 (roughly corresponds to DB v6)
// It had 'groupNumber' on participants, which we removed in DB v7.
interface ParticipantV1 extends Omit<Participant, 'courseStartDate'> {
    groupNumber?: number; // Was present in V1
    autoGroup?: number;   // Was present in V1
    manualGroup?: number; // Was present in V1
    courseStartDate: string;
}

interface BackupV1 {
  version: 1;
  timestamp: string;
  participants: ParticipantV1[];
  groups: Group[];
  settings: Settings;
}

// V2: The Current Schema (DB v7+)
// Participants linked by courseStartDate only, planned groups have null groupNumber
export interface BackupV2 {
  version: 2;
  timestamp: string;
  participants: Participant[]; // Matches current DB interface
  groups: Group[];
  settings: Settings;
}

// Union type of all possible backup shapes

// -- Migration Functions --

/**
 * Migrates V1 data (with explicit group linking) to V2 (implicit date linking)
 */
function migrateV1toV2(data: BackupV1): BackupV2 {
  console.log('Migrating Backup: v1 -> v2');
  
  const migratedParticipants = data.participants.map(p => {
    // strict deep copy to avoid mutation issues
    const newP = { ...p };
    
    // Remove obsolete fields
    delete newP.groupNumber;
    delete newP.autoGroup;
    delete newP.manualGroup;

    return newP as Participant;
  });

  const migratedGroups = data.groups.map(g => {
     const newG = { ...g };
     // Ensure planned groups have null groupNumber (enforce v7 logic)
     if (newG.status === 'planned') {
         newG.groupNumber = null;
     }
     return newG;
  });

  return {
    ...data,
    version: 2,
    participants: migratedParticipants,
    groups: migratedGroups
  };
}


// -- Main Migration Runner --

export function migrateToLatest(rawData: any): BackupV2 {
  // 1. Identify Version (default to 1 if missing)
  let currentVersion = rawData.version || 1;
  let data = rawData;

  console.log(`Starting Import. Backup Version: ${currentVersion}. Current App Version: ${CURRENT_BACKUP_VERSION}`);

  // 2. Validate basic structure
  if (!data || typeof data !== 'object') {
     throw new Error('Invalid backup file: data is not an object.');
  }

  // 3. Safety Check: Don't downgrade
  if (currentVersion > CURRENT_BACKUP_VERSION) {
      throw new Error(`Backup version ${currentVersion} is newer than this app version (${CURRENT_BACKUP_VERSION}). Please update the app to import this file.`);
  }

  // 4. Run Sequential Migrations
  while (currentVersion < CURRENT_BACKUP_VERSION) {
      try {
          switch (currentVersion) {
              case 1:
                  data = migrateV1toV2(data as BackupV1);
                  currentVersion = 2;
                  break;
              // Future cases:
              // case 2: 
              //    data = migrateV2toV3(data as BackupV2);
              //    currentVersion = 3;
              //    break;
              default:
                  throw new Error(`No migration strategy found for version ${currentVersion}`);
          }
      } catch (err) {
          console.error(`Migration failed at step v${currentVersion}:`, err);
          throw new Error(`Migration failed: Could not upgrade backup from v${currentVersion} to v${currentVersion + 1}`);
      }
  }

  // 5. Final Validation (optional but recommended)
  // Ensure the final object matches our expected structure roughly
  if (!Array.isArray(data.participants) || !Array.isArray(data.groups)) {
      throw new Error('Migration finished but result is malformed (missing arrays).');
  }

  return data as BackupV2;
}
