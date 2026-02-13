import React, { useState, useMemo, useEffect, useRef } from "react";
import { Participant, db, Group } from "../db/database";
import { useParticipants } from "../hooks/useParticipants";
import { useLanguage } from "../contexts/LanguageContext";
import { KebabMenu } from "./ui/KebabMenu";
import { DetailModal } from "./ui/DetailModal";
import { StatusChip } from "./ui/StatusChip";
import { Badge } from "./ui/Badge";
import { ConfirmModal } from "./ui/ConfirmModal";
import { CompanyBadge } from "./ui/CompanyBadge";
import { BulkActionBar } from "./ui/BulkActionBar";
import { GroupSection } from "./ui/GroupSection";
import { ArchivedGroupAccordion } from "./ui/ArchivedGroupAccordion";
import { formatDateBG } from "../utils/medicalValidation";
import { AlertModal } from "./ui/AlertModal";
import { useLiveQuery } from "dexie-react-hooks";

interface ParticipantCardListProps {
  participants: Participant[];
  onEdit: (participant: Participant) => void;
  onDelete: (id: string) => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  collapsedSections: {
    active: boolean;
    planned: boolean;
    completed: boolean;
  };
  toggleSection: (section: "active" | "planned" | "completed") => void;
  expandSection: (section: "active" | "planned" | "completed") => void;
  hasActiveFilters: boolean;
}

export const ParticipantCardList: React.FC<ParticipantCardListProps> = ({
  participants,
  onEdit,
  onDelete,
  onSelectionChange,
  collapsedSections,
  toggleSection,
  expandSection,
  hasActiveFilters,
}) => {
  const { t } = useLanguage();
  const { updateParticipant } = useParticipants();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(
    null
  );
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    participant?: Participant;
  }>({
    isOpen: false,
    participant: undefined,
  });

  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    participant?: Participant;
  }>({
    isOpen: false,
    participant: undefined,
  });

  const groups = useLiveQuery(() => db.groups.toArray(), []);
  const groupMap = useMemo(() => {
    if (!groups) return new Map();
    // Map by courseStartDate instead of groupNumber
    return new Map(groups.map((g) => [g.courseStartDate, g]));
  }, [groups]);

  // Group participants by group status
  const participantsByStatus = useMemo(() => {
    const active: Participant[] = [];
    const planned: Participant[] = [];
    const completed: Participant[] = [];

    participants.forEach((p) => {
      const group = groupMap.get(p.courseStartDate);
      
      if (!group) {
        // If no group exists for this courseStartDate (orphan), treat as planned
        // This prevents them from appearing in Active group incorrectly
        planned.push(p);
        return;
      }

      if (group.status === "active") {
        active.push(p);
      } else if (group.status === "planned") {
        planned.push(p);
      } else if (group.status === "completed") {
        completed.push(p);
      }
    });

    return { active, planned, completed };
  }, [participants, groupMap]);

  // Group planned participants by courseStartDate for visual separation
  // Show next 2 planned periods (from DB groups + any orphans)
  const plannedGroupedByDate = useMemo(() => {
    const grouped = new Map<
      string,
      { group: any; participants: Participant[] }
    >();

    // 1. Initialize with specific PLANNED groups from DB (to ensure empty ones show up)
    if (!hasActiveFilters && groups) {
      groups.forEach(g => {
        if (g.status === 'planned') {
          grouped.set(g.courseStartDate, { group: g, participants: [] });
        }
      });
    }

    // 2. Distribute participants into groups (including orphans)
    participantsByStatus.planned.forEach((p) => {
      let group = groupMap.get(p.courseStartDate);

      if (group && !grouped.has(p.courseStartDate)) {
        grouped.set(p.courseStartDate, { group, participants: [] });
      }
      
      // Handle orphan participants (virtual group)
      if (!group) {
         // Check if we already created a virtual group in step 1? No, step 1 is DB groups only.
         // If groupMap didn't have it, it's not in DB.
         if (!grouped.has(p.courseStartDate)) {
             const virtualGroup = {
                id: 'virtual-' + p.courseStartDate,
                groupNumber: null,
                courseStartDate: p.courseStartDate,
                courseEndDate: p.courseEndDate,
                status: 'planned',
                isLocked: false,
                createdAt: '',
                updatedAt: ''
             };
             grouped.set(p.courseStartDate, { group: virtualGroup, participants: [] });
         }
      }

      // Add participant to the correct group bucket
      if (grouped.has(p.courseStartDate)) {
        grouped.get(p.courseStartDate)!.participants.push(p);
      }
    });

    // Sort by courseStartDate ascending (earliest first)
    const sorted = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    const visible = hasActiveFilters ? sorted : sorted.slice(0, 2);

    return visible.map(([courseStartDate, data]) => ({
        courseStartDate,
        ...data,
      }));
  }, [participantsByStatus.planned, groupMap, groups, hasActiveFilters]);

  // Group completed participants by courseStartDate for accordion display
  const completedGroupedByDate = useMemo(() => {
    const grouped = new Map<
      string,
      { group: any; participants: Participant[] }
    >();

    participantsByStatus.completed.forEach((p) => {
      const group = groupMap.get(p.courseStartDate);
      if (!group) return;

      if (!grouped.has(p.courseStartDate)) {
        grouped.set(p.courseStartDate, { group, participants: [] });
      }
      grouped.get(p.courseStartDate)!.participants.push(p);
    });

    // Sort by courseStartDate descending (newest first)
    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([courseStartDate, data]) => ({
        courseStartDate,
        ...data,
      }));
  }, [participantsByStatus.completed, groupMap]);

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
         // Create virtual active group if missing from DB references but status logic said active
         // (Should be rare)
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
    
    // Sort by date
    return Array.from(grouped.values()).sort((a,b) => a.group.courseStartDate.localeCompare(b.group.courseStartDate));
  }, [participantsByStatus.active, groups, groupMap]);

  // Get unique periods for each status
  const groupStats = useMemo(() => {
    const activePeriods = new Set<string>();
    const plannedPeriods = new Set<string>();
    const completedPeriods = new Set<string>();

    // Active
    participantsByStatus.active.forEach((p) => activePeriods.add(p.courseStartDate));
    
    // Planned - include groups from DB and groups with participants
    if (!hasActiveFilters && groups) {
      groups.forEach(g => {
        if (g.status === 'planned') plannedPeriods.add(g.courseStartDate);
      });
    }
    participantsByStatus.planned.forEach((p) =>
      plannedPeriods.add(p.courseStartDate)
    );

    // Completed
    participantsByStatus.completed.forEach((p) =>
      completedPeriods.add(p.courseStartDate)
    );

    return {
      active: {
        count: activePeriods.size,
        periods: Array.from(activePeriods).sort(),
      },
      planned: {
        count: hasActiveFilters ? plannedPeriods.size : Math.min(plannedPeriods.size, 2), // Cap only when no active filters
        periods: Array.from(plannedPeriods).sort(),
      },
      completed: {
        count: completedPeriods.size,
        periods: Array.from(completedPeriods).sort(),
      },
    };
  }, [participantsByStatus, groups, hasActiveFilters]);

  // Auto-expand sections when search/filter results are present
  const prevParticipantsRef = useRef(participants);
  useEffect(() => {
    if (prevParticipantsRef.current !== participants && hasActiveFilters) {
      if (participantsByStatus.active.length > 0 && collapsedSections.active) {
        expandSection("active");
      }
      if (
        participantsByStatus.planned.length > 0 &&
        collapsedSections.planned
      ) {
        expandSection("planned");
      }
      if (
        participantsByStatus.completed.length > 0 &&
        collapsedSections.completed
      ) {
        expandSection("completed");
      }
      prevParticipantsRef.current = participants;
    }
  }, [
    participants,
    participantsByStatus,
    collapsedSections,
    expandSection,
    hasActiveFilters,
  ]);

  // Notify parent about selection changes
  useEffect(() => {
    onSelectionChange?.(selectedIds.size > 0);
  }, [selectedIds.size, onSelectionChange]);

  const handleCheckboxChange = async (
    participant: Participant,
    field: "sent" | "documents" | "handedOver" | "paid"
  ) => {
    // Check if group is locked
    const group = groupMap.get(participant.courseStartDate);
    if (group && group.status === "completed" && group.isLocked) {
      alert(t("lock.lockedInfo"));
      return;
    }

    try {
      await updateParticipant(participant.id, {
        [field]: !participant[field],
      });
    } catch (error) {
      console.error("Error updating participant:", error);
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

  const isGroupLocked = (participant: Participant): boolean => {
    const group = groupMap.get(participant.courseStartDate);
    return group ? group.status === "completed" && group.isLocked : false;
  };

  // Selection handlers
  const handleLongPressStart = (id: string, participant: Participant) => {
    // Don't allow selection of locked participants
    if (isGroupLocked(participant)) return;

    const timer = setTimeout(() => {
      setSelectedIds(new Set([id]));
    }, 500); // 500ms long press
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleCardClick = (id: string, participant: Participant) => {
    const isLocked = isGroupLocked(participant);
    if (selectedIds.size > 0) {
      // In selection mode - toggle selection (но не и за заключени)
      if (isLocked) return;
      const newSelection = new Set(selectedIds);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      setSelectedIds(newSelection);
    }
    // В нормален режим не правим нищо при клик (edit само през менюто)
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkActionComplete = () => {
    setSelectedIds(new Set());
  };

  const handleDeleteClick = (participant: Participant) => {
    setDeleteConfirm({ isOpen: true, participant });
  };

  const confirmDelete = () => {
    if (deleteConfirm.participant) {
      onDelete(deleteConfirm.participant.id);
    }
    setDeleteConfirm({ isOpen: false, participant: undefined });
  };

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'success' | 'error' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info'
  });

  const handleGenerateCertificate = async (participant: Participant) => {
    try {
      let group = groupMap.get(participant.courseStartDate);
      
      if (!group) {
        // Fallback: Create virtual group for orphans to allow generation
        group = {
            id: 'virtual',
            groupNumber: null,
            courseStartDate: participant.courseStartDate,
            courseEndDate: participant.courseEndDate,
            status: 'planned',
            isLocked: false,
            createdAt: '',
            updatedAt: ''
         } as unknown as Group;
      }
      
      const { generateCertificate } = await import('../utils/certificateGenerator');
      await generateCertificate(participant, group);
      setAlertModal({
        isOpen: true,
        title: t('common.success'),
        message: t('certificate.generated'),
        variant: 'success'
      });
    } catch (error) {
      setAlertModal({
        isOpen: true,
        title: t('common.error'),
        message: t('certificate.error') + ': ' + (error as Error).message,
        variant: 'error'
      });
    }
  };

  // Render a participant card
  const renderParticipantCard = (participant: Participant, _index?: number) => {
    const isSelected = selectedIds.has(participant.id);
    const isLocked = isGroupLocked(participant);

    return (
      <div
        key={participant.id}
        onClick={() => handleCardClick(participant.id, participant)}
        onTouchStart={() => handleLongPressStart(participant.id, participant)}
        onTouchEnd={handleLongPressEnd}
        onMouseDown={() => handleLongPressStart(participant.id, participant)}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
        className={`bg-white rounded-lg shadow-sm p-3 md:p-4 border transition-all duration-150 ${
          isSelected
            ? "border-blue-500 ring-2 ring-blue-200"
            : "border-slate-200"
        } ${isLocked ? "opacity-75" : "cursor-pointer hover:shadow-md"}`}
      >
        {/* Header with Name, Badge and Kebab Menu */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0">
            <div className="mb-1">
              <CompanyBadge companyName={participant.companyName} />
            </div>
            <div className="flex items-center gap-2">
              {isSelected && (
                <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center shrink-0">
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
              <h3 className="font-bold text-lg text-slate-900 leading-tight truncate">
                {participant.personName}
              </h3>
              {isLocked && (
                <span
                  className="text-xs text-slate-500 shrink-0"
                  title={t("lock.lockedInfo")}
                >
                  🔒
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1 items-end">
              {participant.uniqueNumber && (
                <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
                  {participant.uniqueNumber}
                </span>
              )}
              <div className="flex gap-1">
                {getCompletedValue(participant) ? (
                  <Badge
                    label={t("participant.completedBadge")}
                    variant="success"
                    icon="check"
                  />
                ) : (
                  <span className="text-[10px] text-slate-400 italic font-medium">{t('completed.pending')}</span>
                )}
                {isCompletedOverridden(participant) && (
                  <Badge
                    label={t("participant.manual")}
                    variant="info"
                    icon="manual"
                  />
                )}
              </div>
            </div>
            {!isLocked && (
              <KebabMenu
                onEdit={() => onEdit(participant)}
                onDetails={() => setDetailModal({ isOpen: true, participant })}
                onGenerate={groupMap.get(participant.courseStartDate)?.status === 'active' 
                  ? () => handleGenerateCertificate(participant) 
                  : undefined}
                onDelete={() => handleDeleteClick(participant)}
              />
            )}
          </div>
        </div>

        {/* Dates and Group */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-2 mb-3">
          <div className="flex flex-col min-w-0">
            <span className="text-slate-500 text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold truncate">
              {t("participant.medical")}
            </span>
            <span className="font-bold text-sm text-slate-900 truncate">
              {formatDateBG(participant.medicalDate)}
            </span>
          </div>
          <div className="flex flex-col min-w-0 text-right">
            <span className="text-slate-500 text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold truncate">
              {t("participant.period")}
            </span>
            <span className="font-bold text-sm text-slate-900 truncate">
              {formatDateBG(participant.courseStartDate)}
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-slate-500 text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold truncate">
              {t("participant.courseStart")}
            </span>
            <span className="font-bold text-sm text-slate-900 truncate">
              {formatDateBG(participant.courseStartDate)}
            </span>
          </div>
          <div className="flex flex-col min-w-0 text-right">
            <span className="text-slate-500 text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold truncate">
              {t("participant.courseEnd")}
            </span>
            <span className="font-bold text-sm text-slate-900 truncate">
              {formatDateBG(participant.courseEndDate)}
            </span>
          </div>
        </div>

        {/* Status Chips */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCheckboxChange(participant, "sent");
            }}
            disabled={isLocked}
            className="active:scale-95 transition-transform duration-150 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <StatusChip
              label={t("participant.sent")}
              isActive={participant.sent}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCheckboxChange(participant, "documents");
            }}
            disabled={isLocked}
            className="active:scale-95 transition-transform duration-150 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <StatusChip
              label={t("participant.documents")}
              isActive={participant.documents}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCheckboxChange(participant, "handedOver");
            }}
            disabled={isLocked}
            className="active:scale-95 transition-transform duration-150 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <StatusChip
              label={t("participant.handed")}
              isActive={participant.handedOver}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCheckboxChange(participant, "paid");
            }}
            disabled={isLocked}
            className="active:scale-95 transition-transform duration-150 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <StatusChip
              label={t("participant.paid")}
              isActive={participant.paid}
            />
          </button>
        </div>
      </div>
    );
  };

  // Simplified render for archived participants (read-only card)
  const renderArchivedParticipantCard = (participant: Participant) => {
    return (
      <div
        key={participant.id}
        className="bg-white rounded-lg p-3 border border-slate-200"
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1 min-w-0 pr-2">
            <div className="mb-1">
              <CompanyBadge companyName={participant.companyName} />
            </div>
            <h4 className="font-semibold text-slate-900 truncate">
              {participant.personName}
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1 items-end shrink-0">
              {participant.uniqueNumber && (
                <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
                  {participant.uniqueNumber}
                </span>
              )}
              <div className="flex gap-1">
                {getCompletedValue(participant) ? (
                  <Badge
                    label={t("participant.completedBadge")}
                    variant="success"
                    icon="check"
                  />
                ) : (
                  <span className="text-[10px] text-slate-400 italic font-medium">{t('completed.pending')}</span>
                )}
                {isCompletedOverridden(participant) && (
                  <Badge
                    label={t("participant.manual")}
                    variant="info"
                    icon="manual"
                  />
                )}
              </div>
            </div>
            <KebabMenu
              onDetails={() => setDetailModal({ isOpen: true, participant })}
            />
          </div>
        </div>

        <div className="text-sm text-slate-600 mb-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
            {t("participant.medical")}: {formatDateBG(participant.medicalDate)}
          </div>
        </div>

        <div className="flex flex-nowrap justify-between items-center gap-0.5 mt-auto pt-2 border-t border-slate-50 overflow-hidden">
          <label className="flex items-center gap-0.5 text-[8px] sm:text-[9px] text-slate-500 whitespace-nowrap">
            <input
              type="checkbox"
              checked={participant.sent}
              disabled
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-600 rounded opacity-60 cursor-not-allowed"
            />
            {t("participant.sent")}
          </label>
          <label className="flex items-center gap-0.5 text-[8px] sm:text-[9px] text-slate-500 whitespace-nowrap">
            <input
              type="checkbox"
              checked={participant.documents}
              disabled
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-600 rounded opacity-60 cursor-not-allowed"
            />
            {t("participant.documents")}
          </label>
          <label className="flex items-center gap-0.5 text-[8px] sm:text-[9px] text-slate-500 whitespace-nowrap">
            <input
              type="checkbox"
              checked={participant.handedOver}
              disabled
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-600 rounded opacity-60 cursor-not-allowed"
            />
            {t("participant.handed")}
          </label>
          <label className="flex items-center gap-0.5 text-[8px] sm:text-[9px] text-slate-500 whitespace-nowrap">
            <input
              type="checkbox"
              checked={participant.paid}
              disabled
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-600 rounded opacity-60 cursor-not-allowed"
            />
            {t("participant.paid")}
          </label>
        </div>
      </div>
    );
  };

  if (participants.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        {t("participants.noResults")}
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

      <DetailModal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal({ isOpen: false, participant: undefined })}
        participant={detailModal.participant}
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant === 'error' ? 'danger' : alertModal.variant}
      />

      {/* Group Sections */}
      <div className="space-y-4 pb-32">
        {/* Active Groups Section */}
        {(participantsByStatus.active.length > 0 || !hasActiveFilters) && (
        <GroupSection
          title={t("groups.activeSection")}
          count={groupStats.active.count}
          groupNumbers={activeGroupedByDate.length <= 1 && activeGroupNumber.length > 0 ? activeGroupNumber : []}
          dateRange={activeGroupedByDate.length <= 1 ? activeDateRange : undefined}
          participantCount={participantsByStatus.active.length}
          isCollapsed={collapsedSections.active}
          onToggle={() => toggleSection("active")}
          showCount={activeGroupedByDate.length <= 1 ? (Math.max(activeGroupNumber.length, 0) > 0) : true}
          variant="active"
        >
          {activeGroupedByDate.length === 0 ? (
             <div className="text-center py-8 text-slate-500 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
               <p>{t("participants.noActive")}</p>
             </div>
          ) : (
            <div className="space-y-8">
              {activeGroupedByDate.map((data) => (
                <div key={data.group.courseStartDate} className="space-y-4">
                  {/* Show sub-header only if multiple active groups exists (uncommon/bug state) */}
                  {activeGroupedByDate.length > 1 && (
                    <div className="flex items-center gap-2 pb-2 border-b border-blue-100">
                      <span className="font-semibold text-blue-900">
                        {formatDateBG(data.group.courseStartDate)} - {formatDateBG(data.group.courseEndDate)}
                      </span>
                      {data.group.groupNumber && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                          № {data.group.groupNumber}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Participants List */}
                  {data.participants.length > 0 ? (
                    <div className="space-y-4">
                      {data.participants.map((p, i) =>
                        renderParticipantCard(p, i)
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 italic text-slate-400 bg-white/50 rounded border border-dashed border-slate-100">
                      {t("participants.noParticipantsInGroup")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </GroupSection>
        )}

        {/* Planned Groups Section */}
        {(participantsByStatus.planned.length > 0 || !hasActiveFilters) && (
        <GroupSection
          title={t("groups.plannedSection")}
          count={groupStats.planned.count}
          groupNumbers={plannedGroupedByDate.map(g => g.group.groupNumber).filter((n): n is number => n !== null)}
          participantCount={participantsByStatus.planned.length}
          isCollapsed={collapsedSections.planned}
          onToggle={() => toggleSection("planned")}
          variant="planned"
        >
          {plannedGroupedByDate.length > 0 ? (
            <div className="space-y-3">
              {plannedGroupedByDate.map(
                ({ courseStartDate, group, participants }) => (
                  <div
                    key={courseStartDate}
                    className="bg-white border-2 border-amber-200 rounded-lg overflow-hidden"
                  >
                    {/* Group Header */}
                    <div className="bg-amber-50 px-3 py-2 border-b border-amber-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {group.groupNumber && (
                            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded text-xs font-semibold">
                              № {group.groupNumber}
                            </span>
                          )}
                          <span className="font-semibold text-amber-900">
                            {formatDateBG(group.courseStartDate)} - {formatDateBG(group.courseEndDate)}
                          </span>
                        </div>
                        <span className="text-xs text-amber-700 font-medium">
                          {participants.length} {participants.length === 1 ? t('group.participant_one') : t('group.participant_other')}
                        </span>
                      </div>
                    </div>

                    {/* Group Cards */}
                    <div className="p-2 space-y-2">
                      {participants.map((p: Participant, i: number) => renderParticipantCard(p, i))}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              {t('participants.noParticipantsInGroup')}
            </div>
          )}
        </GroupSection>
        )}

        {/* Completed Groups Section (Archive) */}
        {(participantsByStatus.completed.length > 0 || !hasActiveFilters) && (
        <GroupSection
          title={t("groups.completedSection")}
          count={groupStats.completed.count}
          participantCount={participantsByStatus.completed.length}
          isCollapsed={collapsedSections.completed}
          onToggle={() => toggleSection("completed")}
          variant="completed"
        >
          {completedGroupedByDate.length > 0 ? (
            <div className="space-y-2">
              {completedGroupedByDate.map(
                ({ courseStartDate, group, participants }) => (
                  <ArchivedGroupAccordion
                    key={courseStartDate}
                    groupNumber={group.groupNumber || 0}
                    courseStartDate={group.courseStartDate}
                    courseEndDate={group.courseEndDate}
                    participants={participants}
                    renderParticipantRow={renderArchivedParticipantCard}
                    mode="cards"
                    defaultExpanded={hasActiveFilters}
                  />
                )
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              Няма приключени групи
            </div>
          )}
        </GroupSection>
        )}
      </div>

      {/* Empty State - No Results */}
      {hasActiveFilters && participants.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            Няма намерени резултати
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            Опитай да промениш филтрите
          </p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() =>
          setDeleteConfirm({ isOpen: false, participant: undefined })
        }
        onConfirm={confirmDelete}
        title={t("modal.deleteTitle")}
        message={t("modal.deleteMessage", {
          name: deleteConfirm.participant?.personName || "",
        })}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        variant="danger"
      />
    </>
  );
};
