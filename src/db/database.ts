import Dexie, { Table } from 'dexie';

export interface Group {
  id: string;
  groupNumber: number;
  courseStartDate: string; // ISO date string
  courseEndDate: string; // ISO date string
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
  courseStartDate: string; // ISO date string
  courseEndDate: string; // ISO date string
  groupNumber: number; // Effective group (manualGroup ?? autoGroup)
  autoGroup: number; // Automatically calculated group based on courseStart
  manualGroup: number | null; // Manual override, null if not overridden
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
  }
}

export const db = new AppDatabase();

// Initialize settings if not exists
export async function initializeSettings() {
  const count = await db.settings.count();
  if (count === 0) {
    await db.settings.add({
      id: 1,
      lastUniquePrefix: 3530,
      lastUniqueSeq: 0,
      lastResetYear: null
    });
  }
}

// Call on app start
initializeSettings();
