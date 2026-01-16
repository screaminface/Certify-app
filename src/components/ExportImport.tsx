import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { db, Participant, Group, Settings } from '../db/database';
import { useSettings } from '../hooks/useSettings';
import { isUniqueNumberAvailable } from '../utils/uniqueNumberUtils';

interface ExportImportProps {
  filteredParticipants: Participant[];
}

interface BackupData {
  version: string;
  timestamp: string;
  participants: Participant[];
  groups: Group[];
  settings: Settings;
}

export const ExportImport: React.FC<ExportImportProps> = ({ filteredParticipants }) => {
  const { settings, resetYearlySequence } = useSettings();
  const [isImporting, setIsImporting] = useState(false);

  // Export full backup as JSON
  const handleExportJSON = async () => {
    try {
      const participants = await db.participants.toArray();
      const groups = await db.groups.toArray();
      const currentSettings = await db.settings.get(1);

      const backup: BackupData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        participants,
        groups,
        settings: currentSettings!
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `course-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export backup');
    }
  };

  // Import JSON - Merge mode
  const handleImportMerge = async (file: File) => {
    setIsImporting(true);
    try {
      const text = await file.text();
      const backup: BackupData = JSON.parse(text);

      // Import groups first
      for (const group of backup.groups) {
        const existing = await db.groups.get(group.id);
        if (existing) {
          await db.groups.update(group.id, group);
        } else {
          await db.groups.add(group);
        }
      }

      // Import participants with collision resolution
      for (const participant of backup.participants) {
        // Check if participant exists
        const existing = await db.participants.get(participant.id);
        
        if (existing) {
          // Update existing
          await db.participants.update(participant.id, participant);
        } else {
          // Add new - check for unique number collision
          let uniqueNumber = participant.uniqueNumber;
          let attempts = 0;
          
          while (!(await isUniqueNumberAvailable(uniqueNumber)) && attempts < 1000) {
            // Generate next number
            const currentSettings = await db.settings.get(1);
            if (currentSettings) {
              const newPrefix = currentSettings.lastUniquePrefix + 1;
              const newSeq = currentSettings.lastUniqueSeq + 1;
              uniqueNumber = `${newPrefix.toString().padStart(4, '0')}-${newSeq.toString().padStart(3, '0')}`;
              await db.settings.update(1, {
                lastUniquePrefix: newPrefix,
                lastUniqueSeq: newSeq
              });
            }
            attempts++;
          }

          await db.participants.add({
            ...participant,
            uniqueNumber
          });
        }
      }

      // Optionally update settings (be careful not to override current counters)
      // For now, we skip settings import to preserve current sequence

      alert(`Import successful! Imported ${backup.participants.length} participants and ${backup.groups.length} groups.`);
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Failed to import: ${(error as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Import JSON - Replace mode
  const handleImportReplace = async (file: File) => {
    if (!window.confirm('WARNING: This will DELETE ALL existing data and replace it with the imported data. Are you sure?')) {
      return;
    }

    setIsImporting(true);
    try {
      const text = await file.text();
      const backup: BackupData = JSON.parse(text);

      // Clear all tables
      await db.participants.clear();
      await db.groups.clear();

      // Import groups
      for (const group of backup.groups) {
        await db.groups.add(group);
      }

      // Import participants
      for (const participant of backup.participants) {
        await db.participants.add(participant);
      }

      // Import settings
      if (backup.settings) {
        await db.settings.update(1, backup.settings);
      }

      alert(`Import successful! Imported ${backup.participants.length} participants and ${backup.groups.length} groups.`);
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Failed to import: ${(error as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Export Excel for filtered view
  const handleExportExcel = () => {
    try {
      const data = filteredParticipants.map(p => ({
        'Company Name': p.companyName,
        'Person Name': p.personName,
        'Medical Date': p.medicalDate,
        'Course Start Date': p.courseStartDate,
        'Course End Date': p.courseEndDate,

        'Unique Number': p.uniqueNumber,
        'Sent': p.sent ? 'Yes' : 'No',
        'Documents': p.documents ? 'Yes' : 'No',
        'Handed Over': p.handedOver ? 'Yes' : 'No',
        'Paid': p.paid ? 'Yes' : 'No',
        'Completed': (p.completedOverride !== null ? p.completedOverride : p.completedComputed) ? 'Yes' : 'No'
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Participants');
      
      XLSX.writeFile(wb, `course-export-${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Excel export failed:', error);
      alert('Failed to export Excel file');
    }
  };

  // Export CSV for filtered view
  const handleExportCSV = () => {
    try {
      const headers = [
        'Company Name',
        'Person Name',
        'Medical Date',
        'Course Start Date',
        'Course End Date',

        'Unique Number',
        'Sent',
        'Documents',
        'Handed Over',
        'Paid',
        'Completed'
      ];

      const rows = filteredParticipants.map(p => [
        p.companyName,
        p.personName,
        p.medicalDate,
        p.courseStartDate,
        p.courseEndDate,

        p.uniqueNumber,
        p.sent ? 'Yes' : 'No',
        p.documents ? 'Yes' : 'No',
        p.handedOver ? 'Yes' : 'No',
        p.paid ? 'Yes' : 'No',
        (p.completedOverride !== null ? p.completedOverride : p.completedComputed) ? 'Yes' : 'No'
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `course-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV export failed:', error);
      alert('Failed to export CSV file');
    }
  };

  const handleResetSequence = async () => {
    if (window.confirm('Reset the unique number sequence for a new year? The sequence number will reset to 001 but the prefix will continue to increment.')) {
      try {
        await resetYearlySequence();
        alert('Sequence reset successfully! Next unique number will use sequence 001.');
      } catch (error) {
        console.error('Failed to reset sequence:', error);
        alert('Failed to reset sequence');
      }
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Export / Import</h3>
      
      <div className="space-y-4">
        {/* Settings Info */}
        {settings && (
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-700">
              <strong>Current Sequence:</strong> Prefix: {settings.lastUniquePrefix}, Seq: {settings.lastUniqueSeq}
              {settings.lastResetYear && (
                <span className="ml-2">(Last reset: {settings.lastResetYear})</span>
              )}
            </div>
            <button
              onClick={handleResetSequence}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800"
            >
              Reset Yearly Sequence
            </button>
          </div>
        )}

        {/* Export Section */}
        <div>
          <h4 className="font-medium text-gray-700 mb-2">Export Data</h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExportJSON}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Export Full Backup (JSON)
            </button>
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Export Filtered to Excel
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Export Filtered to CSV
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Filtered exports include only visible participants based on current filters.
          </p>
        </div>

        {/* Import Section */}
        <div>
          <h4 className="font-medium text-gray-700 mb-2">Import Data</h4>
          <div className="flex flex-wrap gap-2">
            <label className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 cursor-pointer">
              Import & Merge
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleImportMerge(e.target.files[0]);
                  }
                }}
                className="hidden"
                disabled={isImporting}
              />
            </label>
            <label className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer">
              Import & Replace All
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleImportReplace(e.target.files[0]);
                  }
                }}
                className="hidden"
                disabled={isImporting}
              />
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Merge: Updates existing records and adds new ones. Replace: Deletes all data first (destructive).
          </p>
          {isImporting && (
            <p className="text-sm text-blue-600 mt-2">Importing...</p>
          )}
        </div>
      </div>
    </div>
  );
};
