import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Participant } from '../db/database';
import { useParticipants } from '../hooks/useParticipants';
import { useLanguage } from '../contexts/LanguageContext';
import { ConfirmModal } from './ui/ConfirmModal';
import { CompanyBadge } from './ui/CompanyBadge';
import { BulkActionBar } from './ui/BulkActionBar';
import { GroupSection } from './ui/GroupSection';
import { ArchivedGroupAccordion } from './ui/ArchivedGroupAccordion';
import { formatDateBG } from '../utils/medicalValidation';
import { syncGroupDates, isGroupReadOnly } from '../utils/groupUtils';
import { generateCertificate } from '../utils/certificateGenerator';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';

interface ParticipantListProps {
  participants: Participant[];
  onEdit: (participant: Participant) => void;
  onDelete: (id: string) => void;
  collapsedSections: {
    active: boolean;
    planned: boolean;
    completed: boolean;
  };
  toggleSection: (section: 'active' | 'planned' | 'completed') => void;
  expandSection: (section: 'active' | 'planned' | 'completed') => void;
  hasActiveFilters: boolean;
  groupRefreshKey?: number;
}

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  onEdit,
  onDelete,
  collapsedSections,
  toggleSection,
  expandSection,
  hasActiveFilters,
  groupRefreshKey = 0
}) => {
  const { updateParticipant, resetCompletedOverride } = useParticipants();
  const { t } = useLanguage();
  const [sortBy, setSortBy] = useState<'courseStartDate' | 'groupNumber' | 'uniqueNumber'>('uniqueNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; participant?: Participant }>({
    isOpen: false,
    participant: undefined
  });

  // Get all groups for status and lock lookup
  const groups = useLiveQuery(() => db.groups.toArray(), [groupRefreshKey]);
  const groupMap = useMemo(() => {
    if (!groups) return new Map();
    return new Map(groups.map(g => [g.groupNumber, g]));
  }, [groups]);

  // Sort participants
  const sortedParticipants = useMemo(() => {
    const sorted = [...participants].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'courseStartDate') {
        comparison = a.courseStartDate.localeCompare(b.courseStartDate);
      } else if (sortBy === 'groupNumber') {
        comparison = a.groupNumber - b.groupNumber;
      } else if (sortBy === 'uniqueNumber') {
        comparison = a.uniqueNumber.localeCompare(b.uniqueNumber);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [participants, sortBy, sortDirection]);

  // Group participants by group status
  const participantsByStatus = useMemo(() => {
    const active: Participant[] = [];
    const planned: Participant[] = [];
    const completed: Participant[] = [];

    sortedParticipants.forEach(p => {
      const group = groupMap.get(p.groupNumber);
      if (!group) {
        // If group not found, treat as active
        active.push(p);
        return;
      }

      if (group.status === 'active') {
        active.push(p);
      } else if (group.status === 'planned') {
        planned.push(p);
      } else if (group.status === 'completed') {
        completed.push(p);
      }
    });

    return { active, planned, completed };
  }, [sortedParticipants, groupMap]);

  // Get active group for date display
  const activeGroup = useMemo(() => {
    return groups?.find(g => g.status === 'active');
  }, [groups]);

  // Group planned participants by group number for visual separation
  const plannedGroupedByNumber = useMemo(() => {
    const grouped = new Map<number, { group: any; participants: Participant[] }>();
    
    participantsByStatus.planned.forEach(p => {
      const group = groupMap.get(p.groupNumber);
      if (!group) return;
      
      if (!grouped.has(p.groupNumber)) {
        grouped.set(p.groupNumber, { group, participants: [] });
      }
      grouped.get(p.groupNumber)!.participants.push(p);
    });
    
    // Sort by group number ascending (earliest first)
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([groupNumber, data]) => ({
        groupNumber,
        ...data
      }));
  }, [participantsByStatus.planned, groupMap]);

  // Group completed participants by group for accordion display
  const completedGroupedByNumber = useMemo(() => {
    const grouped = new Map<number, { group: any; participants: Participant[] }>();
    
    participantsByStatus.completed.forEach(p => {
      const group = groupMap.get(p.groupNumber);
      if (!group) return;
      
      if (!grouped.has(p.groupNumber)) {
        grouped.set(p.groupNumber, { group, participants: [] });
      }
      grouped.get(p.groupNumber)!.participants.push(p);
    });
    
    // Sort by group number descending (newest first)
    return Array.from(grouped.entries())
      .sort(([a], [b]) => b - a)
      .map(([groupNumber, data]) => ({
        groupNumber,
        ...data
      }));
  }, [participantsByStatus.completed, groupMap]);

  // Get unique group numbers for each status
  const groupStats = useMemo(() => {
    const activeGroups = new Set<number>();
    const plannedGroups = new Set<number>();
    const completedGroups = new Set<number>();

    participantsByStatus.active.forEach(p => activeGroups.add(p.groupNumber));
    participantsByStatus.planned.forEach(p => plannedGroups.add(p.groupNumber));
    participantsByStatus.completed.forEach(p => completedGroups.add(p.groupNumber));

    return {
      active: {
        count: activeGroups.size,
        numbers: Array.from(activeGroups).sort((a, b) => a - b)
      },
      planned: {
        count: plannedGroups.size,
        numbers: Array.from(plannedGroups).sort((a, b) => a - b)
      },
      completed: {
        count: completedGroups.size,
        numbers: Array.from(completedGroups).sort((a, b) => a - b)
      }
    };
  }, [participantsByStatus]);

  // Auto-expand sections when search/filter results are present
  const prevParticipantsRef = useRef(participants);
  useEffect(() => {
    if (prevParticipantsRef.current !== participants && hasActiveFilters) {
      if (participantsByStatus.active.length > 0 && collapsedSections.active) {
        expandSection('active');
      }
      if (participantsByStatus.planned.length > 0 && collapsedSections.planned) {
        expandSection('planned');
      }
      if (participantsByStatus.completed.length > 0 && collapsedSections.completed) {
        expandSection('completed');
      }
      prevParticipantsRef.current = participants;
    }
  }, [participants, participantsByStatus, collapsedSections, expandSection, hasActiveFilters]);

  // Sync group dates with participants on mount
  useEffect(() => {
    const syncAllGroups = async () => {
      if (!groups) return;
      for (const group of groups) {
        await syncGroupDates(group.groupNumber);
      }
    };
    syncAllGroups();
  }, [groups]);

  // Only show visible (non-collapsed) participants for bulk actions
  const visibleParticipants = useMemo(() => {
    const visible: Participant[] = [];
    if (!collapsedSections.active) visible.push(...participantsByStatus.active);
    if (!collapsedSections.planned) visible.push(...participantsByStatus.planned);
    if (!collapsedSections.completed) visible.push(...participantsByStatus.completed);
    return visible;
  }, [participantsByStatus, collapsedSections]);

  const handleSort = (field: 'courseStartDate' | 'groupNumber' | 'uniqueNumber') => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  const handleCheckboxChange = async (participant: Participant, field: 'sent' | 'documents' | 'handedOver' | 'paid') => {
    // Check if group is read-only
    const group = groupMap.get(participant.groupNumber);
    if (isGroupReadOnly(group)) {
      alert(t('lock.lockedInfo'));
      return;
    }

    try {
      await updateParticipant(participant.id, {
        [field]: !participant[field]
      });
    } catch (error) {
      console.error('Error updating participant:', error);
      alert('Failed to update participant');
    }
  };

  const handleCompletedToggle = async (participant: Participant) => {
    // Check if group is read-only
    const group = groupMap.get(participant.groupNumber);
    if (isGroupReadOnly(group)) {
      alert(t('lock.lockedInfo'));
      return;
    }

    const currentCompleted = participant.completedOverride !== null 
      ? participant.completedOverride 
      : participant.completedComputed;

    try {
      await updateParticipant(participant.id, {
        completedOverride: !currentCompleted
      });
    } catch (error) {
      console.error('Error updating completed status:', error);
      alert('Failed to update completed status');
    }
  };

  const handleResetCompleted = async (participant: Participant) => {
    // Check if group is read-only
    const group = groupMap.get(participant.groupNumber);
    if (isGroupReadOnly(group)) {
      alert(t('lock.lockedInfo'));
      return;
    }

    try {
      await resetCompletedOverride(participant.id);
    } catch (error) {
      console.error('Error resetting completed status:', error);
      alert('Failed to reset completed status');
    }
  };

  const getCompletedValue = (participant: Participant): boolean => {
    return participant.completedOverride !== null 
      ? participant.completedOverride 
      : participant.completedComputed;
  };

  const isCompletedOverridden = (participant: Participant): boolean => {
    return participant.completedOverride !== null;
  };

  // const handleDeleteClick = (participant: Participant) => {
  //   setDeleteConfirm({ isOpen: true, participant });
  // };

  const handleGenerateCertificate = async (participant: Participant) => {
    try {
      const group = groupMap.get(participant.groupNumber);
      if (!group) {
        alert('Грешка: Групата не е намерена');
        return;
      }
      await generateCertificate(participant, group);
      alert('Сертификатът е генериран успешно!');
    } catch (error) {
      alert('Грешка при генериране на сертификат: ' + (error as Error).message);
    }
  };

  const confirmDelete = () => {
    if (deleteConfirm.participant) {
      onDelete(deleteConfirm.participant.id);
    }
    setDeleteConfirm({ isOpen: false, participant: undefined });
  };

  // Render a participant row - extracted for reusability
  const renderParticipantRow = (participant: Participant) => {
    const group = groupMap.get(participant.groupNumber);
    const isReadOnly = isParticipantReadOnly(participant);
    const rowClassName = [
      'hover:bg-slate-100 transition-colors duration-150',
      group?.status === 'active' ? 'bg-slate-50' : '',
      group?.status === 'completed' ? 'opacity-90' : ''
    ].filter(Boolean).join(' ');

    return (
      <tr key={participant.id} className={rowClassName}>
        <td className="px-3 py-3 text-center">
          <input
            type="checkbox"
            checked={selectedIds.has(participant.id)}
            onChange={() => handleSelectOne(participant.id)}
            disabled={isReadOnly}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Select ${participant.personName}`}
          />
        </td>
        <td className="px-3 py-3 text-sm text-slate-900">
          <div className="flex items-center gap-2">
            <CompanyBadge companyName={participant.companyName} />
            {isReadOnly && (
              <span className="text-xs text-slate-500" title={t('lock.lockedInfo')}>
                🔒
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-sm text-slate-900">
          <div className="max-w-xs truncate" title={participant.personName}>
            {participant.personName}
          </div>
        </td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.medicalDate)}</td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.courseStartDate)}</td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.courseEndDate)}</td>
        <td className="px-3 py-3 text-sm">
          <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded inline-block text-slate-700" title="Уникален номер на удостоверение">
            {participant.uniqueNumber}
          </span>
        </td>
        <td className="px-3 py-3 text-center">
          <input
            type="checkbox"
            checked={participant.sent}
            onChange={() => handleCheckboxChange(participant, 'sent')}
            disabled={isReadOnly}
            title="Данните са изпратени към фирмата"
            className="w-5 h-5 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          />
        </td>
        <td className="px-3 py-3 text-center">
          <input
            type="checkbox"
            checked={participant.documents}
            onChange={() => handleCheckboxChange(participant, 'documents')}
            disabled={isReadOnly}
            title="Получени са всички документи"
            className="w-5 h-5 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          />
        </td>
        <td className="px-3 py-3 text-center">
          <input
            type="checkbox"
            checked={participant.handedOver}
            onChange={() => handleCheckboxChange(participant, 'handedOver')}
            disabled={isReadOnly}
            title="Удостоверението е предадено"
            className="w-5 h-5 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          />
        </td>
        <td className="px-3 py-3 text-center">
          <input
            type="checkbox"
            checked={participant.paid}
            onChange={() => handleCheckboxChange(participant, 'paid')}
            disabled={isReadOnly}
            title="Таксата е платена"
            className="w-5 h-5 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          />
        </td>
        <td className="px-3 py-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => handleCompletedToggle(participant)}
              disabled={isReadOnly}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150 ring-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                getCompletedValue(participant)
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200'
              }`}
              title={isReadOnly ? t('lock.lockedInfo') : 'Click to toggle'}
            >
              {getCompletedValue(participant) ? t('completed.done') : t('completed.pending')}
            </button>
            {isCompletedOverridden(participant) && !isReadOnly && (
              <button
                onClick={() => handleResetCompleted(participant)}
                className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors duration-150"
                title="Reset to auto"
                aria-label="Reset completed to automatic"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => onEdit(participant)}
              disabled={isReadOnly}
              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isReadOnly ? t('lock.lockedInfo') : t('common.edit')}
              aria-label={`Edit ${participant.personName}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => handleGenerateCertificate(participant)}
              className="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors duration-150"
              title="Генерирай сертификат"
              aria-label={`Generate certificate for ${participant.personName}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            <button
              onClick={() => setDeleteConfirm({ isOpen: true, participant })}
              disabled={isReadOnly}
              className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isReadOnly ? t('lock.lockedInfo') : t('common.delete')}
              aria-label={`Delete ${participant.personName}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Render row for planned groups (without unique number and sent columns)
  const renderPlannedParticipantRow = (participant: Participant) => {
    const isReadOnly = isParticipantReadOnly(participant);
    const rowClassName = 'hover:bg-slate-100 transition-colors duration-150';

    return (
      <tr key={participant.id} className={rowClassName}>
        <td className="px-3 py-3 text-center">
          <input
            type="checkbox"
            checked={selectedIds.has(participant.id)}
            onChange={() => handleSelectOne(participant.id)}
            disabled={isReadOnly}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Select ${participant.personName}`}
          />
        </td>
        <td className="px-3 py-3 text-sm text-slate-900">
          <CompanyBadge companyName={participant.companyName} />
        </td>
        <td className="px-3 py-3 text-sm text-slate-900">
          <div className="max-w-xs truncate" title={participant.personName}>
            {participant.personName}
          </div>
        </td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.medicalDate)}</td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.courseStartDate)}</td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.courseEndDate)}</td>
        <td className="px-3 py-3 text-sm">
          <span className="text-slate-900 font-semibold">{participant.groupNumber}</span>
        </td>
        {/* Unique Number, Sent, HandedOver, Completed hidden for planned groups */}
        <td className="px-3 py-3 text-center">
          <input
            type="checkbox"
            checked={participant.documents}
            onChange={() => handleCheckboxChange(participant, 'documents')}
            disabled={isReadOnly}
            title="Получени са всички документи"
            className="w-5 h-5 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          />
        </td>
        <td className="px-3 py-3 text-center">
          <input
            type="checkbox"
            checked={participant.paid}
            onChange={() => handleCheckboxChange(participant, 'paid')}
            disabled={isReadOnly}
            title="Таксата е платена"
            className="w-5 h-5 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          />
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => onEdit(participant)}
              disabled={isReadOnly}
              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isReadOnly ? t('lock.lockedInfo') : t('common.edit')}
              aria-label={`Edit ${participant.personName}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => setDeleteConfirm({ isOpen: true, participant })}
              disabled={isReadOnly}
              className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isReadOnly ? t('lock.lockedInfo') : t('common.delete')}
              aria-label={`Delete ${participant.personName}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Simplified render for archived participants (read-only)
  const renderArchivedParticipantRow = (participant: Participant) => {
    const completed = participant.completedOverride !== null ? participant.completedOverride : participant.completedComputed;
    
    return (
      <tr key={participant.id} className="hover:bg-slate-50 transition-colors">
        <td className="px-3 py-2 text-sm text-slate-900">
          <CompanyBadge companyName={participant.companyName} />
        </td>
        <td className="px-3 py-2 text-sm text-slate-900">{participant.personName}</td>
        <td className="px-3 py-2 text-sm">
          <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded inline-block text-slate-700" title="Уникален номер на удостоверение">
            {participant.uniqueNumber}
          </span>
        </td>
        <td className="px-3 py-2 text-sm text-slate-600">{formatDateBG(participant.medicalDate)}</td>
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            checked={participant.sent}
            disabled
            title="Данните са изпратени към фирмата"
            className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
          />
        </td>
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            checked={participant.documents}
            disabled
            title="Получени са всички документи"
            className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
          />
        </td>
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            checked={participant.handedOver}
            disabled
            title="Удостоверението е предадено"
            className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
          />
        </td>
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            checked={participant.paid}
            disabled
            title="Таксата е платена"
            className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
          />
        </td>
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            checked={completed}
            disabled
            className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
          />
        </td>
      </tr>
    );
  };

  //Selection handlers
  const handleSelectAll = () => {
    // Only include participants from visible (expanded) sections and unlocked groups
    const selectableParticipants = visibleParticipants.filter(p => !isParticipantReadOnly(p));
    
    if (selectedIds.size === selectableParticipants.length && selectableParticipants.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableParticipants.map(p => p.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkActionComplete = () => {
    setSelectedIds(new Set());
  };

  const isParticipantReadOnly = (participant: Participant): boolean => {
    const group = groupMap.get(participant.groupNumber);
    return isGroupReadOnly(group);
  };

  if (sortedParticipants.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        {t('participants.noResults')}
      </div>
    );
  }

  return (
    <>
      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        onClearSelection={handleClearSelection}
        onActionComplete={handleBulkActionComplete}
      />
      
      {/* Group Sections */}
      <div className="space-y-4">
        {/* Active Groups Section */}
        {participantsByStatus.active.length > 0 && (
          <GroupSection
            title={t('groups.activeSection')}
            count={groupStats.active.count}
            groupNumbers={groupStats.active.numbers}
            dateRange={activeGroup ? `${formatDateBG(activeGroup.courseStartDate)} - ${formatDateBG(activeGroup.courseEndDate)}` : undefined}
            participantCount={participantsByStatus.active.length}
            isCollapsed={collapsedSections.active}
            onToggle={() => toggleSection('active')}
            variant="active"
          >
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto relative">
              <table className="min-w-full bg-white border border-slate-200">
                <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-700 border-b border-slate-200 w-12">
                      <input
                        type="checkbox"
                        checked={!collapsedSections.active && selectedIds.size > 0 && visibleParticipants.filter(p => !isParticipantReadOnly(p)).every(p => selectedIds.has(p.id))}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-300 cursor-pointer"
                        aria-label="Select all visible participants"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.companyName')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.personName')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.medicalDate')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.courseStart')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.courseEnd')}
                    </th>
                    <th 
                      className="px-3 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors duration-150"
                      onClick={() => handleSort('uniqueNumber')}
                    >
                      {t('participant.uniqueNumber')} {sortBy === 'uniqueNumber' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.sent')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.documents')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.handedOver')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.paid')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('participant.completed')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {t('common.delete')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {participantsByStatus.active.map(renderParticipantRow)}
                </tbody>
              </table>
            </div>
          </GroupSection>
        )}

        {/* Planned Groups Section */}
        {participantsByStatus.planned.length > 0 && (
          <GroupSection
            title={t('groups.plannedSection')}
            count={groupStats.planned.count}
            groupNumbers={groupStats.planned.numbers}
            isCollapsed={collapsedSections.planned}
            onToggle={() => toggleSection('planned')}
            variant="planned"
          >
            <div className="space-y-3">
              {plannedGroupedByNumber.map(({ groupNumber, group, participants }) => (
                <div key={groupNumber} className="bg-white border border-amber-200 rounded-lg overflow-hidden">
                  {/* Group Header */}
                  <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-900">Група {groupNumber}</span>
                        <span className="text-sm text-amber-700">
                          {formatDateBG(group.courseStartDate)} - {formatDateBG(group.courseEndDate)}
                        </span>
                      </div>
                      <span className="text-sm text-amber-700 font-medium">
                        {participants.length} {participants.length === 1 ? 'участник' : 'участника'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Group Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-slate-700 border-b border-slate-200 w-12">
                            <input
                              type="checkbox"
                              checked={participants.every(p => selectedIds.has(p.id))}
                              onChange={(e) => {
                                const newSelected = new Set(selectedIds);
                                if (e.target.checked) {
                                  participants.forEach(p => newSelected.add(p.id));
                                } else {
                                  participants.forEach(p => newSelected.delete(p.id));
                                }
                                setSelectedIds(newSelected);
                              }}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-300 cursor-pointer"
                              aria-label={`Select all in group ${groupNumber}`}
                            />
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                            {t('participant.companyName')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                            {t('participant.personName')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                            {t('participant.medicalDate')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                            {t('participant.courseStart')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                            {t('participant.courseEnd')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                            {t('participant.group')}
                          </th>
                          {/* Hidden for planned groups: Unique Number, Sent, HandedOver, Completed */}
                          <th className="px-3 py-2 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                            {t('participant.documents')}
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                            {t('participant.paid')}
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                            {t('common.delete')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {participants.map(renderPlannedParticipantRow)}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </GroupSection>
        )}

        {/* Completed Groups Section (Archive) */}
        {participantsByStatus.completed.length > 0 && (
          <GroupSection
            title={t('groups.completedSection')}
            count={groupStats.completed.count}
            isCollapsed={collapsedSections.completed}
            onToggle={() => toggleSection('completed')}
            variant="completed"
          >
            <div className="space-y-2">
              {completedGroupedByNumber.map(({ groupNumber, group, participants }) => (
                <ArchivedGroupAccordion
                  key={groupNumber}
                  groupNumber={groupNumber}
                  courseStartDate={group.courseStartDate}
                  courseEndDate={group.courseEndDate}
                  participants={participants}
                  renderParticipantRow={renderArchivedParticipantRow}
                />
              ))}
            </div>
          </GroupSection>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, participant: undefined })}
        onConfirm={confirmDelete}
        title={t('modal.deleteTitle')}
        message={t('modal.deleteMessage', { name: deleteConfirm.participant?.personName || '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </>
  );
};
