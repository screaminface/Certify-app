import React, { useState, useMemo, useEffect } from 'react';
import { Participant, db, Group } from '../db/database';
import { useParticipants } from '../hooks/useParticipants';
import { useLanguage } from '../contexts/LanguageContext';
import { ConfirmModal } from './ui/ConfirmModal';
import { CompanyBadge } from './ui/CompanyBadge';
import { BulkActionBar } from './ui/BulkActionBar';
import { GroupSection } from './ui/GroupSection';
import { ArchivedGroupAccordion } from './ui/ArchivedGroupAccordion';
import { formatDateBG } from '../utils/medicalValidation';
import { isGroupReadOnly } from '../utils/groupUtils';
import { generateCertificate } from '../utils/certificateGenerator';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertModal } from './ui/AlertModal';


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
  groupRefreshKey = 0
}) => {
  const { updateParticipant } = useParticipants();
  const { t } = useLanguage();
  const [sortBy, setSortBy] = useState<'courseStartDate' | 'groupNumber' | 'uniqueNumber'>('uniqueNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; participant?: Participant }>({
    isOpen: false,
    participant: undefined
  });
  
  // Tooltip state
  const [tooltip, setTooltip] = useState<{ participant: Participant, x: number, y: number } | null>(null);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'success' | 'error' | 'info' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info'
  });

  const handleNameMouseEnter = (e: React.MouseEvent, participant: Participant) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      participant,
      x: rect.left,
      y: rect.top - 8 // Position slightly above
    });
  };

  const handleNameMouseLeave = () => {
    setTooltip(null);
  };

  const groups = useLiveQuery(() => db.groups.toArray(), [groupRefreshKey]);
  const groupMap = useMemo(() => {
    if (!groups) return new Map<string, Group>();
    // Map by courseStartDate
    return new Map(groups.map(g => [g.courseStartDate, g]));
  }, [groups]);

  // Sort participants
  const sortedParticipants = useMemo(() => {
    const sorted = [...participants].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'courseStartDate') {
        comparison = a.courseStartDate.localeCompare(b.courseStartDate);
      } else if (sortBy === 'groupNumber') {
        // Sort by date instead of group number (since groupNumber is gone from participant)
        comparison = a.courseStartDate.localeCompare(b.courseStartDate);
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
      const group = groupMap.get(p.courseStartDate);
      
      if (!group) {
        // If group not found (orphan), treat as planned
        planned.push(p);
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

  // Find active group for display metadata
  const activeGroup = useMemo(() => groups?.find(g => g.status === 'active'), [groups]);
  const activeGroupNumber = activeGroup?.groupNumber ? [activeGroup.groupNumber] : [];
  const activeDateRange = activeGroup ? `${formatDateBG(activeGroup.courseStartDate)} - ${formatDateBG(activeGroup.courseEndDate)}` : undefined;

  // Group Active participants by courseStartDate (handle multiple active groups edge case)
  const activeGroupedByDate = useMemo(() => {
    const grouped = new Map<string, { group: Group; participants: Participant[] }>();
    
    // 1. Find all active groups
    groups?.forEach(g => {
      if (g.status === 'active') {
        grouped.set(g.courseStartDate, { group: g, participants: [] });
      }
    });

    // 2. Distribute participants
    participantsByStatus.active.forEach(p => {
       const existing = grouped.get(p.courseStartDate);
       if (existing) {
         existing.participants.push(p);
       } else {
         const virtGroup = groupMap.get(p.courseStartDate) || {
            id: 'virt-active-' + p.courseStartDate,
            courseStartDate: p.courseStartDate,
            courseEndDate: p.courseEndDate,
            status: 'active',
            groupNumber: null,
            isLocked: false,
            createdAt: '',
            updatedAt: ''
         } as Group;
         
         grouped.set(p.courseStartDate, { group: virtGroup, participants: [p] });
       }
    });
    
    return Array.from(grouped.values()).sort((a,b) => a.group.courseStartDate.localeCompare(b.group.courseStartDate));
  }, [participantsByStatus.active, groups, groupMap]);

  // Group planned participants by courseStartDate
  const plannedGroupedByDate = useMemo(() => {
    const grouped = new Map<string, { group: Group; participants: Participant[] }>();
    
    // 1. Initialize with specific PLANNED groups from DB
    if (groups) {
      groups.forEach(g => {
        if (g.status === 'planned') {
          grouped.set(g.courseStartDate, { group: g, participants: [] });
        }
      });
    }

    // 2. Distribute participants
    participantsByStatus.planned.forEach(p => {
      let group = groupMap.get(p.courseStartDate);
      
      if (!group) {
         if (!grouped.has(p.courseStartDate)) {
             const virtualGroup = {
                id: 'virtual-planned-' + p.courseStartDate,
                groupNumber: null,
                courseStartDate: p.courseStartDate,
                courseEndDate: p.courseEndDate,
                status: 'planned',
                isLocked: false,
                createdAt: '',
                updatedAt: ''
             } as Group;
             grouped.set(p.courseStartDate, { group: virtualGroup, participants: [] });
         }
      }

      if (grouped.has(p.courseStartDate)) {
        grouped.get(p.courseStartDate)!.participants.push(p);
      }
    });

    // Sort by courseStartDate ascending
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 2)
      .map(([courseStartDate, data]) => ({
        courseStartDate,
        ...data
      }));
  }, [participantsByStatus.planned, groupMap, groups]);

  // Group completed participants by courseStartDate
  const completedGroupedByDate = useMemo(() => {
    const grouped = new Map<string, { group: Group; participants: Participant[] }>();
    
    participantsByStatus.completed.forEach(p => {
      const group = groupMap.get(p.courseStartDate);
      if (!group) return;
      
      if (!grouped.has(p.courseStartDate)) {
        grouped.set(p.courseStartDate, { group, participants: [] });
      }
      grouped.get(p.courseStartDate)!.participants.push(p);
    });
    
    // Sort by courseStartDate descending
    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([courseStartDate, data]) => ({
        courseStartDate,
        ...data
      }));
  }, [participantsByStatus.completed, groupMap]);

  // Get unique periods for each status
  const groupStats = useMemo(() => {
    const activePeriods = new Set<string>(); // Count periods, not group numbers
    const plannedPeriods = new Set<string>();
    const completedPeriods = new Set<string>();
    
    // Use grouped calculated data to count
    activeGroupedByDate.forEach(g => activePeriods.add(g.group.courseStartDate));

    // For planned, we might want total count of all planned groups available?
    // The previous logic counted distinct group numbers of participants.
    // Let's count periods from groups + participants.
    // Actually, stick to simple distinct periods from participants + groups logic.
    if (groups) {
        groups.forEach(g => {
            if (g.status === 'active') activePeriods.add(g.courseStartDate);
            if (g.status === 'planned') plannedPeriods.add(g.courseStartDate);
            if (g.status === 'completed') completedPeriods.add(g.courseStartDate);
        });
    }
    // Also add from orphans
    participantsByStatus.active.forEach(p => activePeriods.add(p.courseStartDate));
    participantsByStatus.planned.forEach(p => plannedPeriods.add(p.courseStartDate));
    participantsByStatus.completed.forEach(p => completedPeriods.add(p.courseStartDate));

    return {
      active: { count: activePeriods.size, numbers: [] }, // numbers field is legacy for GroupSection, we pass explicitly now
      planned: { count: plannedPeriods.size, numbers: [] },
      completed: { count: completedPeriods.size, numbers: [] }
    };
  }, [participantsByStatus, groups, activeGroupedByDate]);

  // Sync group dates with participants on mount
  useEffect(() => {
    const syncAllGroups = async () => {
      // Use the new syncGroups function which handles everything
      const { syncGroups } = await import('../utils/groupUtils');
      await syncGroups();
    };
    syncAllGroups();
  }, []);

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
    const group = groupMap.get(participant.courseStartDate);
    if (isGroupReadOnly(group)) {
      setAlertModal({
        isOpen: true,
        title: t('common.info'),
        message: t('lock.lockedInfo'),
        variant: 'info'
      });
      return;
    }

    try {
      await updateParticipant(participant.id, {
        [field]: !participant[field]
      });
    } catch (error) {
      console.error('Error updating participant:', error);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: 'Failed to update participant',
        variant: 'error'
      });
    }
  };

  const handleCompletedToggle = async (participant: Participant) => {
    // Check if group is read-only
    const group = groupMap.get(participant.courseStartDate);
    if (isGroupReadOnly(group)) {
      setAlertModal({
        isOpen: true,
        title: t('common.info'),
        message: t('lock.lockedInfo'),
        variant: 'info'
      });
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
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: 'Failed to update completed status',
        variant: 'error'
      });
    }
  };

  const handleResetCompleted = async (participant: Participant) => {
    // Check if group is read-only
    const group = groupMap.get(participant.courseStartDate);
    if (isGroupReadOnly(group)) {
      setAlertModal({
        isOpen: true,
        title: t('common.info'),
        message: t('lock.lockedInfo'),
        variant: 'info'
      });
      return;
    }

    try {
      await updateParticipant(participant.id, {
        completedOverride: null
      });
    } catch (error) {
      console.error('Error resetting completed status:', error);
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: 'Failed to reset completed status',
        variant: 'error'
      });
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
      let group = groupMap.get(participant.courseStartDate);
      
      // Fallback virtual group if missing (same logic as ParticipantCardList)
      if (!group) {
         group = {
            id: 'virtual-cert',
            groupNumber: null,
            courseStartDate: participant.courseStartDate,
            courseEndDate: participant.courseEndDate,
            status: 'planned',
            isLocked: false,
            createdAt: '',
            updatedAt: ''
         } as Group;
      }

      await generateCertificate(participant, group);
      setAlertModal({
        isOpen: true,
        title: t('common.success'),
        message: 'Сертификатът е генериран успешно!',
        variant: 'success'
      });
    } catch (error) {
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: 'Грешка при генериране на сертификат: ' + (error as Error).message,
        variant: 'error'
      });
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
    const group = groupMap.get(participant.courseStartDate);
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
          <div 
            className="max-w-xs truncate cursor-help" 
            onMouseEnter={(e) => handleNameMouseEnter(e, participant)}
            onMouseLeave={handleNameMouseLeave}
          >
            {participant.personName}
          </div>
        </td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.medicalDate)}</td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.courseStartDate)}</td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.courseEndDate)}</td>
        <td className="px-3 py-3 text-sm">
          <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded inline-block text-slate-700" title="Уникален номер на удостоверение">
            {participant.uniqueNumber || "---"}
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
          <div 
            className="max-w-xs truncate cursor-help"
            onMouseEnter={(e) => handleNameMouseEnter(e, participant)}
            onMouseLeave={handleNameMouseLeave}
          >
            {participant.personName}
          </div>
        </td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.medicalDate)}</td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.courseStartDate)}</td>
        <td className="px-3 py-3 text-sm text-slate-600">{formatDateBG(participant.courseEndDate)}</td>

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
        <td className="px-3 py-2 text-sm text-slate-900">
          <div 
            className="cursor-help"
            onMouseEnter={(e) => handleNameMouseEnter(e, participant)}
            onMouseLeave={handleNameMouseLeave}
          >
            {participant.personName}
          </div>
        </td>
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
    const group = groupMap.get(participant.courseStartDate);
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

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />
      
      {/* Group Sections */}
      <div className="space-y-4">
        {/* Active Groups Section */}
        <GroupSection
          title={t('groups.activeSection')}
          count={groupStats.active.count}
          groupNumbers={activeGroupedByDate.length <= 1 ? activeGroupNumber : []}
          dateRange={activeGroupedByDate.length <= 1 ? activeDateRange : undefined}
          participantCount={participantsByStatus.active.length}
          isCollapsed={collapsedSections.active}
          onToggle={() => toggleSection('active')}
          variant="active"
        >
          {activeGroupedByDate.length === 0 ? (
             <div className="text-center py-8 text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
               {t('participants.noActive')}
             </div>
          ) : (
            <div className="space-y-8">
              {activeGroupedByDate.map((data) => (
                <div key={data.group.courseStartDate} className="space-y-3">
                  {/* Sub-header for multiple active groups */}
                  {activeGroupedByDate.length > 1 && (
                    <div className="flex items-center gap-2 pb-2 border-b border-blue-100">
                       <span className="font-bold text-blue-900">
                          {formatDateBG(data.group.courseStartDate)} - {formatDateBG(data.group.courseEndDate)}
                       </span>
                       {data.group.groupNumber && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-bold">
                             № {data.group.groupNumber}
                          </span>
                       )}
                    </div>
                  )}

                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto relative rounded-lg border border-slate-200">
                    <table className="min-w-full bg-white">
                      <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                        <tr>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-slate-700 border-b border-slate-200 w-12">
                            <input
                              type="checkbox"
                              checked={data.participants.length > 0 && data.participants.every(p => selectedIds.has(p.id))}
                              onChange={(e) => {
                                const newSelected = new Set(selectedIds);
                                if (e.target.checked) {
                                  data.participants.filter(p => !isParticipantReadOnly(p)).forEach(p => newSelected.add(p.id));
                                } else {
                                  data.participants.forEach(p => newSelected.delete(p.id));
                                }
                                setSelectedIds(newSelected);
                              }}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-300 cursor-pointer"
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
                        {data.participants.length > 0 ? (
                           data.participants.map(renderParticipantRow)
                        ) : (
                           <tr>
                              <td colSpan={13} className="text-center py-8 text-slate-400 italic">
                                 {t("participants.noParticipantsInGroup")}
                              </td>
                           </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GroupSection>

        {/* Planned Groups Section */}
        {plannedGroupedByDate.length > 0 && (
          <GroupSection
            title={t('groups.plannedSection')}
            count={groupStats.planned.count}
            groupNumbers={[]}
            isCollapsed={collapsedSections.planned}
            onToggle={() => toggleSection('planned')}
            variant="planned"
          >
            <div className="space-y-6">
              {plannedGroupedByDate.map(({ courseStartDate, group, participants }) => (
                <div key={courseStartDate} className="bg-white border border-amber-200 rounded-lg overflow-hidden">
                  {/* Group Header */}
                  <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-900">
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
                              checked={participants.length > 0 && participants.every(p => selectedIds.has(p.id))}
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
                        {participants.length > 0 ? (
                           participants.map(renderPlannedParticipantRow)
                        ) : (
                           <tr>
                              <td colSpan={10} className="text-center py-4 text-slate-400 italic">
                                 {t("participants.noParticipantsInGroup")}
                              </td>
                           </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </GroupSection>
        )}

        {/* Completed Groups Section */}
        {completedGroupedByDate.length > 0 && (
          <GroupSection
            title={t('groups.completedSection')}
            count={groupStats.completed.count}
            groupNumbers={groupStats.completed.numbers} /* numbers legacy prop, optional */
            isCollapsed={collapsedSections.completed}
            onToggle={() => toggleSection('completed')}
            variant="completed"
          >
            <div className="space-y-4">
              {completedGroupedByDate.map(({ courseStartDate, group, participants }) => (
                <div key={courseStartDate}>
                  <ArchivedGroupAccordion
                    groupNumber={group.groupNumber || 0}
                    courseStartDate={group.courseStartDate}
                    courseEndDate={group.courseEndDate}
                    participants={participants}                  renderParticipantRow={renderArchivedParticipantRow}
                  />
                </div>
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
      
      {/* Participant Detail Tooltip */}
      {tooltip && (
        <div 
          className="fixed z-50 bg-slate-800 text-white text-xs p-3 rounded shadow-lg pointer-events-none transform -translate-y-full filter drop-shadow-md"
          style={{ 
            left: tooltip.x, 
            top: tooltip.y,
            minWidth: '220px'
          }}
        >
          <div className="font-bold mb-2 border-b border-slate-600 pb-1 text-slate-100">
            {tooltip.participant.personName}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <span className="text-slate-400 text-right">{t('participant.egn')}:</span>
            <span className="font-mono">{tooltip.participant.egn || '-'}</span>
            
            <span className="text-slate-400 text-right">{t('participant.birthPlace')}:</span>
            <span>{tooltip.participant.birthPlace || '-'}</span>

            <span className="text-slate-400 text-right">{t('participant.added')}:</span>
            <span>{tooltip.participant.createdAt ? formatDateBG(tooltip.participant.createdAt) : '-'}</span>
            
            <span className="text-slate-400 text-right">{t('participant.modified')}:</span>
            <span>{tooltip.participant.updatedAt ? formatDateBG(tooltip.participant.updatedAt) : '-'}</span>
          </div>
        </div>
      )}
    </>
  );
};

export default ParticipantList;
