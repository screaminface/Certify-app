import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { db, Participant, Group, Settings } from '../db/database';
import { useSettings } from '../hooks/useSettings';
import { isUniqueNumberAvailable } from '../utils/uniqueNumberUtils';
import { formatDateBG } from '../utils/medicalValidation';
import { 
  getActiveGroup, 
  closeActiveGroup, 
  getCompletedGroups,
  getPlannedGroups,
  makeGroupActive,
  activateGroupDirectly,
  setActiveToPlanned,
  reopenArchivedGroup
} from '../utils/groupUtils';
import { useLiveQuery } from 'dexie-react-hooks';
import { ConfirmModal } from './ui/ConfirmModal';
import { useLanguage } from '../contexts/LanguageContext';
import { Settings as SettingsIcon, Calendar, Users, CheckCircle, ChevronDown, Clock, RotateCcw, X, ChevronRight, Upload, Package, FileSpreadsheet, FileText, Download, AlertTriangle, Archive, AlertCircle, Info, Activity, CalendarClock } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';

interface ToolsPageProps {
  filteredParticipants: Participant[];
  onNavigateHome?: () => void;
}

interface BackupData {
  version: string;
  timestamp: string;
  participants: Participant[];
  groups: Group[];
  settings: Settings;
}

export const ToolsPage: React.FC<ToolsPageProps> = ({ filteredParticipants }) => {
  const { settings } = useSettings();
  const { language, setLanguage, t } = useLanguage();
  const [isImporting, setIsImporting] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);

  const [closeGroupAcknowledged, setCloseGroupAcknowledged] = useState(false);
  const [closeGroupConfirmText, setCloseGroupConfirmText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'makeActive' | 'reopen';
    groupId: string;
    groupNumber: number;
    currentActive: Group;
  } | null>(null);
  const [showAllArchived, setShowAllArchived] = useState(false);
  
  // Yearly Archive states
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveConfirmText, setArchiveConfirmText] = useState('');
  const [showArchiveViewer, setShowArchiveViewer] = useState(false);
  const [restoreGroup, setRestoreGroup] = useState<{ year: number; groupNumber: number } | null>(null);

  const activeGroup = useLiveQuery(() => getActiveGroup(), []);
  const plannedGroups = useLiveQuery(() => getPlannedGroups(), [refreshKey]);
  const completedGroups = useLiveQuery(() => getCompletedGroups(), [refreshKey]);
  const allParticipants = useLiveQuery(() => db.participants.toArray(), []);
  const yearlyArchives = useLiveQuery(() => db.yearlyArchives.toArray(), []);

  // Helper function for proper plural forms
  const getParticipantText = (count: number): string => {
    if (language === 'bg') {
      return count === 1 ? 'участник' : 'участници';
    }
    return count === 1 ? 'participant' : 'participants';
  };

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
        const existing = await db.participants.get(participant.id);
        
        if (existing) {
          await db.participants.update(participant.id, participant);
        } else {
          let uniqueNumber = participant.uniqueNumber;
          let attempts = 0;
          
          while (!(await isUniqueNumberAvailable(uniqueNumber)) && attempts < 1000) {
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

      await db.participants.clear();
      await db.groups.clear();

      for (const group of backup.groups) {
        await db.groups.add(group);
      }

      for (const participant of backup.participants) {
        await db.participants.add(participant);
      }

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

  // Export Excel
  const handleExportExcel = () => {
    try {
      const data = filteredParticipants.map(p => ({
        'Company Name': p.companyName,
        'Person Name': p.personName,
        'Medical Date': formatDateBG(p.medicalDate),
        'Course Start Date': formatDateBG(p.courseStartDate),
        'Course End Date': formatDateBG(p.courseEndDate),
        'Group Number': p.groupNumber,
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

  // Export CSV
  const handleExportCSV = () => {
    try {
      const headers = [
        'Company Name',
        'Person Name',
        'Medical Date',
        'Course Start Date',
        'Course End Date',
        'Group Number',
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
        formatDateBG(p.medicalDate),
        formatDateBG(p.courseStartDate),
        formatDateBG(p.courseEndDate),
        p.groupNumber,
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

  // Restore archived group back to active database
  const handleRestoreGroup = async (year: number, groupNumber: number) => {
    try {
      const archiveId = `archive-${year}`;
      const archive = await db.yearlyArchives.get(archiveId);
      
      if (!archive) {
        alert(t('tools.restoreGroupNotFound'));
        return;
      }
      
      // Find the group and its participants
      const groupToRestore = archive.groups.find(g => g.groupNumber === groupNumber);
      const participantsToRestore = archive.participants.filter(p => p.groupNumber === groupNumber);
      
      if (!groupToRestore) {
        alert(t('tools.restoreGroupGroupNotFound'));
        return;
      }
      
      // Check if group number already exists in active groups
      const existingGroup = await db.groups.where('groupNumber').equals(groupNumber).first();
      if (existingGroup) {
        alert(t('tools.restoreGroupExists', { number: groupNumber.toString() }));
        return;
      }
      
      // Restore group
      await db.groups.add({
        ...groupToRestore,
        updatedAt: new Date().toISOString()
      });
      
      // Restore participants
      for (const participant of participantsToRestore) {
        await db.participants.add(participant);
      }
      
      // Remove from archive
      const updatedGroups = archive.groups.filter(g => g.groupNumber !== groupNumber);
      const updatedParticipants = archive.participants.filter(p => p.groupNumber !== groupNumber);
      
      if (updatedGroups.length === 0) {
        // If no groups left, delete the entire archive
        await db.yearlyArchives.delete(archiveId);
      } else {
        // Update archive without this group
        await db.yearlyArchives.update(archiveId, {
          groups: updatedGroups,
          participants: updatedParticipants
        });
      }
      
      alert(t('tools.restoreGroupSuccess', { number: groupNumber.toString() }));
      setRestoreGroup(null);
    } catch (error) {
      console.error('Restore failed:', error);
      alert(t('tools.restoreGroupError', { error: (error as Error).message }));
    }
  };

  // Archive current year completed groups with STRICT GUARD
  const handleArchiveCurrentYear = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const groups = await db.groups.toArray();
      const participants = await db.participants.toArray();
      
      // STRICT GUARD: Check if there are any active or planned groups
      const hasActiveGroups = groups.some(g => g.status === 'active');
      const hasPlannedGroups = groups.some(g => g.status === 'planned');
      
      if (hasActiveGroups || hasPlannedGroups) {
        alert(t('tools.archiveGuardFail'));
        setShowArchiveModal(false);
        setArchiveConfirmText('');
        return;
      }
      
      // Get completed groups from current year
      const completedGroupsThisYear = groups.filter(g => {
        if (g.status !== 'completed') return false;
        const courseYear = new Date(g.courseStartDate).getFullYear();
        return courseYear === currentYear;
      });
      
      if (completedGroupsThisYear.length === 0) {
        alert(t('archive.noGroupsToArchive'));
        setShowArchiveModal(false);
        setArchiveConfirmText('');
        return;
      }
      
      const groupNumbers = new Set(completedGroupsThisYear.map(g => g.groupNumber));
      const participantsToArchive = participants.filter(p => groupNumbers.has(p.groupNumber));
      
      // Create archive entry
      const archiveId = `archive-${currentYear}`;
      await db.yearlyArchives.put({
        id: archiveId,
        year: currentYear,
        groups: completedGroupsThisYear,
        participants: participantsToArchive,
        archivedAt: new Date().toISOString()
      });
      
      // Delete from main tables
      await db.groups.bulkDelete(completedGroupsThisYear.map(g => g.id));
      await db.participants.bulkDelete(participantsToArchive.map(p => p.id));
      
      // Reset yearly sequence (increment prefix, reset sequence to 001)
      const currentSettings = await db.settings.get(1);
      if (currentSettings) {
        await db.settings.update(1, {
          lastUniquePrefix: currentSettings.lastUniquePrefix + 1,
          lastUniqueSeq: 0,
          lastResetYear: currentYear
        });
      }
      
      alert(t('tools.archiveYearSuccess', { count: completedGroupsThisYear.length.toString() }));
      setShowArchiveModal(false);
      setArchiveConfirmText('');
    } catch (error) {
      console.error('Archive failed:', error);
      alert(t('archive.error'));
    }
  };

  // Handle making a group active
  const handleMakeActive = async (groupId: string) => {
    try {
      const result = await makeGroupActive(groupId);
      
      if (result.needsConfirm && result.currentActive) {
        const group = await db.groups.get(groupId);
        if (group) {
          setConfirmAction({
            type: 'makeActive',
            groupId,
            groupNumber: group.groupNumber,
            currentActive: result.currentActive
          });
        }
      } else if (result.success) {
        setRefreshKey(prev => prev + 1);
        const group = await db.groups.get(groupId);
        if (group) {
          alert(t('tools.makeActiveSuccess', { number: group.groupNumber.toString() }));
        }
      }
    } catch (error) {
      alert(`${t('common.error')}: ${(error as Error).message}`);
    }
  };

  // Handle reopening archived group
  const handleReopenArchived = async (groupId: string) => {
    try {
      const result = await reopenArchivedGroup(groupId);
      
      if (result.needsConfirm && result.currentActive) {
        const group = await db.groups.get(groupId);
        if (group) {
          setConfirmAction({
            type: 'reopen',
            groupId,
            groupNumber: group.groupNumber,
            currentActive: result.currentActive
          });
        }
      } else if (result.success) {
        setRefreshKey(prev => prev + 1);
        alert(t('tools.reopenSuccess'));
      }
    } catch (error) {
      alert(`${t('common.error')}: ${(error as Error).message}`);
    }
  };

  // Confirm action - move current active to planned
  const confirmMoveCurrentToPlanned = async () => {
    if (!confirmAction) return;
    
    try {
      const oldGroupNumber = confirmAction.currentActive.groupNumber;
      const newGroupNumber = confirmAction.groupNumber;
      
      await activateGroupDirectly(confirmAction.groupId, true);
      setConfirmAction(null);
      setRefreshKey(prev => prev + 1);
      alert(t('tools.makeActiveWithSwapSuccess', { new: newGroupNumber.toString(), old: oldGroupNumber.toString() }));
    } catch (error) {
      alert(`${t('common.error')}: ${(error as Error).message}`);
    }
  };

  // Handle set active to planned
  const handleSetActiveToPlanned = async () => {
    if (!window.confirm(t('tools.returnToPlannedConfirm'))) {
      return;
    }
    
    try {
      await setActiveToPlanned();
      setRefreshKey(prev => prev + 1);
      alert(t('tools.returnToPlannedSuccess'));
    } catch (error) {
      alert(`${t('common.error')}: ${(error as Error).message}`);
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Language Switcher */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">{t('tools.language')}</h3>
        <div className="flex gap-3">
          <button
            onClick={() => setLanguage('en')}
            className={`flex-1 px-6 py-3 rounded-lg font-medium min-h-[48px] transition-colors duration-150 flex items-center justify-center gap-3 ${
              language === 'en'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ReactCountryFlag 
              countryCode="GB" 
              svg 
              style={{ width: '2em', height: '1.5em', borderRadius: '4px' }}
            />
            English
          </button>
          <button
            onClick={() => setLanguage('bg')}
            className={`flex-1 px-6 py-3 rounded-lg font-medium min-h-[48px] transition-colors duration-150 flex items-center justify-center gap-3 ${
              language === 'bg'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ReactCountryFlag 
              countryCode="BG" 
              svg 
              style={{ width: '2em', height: '1.5em', borderRadius: '4px' }}
            />
            Български
          </button>
        </div>
      </div>

      {/* Close Active Group Section */}
      {activeGroup && (
        <div className="bg-white p-6 rounded-lg shadow-sm border-2 border-blue-400">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" strokeWidth={2} />
              <h3 className="text-lg font-bold text-blue-700">{t('tools.activeGroup')}</h3>
            </div>
            <p className="text-sm text-blue-600 mt-0.5">{t('tools.activeGroupSubtitle')}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
            <div className="space-y-2 text-sm text-slate-700">
              <p><strong>{t('tools.groupNumber')}:</strong> {activeGroup.groupNumber}</p>
              <p><strong>{t('tools.courseStart')}:</strong> {formatDateBG(activeGroup.courseStartDate)}</p>
              <p><strong>{t('tools.courseEnd')}:</strong> {formatDateBG(activeGroup.courseEndDate)}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={closeGroupAcknowledged}
                onChange={(e) => setCloseGroupAcknowledged(e.target.checked)}
                className="mt-1 w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700 flex-1">
                {t('tools.closeGroupDescription')}
              </span>
            </label>

            {/* Type to confirm */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Type <code className="bg-slate-200 px-2 py-1 rounded">CLOSE-{activeGroup.groupNumber}</code> to confirm:
              </label>
              <input
                type="text"
                value={closeGroupConfirmText}
                onChange={(e) => setCloseGroupConfirmText(e.target.value)}
                placeholder={`CLOSE-${activeGroup.groupNumber}`}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                disabled={!closeGroupAcknowledged}
              />
            </div>

            {/* Close button */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleSetActiveToPlanned}
                className="px-6 py-4 bg-slate-600 text-white rounded-lg hover:bg-slate-700 font-bold min-h-[48px] transition-colors duration-150"
              >
                ← {t('tools.returnToPlanned')}
              </button>
              <button
                onClick={async () => {
                  try {
                    await closeActiveGroup();
                    setCloseGroupAcknowledged(false);
                    setCloseGroupConfirmText('');
                    setRefreshKey(prev => prev + 1);
                    alert(t('tools.closeActiveSuccess'));
                  } catch (error) {
                    console.error('Failed to close active group:', error);
                    alert(`${t('common.error')}: ${(error as Error).message}`);
                  }
                }}
                disabled={!closeGroupAcknowledged || closeGroupConfirmText !== `CLOSE-${activeGroup.groupNumber}`}
                className="px-6 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold min-h-[48px] transition-colors duration-150"
              >
                ✓ {t('tools.archiveGroup')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Action Modal */}
      {confirmAction && (
        <ConfirmModal
          isOpen={true}
          title={t('tools.changeActiveGroup')}
          message={t('tools.changeActiveGroupMessage', { current: confirmAction.currentActive.groupNumber.toString(), new: confirmAction.groupNumber.toString() })}
          confirmText={t('tools.changeActiveGroupConfirm')}
          cancelText={t('common.cancel')}
          onConfirm={confirmMoveCurrentToPlanned}
          onClose={() => setConfirmAction(null)}
        />
      )}

      {/* Planned Groups Management */}
      {plannedGroups && plannedGroups.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border-2 border-amber-300">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-amber-600" strokeWidth={2} />
              <h3 className="text-lg font-bold text-amber-700">{t('tools.plannedGroups')}</h3>
            </div>
            <p className="text-sm text-amber-600 mt-0.5 ml-7">{t('tools.plannedGroupsSubtitle')}</p>
          </div>
          <div className="space-y-3">
            {plannedGroups.map((group) => {
              const participantCount = allParticipants?.filter(p => p.groupNumber === group.groupNumber).length || 0;
              
              return (
                <div key={group.id} className="border border-amber-200 rounded-lg p-4 bg-amber-50 hover:shadow-md hover:border-amber-300 transition-all duration-200">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-amber-900">{t('group.number')} {group.groupNumber}</h4>
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-medium rounded-full">{t('group.planned')}</span>
                      </div>
                      <div className="text-sm text-amber-800 space-y-1">
                        <p className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" strokeWidth={2} />
                          {formatDateBG(group.courseStartDate)} - {formatDateBG(group.courseEndDate)}
                        </p>
                        <p className="flex items-center gap-1">
                          <Users className="w-4 h-4" strokeWidth={2} />
                          {participantCount} {getParticipantText(participantCount)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleMakeActive(group.id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 hover:shadow-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap"
                      >
                        <CheckCircle className="w-4 h-4" strokeWidth={2} />
                        {t('tools.makeActive')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Groups Management */}
      {completedGroups && completedGroups.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border-2 border-slate-300">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-slate-600" strokeWidth={2} />
                <h3 className="text-lg font-bold text-slate-700">{t('tools.archiveCompleted')}</h3>
                <span className="text-sm text-slate-500">({completedGroups.length})</span>
              </div>
              <p className="text-sm text-slate-600 mt-0.5 ml-7">{t('tools.completedCourses')}</p>
            </div>
            {completedGroups.length > 2 && (
              <button
                onClick={() => setShowAllArchived(!showAllArchived)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {showAllArchived ? t('tools.hide') : t('tools.showAll')}
                <ChevronDown className={`w-4 h-4 transition-transform ${showAllArchived ? 'rotate-180' : ''}`} strokeWidth={2} />
              </button>
            )}
          </div>
          <div className="space-y-3">
            {(showAllArchived ? completedGroups : completedGroups.slice(0, 2)).map((group) => {
              const participantCount = allParticipants?.filter(p => p.groupNumber === group.groupNumber).length || 0;
              
              return (
                <div key={group.id} className="border border-slate-300 rounded-lg p-4 bg-slate-50 hover:shadow-md hover:border-slate-400 transition-all duration-200">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-800">{t('group.number')} {group.groupNumber}</h4>
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs font-medium rounded-full">{t('group.completed')}</span>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <p className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" strokeWidth={2} />
                          {formatDateBG(group.courseStartDate)} - {formatDateBG(group.courseEndDate)}
                        </p>
                        <p className="flex items-center gap-1">
                          <Users className="w-4 h-4" strokeWidth={2} />
                          {participantCount} {getParticipantText(participantCount)}
                        </p>
                        {group.closedAt && (
                          <p className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="w-3.5 h-3.5" strokeWidth={2} />
                            {t('tools.completedOn')}: {formatDateBG(group.closedAt.split('T')[0])} {new Date(group.closedAt).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleReopenArchived(group.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap"
                      >
                        <RotateCcw className="w-4 h-4" strokeWidth={2} />
                        {t('tools.reopenForEdits')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings Info */}
      {settings && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-bold text-slate-900 mb-4">{t('tools.currentSequence')}</h3>
          <div className="text-sm text-slate-700 space-y-1">
            <p><strong>{t('tools.prefix')}:</strong> {settings.lastUniquePrefix}</p>
            <p><strong>{t('tools.sequence')}:</strong> {settings.lastUniqueSeq}</p>
            {settings.lastResetYear && (
              <p><strong>{t('tools.lastReset')}:</strong> {settings.lastResetYear}</p>
            )}
          </div>
        </div>
      )}

      {/* Export Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">{t('tools.exportData')}</h3>
        <div className="space-y-3">
          <button
            onClick={handleExportJSON}
            className="w-full px-6 py-4 bg-blue-100 text-blue-800 border border-blue-300 rounded-lg hover:bg-blue-200 hover:border-blue-400 font-medium min-h-[48px] transition-all duration-150 flex items-center justify-center gap-2"
          >
            <Package className="w-5 h-5" strokeWidth={2} />
            {t('tools.exportFullBackup')}
          </button>
          <button
            onClick={handleExportExcel}
            className="w-full px-6 py-4 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg hover:bg-emerald-200 hover:border-emerald-400 font-medium min-h-[48px] transition-all duration-150 flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="w-5 h-5" strokeWidth={2} />
            {t('tools.exportExcel')}
          </button>
          <button
            onClick={handleExportCSV}
            className="w-full px-6 py-4 bg-slate-100 text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-200 hover:border-slate-400 font-medium min-h-[48px] transition-all duration-150 flex items-center justify-center gap-2"
          >
            <FileText className="w-5 h-5" strokeWidth={2} />
            {t('tools.exportCSV')}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          {t('tools.exportNote')}
        </p>
      </div>

      {/* Import Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">{t('tools.importData')}</h3>
        <div className="space-y-3">
          <label className="block w-full px-6 py-4 bg-blue-100 text-blue-800 border border-blue-300 rounded-lg hover:bg-blue-200 hover:border-blue-400 cursor-pointer text-center font-medium min-h-[48px] transition-all duration-150 flex items-center justify-center gap-2">
            <Download className="w-5 h-5" strokeWidth={2} />
            {t('tools.importMerge')}
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
          <label className="block w-full px-6 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer text-center font-medium min-h-[48px] transition-colors duration-150 flex items-center justify-center gap-2">
            <AlertTriangle className="w-5 h-5" strokeWidth={2} />
            {t('tools.importReplace')}
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
        <p className="text-xs text-slate-500 mt-3">
          {t('tools.importMergeNote')}
        </p>
        {isImporting && (
          <p className="text-sm text-blue-600 mt-3 font-medium">{t('common.loading')}</p>
        )}
      </div>

      {/* Advanced Section with Danger Zone */}
      <div className="bg-white p-6 rounded-lg shadow-md border-2 border-orange-200">
        <button
          onClick={() => setShowDangerZone(!showDangerZone)}
          className="w-full flex items-center justify-between py-2 min-h-[44px]"
        >
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-orange-600" strokeWidth={2} />
            <h3 className="text-lg font-bold text-orange-600">{t('tools.advancedSettings')}</h3>
          </div>
          <ChevronDown className={`w-6 h-6 transition-transform ${showDangerZone ? 'rotate-180' : ''}`} strokeWidth={2} />
        </button>

        {showDangerZone && (
          <div className="mt-4 pt-4 border-t border-orange-200 space-y-6">
            {/* Yearly Archive Section */}
            <YearlyArchiveSection 
              onArchive={() => setShowArchiveModal(true)}
              onViewArchives={() => setShowArchiveViewer(true)}
            />
            
            {/* Yearly Reset Section */}
            <DangerZoneReset />
          </div>
        )}
      </div>

      {/* Yearly Archive Modal */}
      {showArchiveModal && (
        <YearlyArchiveModal
          isOpen={showArchiveModal}
          onClose={() => {
            setShowArchiveModal(false);
            setArchiveConfirmText('');
          }}
          onConfirm={handleArchiveCurrentYear}
          confirmText={archiveConfirmText}
          onConfirmTextChange={setArchiveConfirmText}
        />
      )}

      {/* Yearly Archive Viewer */}
      {showArchiveViewer && (
        <YearlyArchiveViewer
          isOpen={showArchiveViewer}
          onClose={() => setShowArchiveViewer(false)}
          archives={yearlyArchives || []}
          onRestoreGroup={(year, groupNumber) => setRestoreGroup({ year, groupNumber })}
        />
      )}

      {/* Restore Group Confirmation Modal */}
      <ConfirmModal
        isOpen={restoreGroup !== null}
        onClose={() => setRestoreGroup(null)}
        onConfirm={() => {
          if (restoreGroup) {
            handleRestoreGroup(restoreGroup.year, restoreGroup.groupNumber);
          }
        }}
        title={t('tools.restoreGroupTitle')}
        message={t('tools.restoreGroupMessage', { number: restoreGroup?.groupNumber?.toString() || '' })}
        confirmText={t('tools.restoreGroupConfirm')}
        cancelText={t('common.cancel')}
      />

    </div>
  );
};

// Yearly Archive Section Component
const YearlyArchiveSection: React.FC<{
  onArchive: () => void;
  onViewArchives: () => void;
}> = ({ onArchive, onViewArchives }) => {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const allGroups = useLiveQuery(() => db.groups.toArray(), []);
  const allParticipants = useLiveQuery(() => db.participants.toArray(), []);
  
  // Count groups by status
  const activeGroupsCount = allGroups?.filter(g => g.status === 'active').length || 0;
  const plannedGroupsCount = allGroups?.filter(g => g.status === 'planned').length || 0;
  const guardFails = activeGroupsCount > 0 || plannedGroupsCount > 0;
  const isReady = !guardFails;
  
  const completedGroupsThisYear = allGroups?.filter(g => {
    if (g.status !== 'completed') return false;
    const courseYear = new Date(g.courseStartDate).getFullYear();
    return courseYear === currentYear;
  }) || [];
  
  const participantsCount = allParticipants?.filter(p => 
    completedGroupsThisYear.some(g => g.groupNumber === p.groupNumber)
  ).length || 0;

  return (
    <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-300">
      <div className="flex items-center gap-2 mb-2">
        <Archive className="w-5 h-5 text-purple-600" strokeWidth={2} />
        <h4 className="text-lg font-bold text-purple-600">{t('archive.title')}</h4>
      </div>
      <p className="text-sm text-slate-700 mb-4">
        {t('archive.description')}
      </p>

      {/* Readiness Checklist */}
      <div className="bg-white border border-slate-300 rounded-lg p-3 mb-4">
        <h5 className="text-sm font-semibold text-slate-800 mb-2">{t('tools.archiveReadinessTitle')}</h5>
        <div className="space-y-1.5">
          {/* Active Groups Check */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {activeGroupsCount === 0 ? (
                <CheckCircle className="w-5 h-5 text-emerald-600" strokeWidth={2} />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600" strokeWidth={2} />
              )}
              <span className="text-slate-700">{t('tools.archiveActiveGroups')}</span>
            </div>
            <span className={`font-semibold ${activeGroupsCount === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {activeGroupsCount}
            </span>
          </div>
          
          {/* Planned Groups Check */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {plannedGroupsCount === 0 ? (
                <CheckCircle className="w-5 h-5 text-emerald-600" strokeWidth={2} />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600" strokeWidth={2} />
              )}
              <span className="text-slate-700">{t('tools.archivePlannedGroups')}</span>
            </div>
            <span className={`font-semibold ${plannedGroupsCount === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {plannedGroupsCount}
            </span>
          </div>
        </div>
        
        {/* Status Message */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          {isReady ? (
            <p className="text-xs text-emerald-700 flex items-start gap-1.5">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>{t('tools.archiveReady')}</span>
            </p>
          ) : (
            <p className="text-xs text-amber-800 flex items-start gap-1.5">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" strokeWidth={2} />
              <span>{t('tools.archiveNotReady')}</span>
            </p>
          )}
        </div>
      </div>

      {completedGroupsThisYear.length > 0 ? (
        <div className="bg-white p-3 rounded mb-4 text-sm space-y-1">
          <p><strong>{t('archive.currentYear')}:</strong> {currentYear}</p>
          <p><strong>{t('archive.groupsToArchive')}:</strong> {completedGroupsThisYear.length}</p>
          <p><strong>{t('archive.participantsToArchive')}:</strong> {participantsCount}</p>
        </div>
      ) : (
        <div className="bg-white p-3 rounded mb-4 text-sm text-slate-600">
          {t('archive.noGroupsToArchive')}
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={onArchive}
          disabled={completedGroupsThisYear.length === 0 || guardFails}
          className="w-full px-6 py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-400 disabled:cursor-not-allowed font-bold min-h-[48px] transition-colors"
          title={guardFails ? 'Приключете всички активни и планирани групи' : 'Архивирай и нулирай годишния номер'}
        >
          {t('archive.button')}
        </button>
        
        <button
          onClick={onViewArchives}
          className="w-full px-6 py-4 bg-slate-600 text-white rounded-lg hover:bg-slate-700 font-medium min-h-[48px] transition-colors"
        >
          📚 {t('archive.viewArchives')}
        </button>
      </div>
    </div>
  );
};

// Yearly Archive Confirmation Modal
const YearlyArchiveModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmText: string;
  onConfirmTextChange: (text: string) => void;
}> = ({ isOpen, onClose, onConfirm, confirmText, onConfirmTextChange }) => {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const allGroups = useLiveQuery(() => db.groups.toArray(), []);
  const allParticipants = useLiveQuery(() => db.participants.toArray(), []);
  
  // Check guard conditions
  const hasActiveGroups = allGroups?.some(g => g.status === 'active') || false;
  const hasPlannedGroups = allGroups?.some(g => g.status === 'planned') || false;
  const guardFails = hasActiveGroups || hasPlannedGroups;
  
  const completedGroupsThisYear = allGroups?.filter(g => {
    if (g.status !== 'completed') return false;
    const courseYear = new Date(g.courseStartDate).getFullYear();
    return courseYear === currentYear;
  }) || [];
  
  const participantsCount = allParticipants?.filter(p => 
    completedGroupsThisYear.some(g => g.groupNumber === p.groupNumber)
  ).length || 0;

  const requiredText = `ARCHIVE-${currentYear}`;
  const isValid = confirmText === requiredText && !guardFails;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-xl font-bold text-purple-600 mb-4">{t('archive.confirmTitle')}</h3>
        
        {guardFails ? (
          <div className="bg-red-50 border-2 border-red-400 p-4 rounded mb-4">
            <p className="text-sm text-red-900 font-semibold mb-2">{t('tools.archiveCannotArchive')}</p>
            <p className="text-sm text-red-800 mb-3">
              {t('tools.archiveCannotArchiveMessage')}
            </p>
            {hasActiveGroups && (
              <p className="text-xs text-red-700">{t('tools.archiveHasActiveGroups')}</p>
            )}
            {hasPlannedGroups && (
              <p className="text-xs text-red-700">{t('tools.archiveHasPlannedGroups')}</p>
            )}
          </div>
        ) : (
          <p className="text-slate-700 mb-4">
            {t('tools.archiveConfirmMessage', { groups: completedGroupsThisYear.length.toString(), participants: participantsCount.toString(), year: currentYear.toString() })}
          </p>
        )}
        
        {!guardFails && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('archive.typeToConfirm')} <code className="bg-slate-200 px-2 py-1 rounded">{requiredText}</code> {t('archive.toConfirm')}:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => onConfirmTextChange(e.target.value)}
              placeholder={requiredText}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            {guardFails ? t('tools.archiveCloseButton') : t('common.cancel')}
          </button>
          {!guardFails && (
            <button
              onClick={onConfirm}
              disabled={!isValid}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
            >
              {t('archive.button')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Yearly Archive Viewer Component
const YearlyArchiveViewer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  archives: any[];
  onRestoreGroup: (year: number, groupNumber: number) => void;
}> = ({ isOpen, onClose, archives, onRestoreGroup }) => {
  const { t } = useLanguage();
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-slate-900">{t('archive.yearlyArchives')}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" strokeWidth={2} />
          </button>
        </div>

        {archives.length === 0 ? (
          <p className="text-slate-600 text-center py-8">{t('archive.noArchives')}</p>
        ) : (
          <div className="space-y-4">
            {archives.sort((a, b) => b.year - a.year).map((archive) => (
              <div key={archive.id} className="border border-slate-300 rounded-lg">
                {/* Year Header */}
                <button
                  onClick={() => setExpandedYear(expandedYear === archive.year ? null : archive.year)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <ChevronRight
                      className={`w-5 h-5 text-slate-600 transition-transform ${expandedYear === archive.year ? 'rotate-90' : ''}`}
                      strokeWidth={2}
                    />
                    <div className="text-left">
                      <div className="font-bold text-slate-900">{t('archive.year')} {archive.year}</div>
                      <div className="text-sm text-slate-600">
                        {archive.groups.length} {t('archive.groups')}, {archive.participants.length} {t('archive.participants')}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {t('archive.archived')}: {formatDateBG(archive.archivedAt.split('T')[0])}
                  </div>
                </button>

                {/* Expanded Year Content */}
                {expandedYear === archive.year && (
                  <div className="border-t border-slate-200 p-4 space-y-2">
                    {archive.groups.sort((a: any, b: any) => b.groupNumber - a.groupNumber).map((group: any) => {
                      const groupParticipants = archive.participants.filter((p: any) => p.groupNumber === group.groupNumber);
                      
                      return (
                        <div key={group.id} className="border border-slate-200 rounded-lg">
                          {/* Group Header */}
                          <button
                            onClick={() => setExpandedGroup(expandedGroup === group.groupNumber ? null : group.groupNumber)}
                            className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                className={`w-4 h-4 text-slate-600 transition-transform ${expandedGroup === group.groupNumber ? 'rotate-90' : ''}`}
                                strokeWidth={2}
                              />
                              <div className="text-left">
                                <div className="font-semibold text-slate-900">{t('group.number')} {group.groupNumber}</div>
                                <div className="text-xs text-slate-600">
                                  {formatDateBG(group.courseStartDate)} - {formatDateBG(group.courseEndDate)}
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-slate-600">
                              {groupParticipants.length} {t('archive.participants')}
                            </div>
                          </button>

                          {/* Expanded Group Content */}
                          {expandedGroup === group.groupNumber && (
                            <div className="border-t border-slate-200 p-3">
                              {/* Restore Button */}
                              <div className="mb-3">
                                <button
                                  onClick={() => onRestoreGroup(archive.year, group.groupNumber)}
                                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                  <Upload className="w-5 h-5" strokeWidth={2} />
                                  {t('tools.restoreGroupConfirm')}
                                </button>
                                <p className="text-xs text-slate-600 mt-2 text-center">
                                  {t('tools.restoreGroupWillRestore')}
                                </p>
                              </div>
                              
                              <div className="space-y-2">
                                {groupParticipants.map((participant: any) => (
                                  <div key={participant.id} className="bg-slate-50 p-2 rounded text-sm">
                                    <div className="font-semibold text-slate-900">{participant.personName}</div>
                                    <div className="text-slate-600">{participant.companyName}</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                      {t('participant.uniqueNumber')}: {participant.uniqueNumber}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 font-medium"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

// Danger Zone Component for Yearly Reset
const DangerZoneReset: React.FC = () => {
  const { settings, resetYearlySequence } = useSettings();
  const { t } = useLanguage();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  
  // Get max prefix from actual database participants
  const allParticipants = useLiveQuery(() => db.participants.toArray(), []);
  const maxPrefix = allParticipants?.reduce((max, p) => {
    const prefix = parseInt(p.uniqueNumber.split('-')[0], 10);
    return prefix > max ? prefix : max;
  }, 0) || 0;

  const currentYear = new Date().getFullYear();
  const requiredText = `RESET-${currentYear}`;
  const isValid = acknowledged && confirmText === requiredText;

  const handleReset = () => {
    setShowFinalConfirm(true);
  };

  const handleFinalConfirm = async () => {
    try {
      await resetYearlySequence();
      alert(t('tools.resetSequenceSuccess'));
      setAcknowledged(false);
      setConfirmText('');
      setShowFinalConfirm(false);
    } catch (error) {
      console.error('Failed to reset sequence:', error);
      alert(t('tools.resetSequenceFailed'));
    }
  };

  return (
    <div className="bg-red-50 p-4 rounded-lg border-2 border-red-300">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-5 h-5 text-red-600" strokeWidth={2} />
        <h4 className="text-lg font-bold text-red-600">{t('tools.dangerZone')}</h4>
      </div>
      <p className="text-sm text-slate-700 mb-4">
        {t('tools.resetSequenceDescription2')}
      </p>

      {settings && (
        <div className="bg-white p-3 rounded mb-4 text-sm">
          <p><strong>{t('tools.current')}:</strong> {settings.lastUniquePrefix.toString().padStart(4, '0')}-{settings.lastUniqueSeq.toString().padStart(3, '0')}</p>
          <p><strong>{t('tools.nextAfterReset')}:</strong> {(maxPrefix + 1).toString().padStart(4, '0')}-001</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 w-5 h-5 text-red-600 rounded border-slate-300 focus:ring-red-500"
          />
          <span className="text-sm text-slate-700 flex-1">
            {t('tools.resetSequenceCheckbox')}
          </span>
        </label>

        {/* Type to confirm */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Type <code className="bg-slate-200 px-2 py-1 rounded">{requiredText}</code> to confirm:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={requiredText}
            className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 min-h-[44px]"
            disabled={!acknowledged}
          />
        </div>

        {/* Reset button */}
        <button
          onClick={handleReset}
          disabled={!isValid}
          className="w-full px-6 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold min-h-[48px]"
        >
          {t('tools.resetButton')}
        </button>
      </div>

      {/* Final confirmation modal */}
      {showFinalConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-red-600 mb-4">{t('modal.finalConfirmation')}</h3>
            <p className="text-slate-700 mb-6">
              {t('tools.resetSequenceFinalConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinalConfirm(false)}
                className="flex-1 px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 min-h-[48px]"
              >
                {t('tools.resetSequenceCancel')}
              </button>
              <button
                onClick={handleFinalConfirm}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold min-h-[48px]"
              >
                {t('tools.resetSequenceConfirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
