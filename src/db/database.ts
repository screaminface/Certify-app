import Dexie, { Table } from 'dexie';

export interface Group {
  id: string;
  groupNumber: number | null; // null for planned groups, assigned only when activated
  courseStartDate: string; // ISO date string (Monday)
  courseEndDate: string; // ISO date string (next Monday, +7 days)
  status: 'active' | 'planned' | 'completed';
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  activatedAt?: string; // ISO timestamp - when group became active
  closedAt?: string; // ISO timestamp - when group was completed
  isLocked: boolean; // Lock/unlock for completed groups (default true for completed)
}

export interface Participant {
  id: string;
  companyName: string;
  personName: string;
  egn: string; // EGN number (as string to preserve leading zeros)
  birthPlace: string; // Birth place (city/village)
  citizenship: string; // Default: "българско"
  medicalDate: string; // ISO date string
  courseStartDate: string; // ISO date string (Monday) - identifies which period/group
  courseEndDate: string; // ISO date string (next Monday, +7 days)
  uniqueNumber: string; // format "NNNN-NNN"
  sent: boolean;
  documents: boolean;
  handedOver: boolean;
  paid: boolean;
  completedOverride: boolean | null;
  completedComputed: boolean; // derived field
  createdAt: string; // ISO timestamp - when participant was created
  updatedAt: string; // ISO timestamp - last modification
  completedAt?: string; // ISO timestamp - when participant became completed (optional, kept even if uncompleted for audit)
}

export interface Settings {
  id: number; // always 1 (single row)
  lastUniquePrefix: number;
  lastUniqueSeq: number;
  lastResetYear: number | null;
}

export interface YearlyArchive {
  id: string; // format: "archive-YYYY"
  year: number;
  groups: Group[];
  participants: Participant[];
  archivedAt: string; // ISO timestamp
}

export class AppDatabase extends Dexie {
  groups!: Table<Group, string>;
  participants!: Table<Participant, string>;
  settings!: Table<Settings, number>;
  yearlyArchives!: Table<YearlyArchive, string>;

  constructor() {
    super('CourseManagementDB');
    
    this.version(1).stores({
      groups: 'id, groupNumber, courseStartDate',
      participants: 'id, groupNumber, uniqueNumber, companyName, personName, courseStartDate',
      settings: 'id'
    });

    // Version 2: Add autoGroup and manualGroup fields
    this.version(2).stores({
      groups: 'id, groupNumber, courseStartDate',
      participants: 'id, groupNumber, autoGroup, uniqueNumber, companyName, personName, courseStartDate',
      settings: 'id'
    }).upgrade(tx => {
      // Migrate existing participants: set autoGroup = groupNumber, manualGroup = null
      return tx.table('participants').toCollection().modify(participant => {
        participant.autoGroup = participant.groupNumber;
        participant.manualGroup = null;
      });
    });

    // Version 3: Add status, createdAt, updatedAt to groups
    this.version(3).stores({
      groups: 'id, groupNumber, courseStartDate, status',
      participants: 'id, groupNumber, autoGroup, uniqueNumber, companyName, personName, courseStartDate',
      settings: 'id'
    }).upgrade(tx => {
      // Migrate existing groups: set status based on logic, add timestamps
      const now = new Date().toISOString();
      return tx.table('groups').toCollection().modify(group => {
        // Set first group as active, rest as planned
        group.status = group.groupNumber === 1 ? 'active' : 'planned';
        group.createdAt = now;
        group.updatedAt = now;
      });
    });

    // Version 4: Add timestamps to participants and lock to groups
    this.version(4).stores({
      groups: 'id, groupNumber, courseStartDate, status',
      participants: 'id, groupNumber, autoGroup, uniqueNumber, companyName, personName, courseStartDate',
      settings: 'id'
    }).upgrade(tx => {
      const now = new Date().toISOString();
      // Add timestamps to participants
      tx.table('participants').toCollection().modify(participant => {
        participant.createdAt = participant.createdAt || now;
        participant.updatedAt = participant.updatedAt || now;
        // completedAt is optional, only set if already completed
        if (participant.completedComputed || participant.completedOverride === true) {
          participant.completedAt = participant.completedAt || now;
        }
      });
      // Add isLocked to groups (completed groups are locked by default)
      tx.table('groups').toCollection().modify(group => {
        group.isLocked = group.status === 'completed';
      });
    });

    // Version 5: Add yearly archives table
    this.version(5).stores({
      groups: 'id, groupNumber, courseStartDate, status',
      participants: 'id, groupNumber, autoGroup, uniqueNumber, companyName, personName, courseStartDate',
      settings: 'id',
      yearlyArchives: 'id, year'
    });

    // Version 6: Add egn, birthPlace, citizenship fields to participants
    this.version(6).stores({
      groups: 'id, groupNumber, courseStartDate, status',
      participants: 'id, groupNumber, autoGroup, uniqueNumber, companyName, personName, courseStartDate, egn',
      settings: 'id',
      yearlyArchives: 'id, year'
    }).upgrade(tx => {
      // Add default values for new fields
      return tx.table('participants').toCollection().modify(participant => {
        participant.egn = participant.egn || '';
        participant.birthPlace = participant.birthPlace || '';
        participant.citizenship = participant.citizenship || 'българско';
      });
    });

    // Version 7: Major refactoring - remove groupNumber from participants, make it nullable for planned groups
    this.version(7).stores({
      groups: 'id, courseStartDate, status, groupNumber',
      participants: 'id, courseStartDate, uniqueNumber, companyName, personName, egn',
      settings: 'id',
      yearlyArchives: 'id, year'
    }).upgrade(async tx => {
      // Remove groupNumber, autoGroup, manualGroup from participants
      // Participants are now identified only by courseStartDate
      await tx.table('participants').toCollection().modify(participant => {
        delete participant.groupNumber;
        delete participant.autoGroup;
        delete participant.manualGroup;
      });
      
      // For planned groups, set groupNumber to null
      await tx.table('groups').toCollection().modify(group => {
        if (group.status === 'planned') {
          group.groupNumber = null;
        }
      });
    });
  }
}

export const db = new AppDatabase();

// Initialize settings if not exists
export async function initializeSettings() {
  try {
    const count = await db.settings.count();
    if (count === 0) {
      await db.settings.add({
        id: 1,
        lastUniquePrefix: 3533,
        lastUniqueSeq: 0,
        lastResetYear: null
      });
    }
  } catch (err) {
    console.error('Failed to initialize settings:', err);
    // If table doesn't exist, it might be due to broken schema or deletion.
    // We swallow the error here to allow ErrorBoundary to render options,
    // rather than crushing the JS thread.
  }
}

// Call on app start - safely
initializeSettings().catch(err => {
  console.error('CRITICAL DB INIT FAILURE:', err);
});
