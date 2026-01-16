import React, { useState, useMemo, useEffect, useRef } from "react";
import { Participant, db } from "../db/database";
import { useParticipants } from "../hooks/useParticipants";
import { useLanguage } from "../contexts/LanguageContext";
import { KebabMenu } from "./ui/KebabMenu";
import { StatusChip } from "./ui/StatusChip";
import { Badge } from "./ui/Badge";
import { ConfirmModal } from "./ui/ConfirmModal";
import { CompanyBadge } from "./ui/CompanyBadge";
import { BulkActionBar } from "./ui/BulkActionBar";
import { GroupSection } from "./ui/GroupSection";
import { ArchivedGroupAccordion } from "./ui/ArchivedGroupAccordion";
import { formatDateBG } from "../utils/medicalValidation";
import { generateCertificate } from "../utils/certificateGenerator";
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
  // ...existing code...
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
        // If no group exists for this courseStartDate, treat as active
        active.push(p);
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
  const plannedGroupedByDate = useMemo(() => {
    const grouped = new Map<
      string,
      { group: any; participants: Participant[] }
    >();

    participantsByStatus.planned.forEach((p) => {
      const group = groupMap.get(p.courseStartDate);
      if (!group) return;

      if (!grouped.has(p.courseStartDate)) {
        grouped.set(p.courseStartDate, { group, participants: [] });
      }
      grouped.get(p.courseStartDate)!.participants.push(p);
    });

    // Sort by courseStartDate ascending (earliest first)
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([courseStartDate, data]) => ({
        courseStartDate,
        ...data,
      }));
  }, [participantsByStatus.planned, groupMap]);

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

  // Get unique periods for each status
  const groupStats = useMemo(() => {
    const activePeriods = new Set<string>();
    const plannedPeriods = new Set<string>();
    const completedPeriods = new Set<string>();

    participantsByStatus.active.forEach((p) => activePeriods.add(p.courseStartDate));
    participantsByStatus.planned.forEach((p) =>
      plannedPeriods.add(p.courseStartDate)
    );
    participantsByStatus.completed.forEach((p) =>
      completedPeriods.add(p.courseStartDate)
    );

    return {
      active: {
        count: activePeriods.size,
        periods: Array.from(activePeriods).sort(),
      },
      planned: {
        count: plannedPeriods.size,
        periods: Array.from(plannedPeriods).sort(),
      },
      completed: {
        count: completedPeriods.size,
        periods: Array.from(completedPeriods).sort(),
      },
    };
  }, [participantsByStatus]);

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

  const handleGenerateCertificate = async (participant: Participant) => {
    try {
      const group = groupMap.get(participant.courseStartDate);
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
        className={`bg-white rounded-lg shadow-sm p-4 border transition-all duration-150 ${
          isSelected
            ? "border-blue-500 ring-2 ring-blue-200"
            : "border-slate-200"
        } ${isLocked ? "opacity-75" : "cursor-pointer hover:shadow-md"}`}
      >
        {/* Header with Kebab Menu */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {isSelected && (
                <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
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
              <h3 className="font-bold text-lg text-slate-900">
                {participant.personName}
              </h3>
              {isLocked && (
                <span
                  className="text-xs text-slate-500"
                  title={t("lock.lockedInfo")}
                >
                  🔒
                </span>
              )}
            </div>
            <div className="mt-1">
              <CompanyBadge companyName={participant.companyName} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1 items-end">
              <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
                {participant.uniqueNumber}
              </span>
              <div className="flex gap-1">
                <Badge
                  label={
                    getCompletedValue(participant)
                      ? t("participant.completedBadge")
                      : t("participant.notCompleted")
                  }
                  variant={
                    getCompletedValue(participant) ? "success" : "neutral"
                  }
                  icon={getCompletedValue(participant) ? "check" : undefined}
                />
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
                onGenerate={() => handleGenerateCertificate(participant)}
                onDelete={() => handleDeleteClick(participant)}
              />
            )}
          </div>
        </div>

        {/* Dates and Group */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
          <div>
            <span className="text-slate-500">{t("participant.medical")}:</span>
            <span className="ml-1 font-medium text-slate-900">
              {formatDateBG(participant.medicalDate)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t("participant.period")}:</span>
            <span className="ml-1 font-medium text-slate-900">
              {formatDateBG(participant.courseStartDate)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">
              {t("participant.courseStart")}:
            </span>
            <span className="ml-1 font-medium text-slate-900">
              {formatDateBG(participant.courseStartDate)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">
              {t("participant.courseEnd")}:
            </span>
            <span className="ml-1 font-medium text-slate-900">
              {formatDateBG(participant.courseEndDate)}
            </span>
          </div>
        </div>

        {/* Status Chips */}
        <div className="flex gap-1">
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
    const completed =
      participant.completedOverride !== null
        ? participant.completedOverride
        : participant.completedComputed;

    return (
      <div
        key={participant.id}
        className="bg-white rounded-lg p-3 border border-slate-200"
      >
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-semibold text-slate-900">
              {participant.personName}
            </h4>
            <CompanyBadge companyName={participant.companyName} />
          </div>
          <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
            {participant.uniqueNumber}
          </span>
        </div>

        <div className="text-sm text-slate-600 mb-2">
          <div>
            {t("participant.medical")}: {formatDateBG(participant.medicalDate)}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={participant.sent}
              disabled
              className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
            />
            Изпратен
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={participant.documents}
              disabled
              className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
            />
            Документи
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={participant.handedOver}
              disabled
              className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
            />
            Предаден
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={participant.paid}
              disabled
              className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
            />
            Платен
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={completed}
              disabled
              className="w-4 h-4 text-emerald-600 rounded opacity-60 cursor-not-allowed"
            />
            Завършен
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

      {/* Group Sections */}
      <div className="space-y-4 pb-32">
        {/* Active Groups Section */}
        {participantsByStatus.active.length > 0 && (
          <GroupSection
            title={t("groups.activeSection")}
            count={groupStats.active.count}
            groupNumbers={[]}
            isCollapsed={collapsedSections.active}
            onToggle={() => toggleSection("active")}
            variant="active"
          >
            <div className="space-y-4">
              {participantsByStatus.active.map((p, i) =>
                renderParticipantCard(p, i)
              )}
            </div>
          </GroupSection>
        )}

        {/* Planned Groups Section */}
        {participantsByStatus.planned.length > 0 && (
          <GroupSection
            title={t("groups.plannedSection")}
            count={groupStats.planned.count}
            groupNumbers={[]}
            isCollapsed={collapsedSections.planned}
            onToggle={() => toggleSection("planned")}
            variant="planned"
          >
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
                        <span className="font-semibold text-amber-900">
                          {group.groupNumber ? `Група ${group.groupNumber}` : 'Планиран период'}
                        </span>
                        <span className="text-xs text-amber-700 font-medium">
                          {participants.length}{" "}
                          {participants.length === 1 ? "участник" : "участника"}
                        </span>
                      </div>
                      <div className="text-xs text-amber-700 mt-0.5">
                        {formatDateBG(group.courseStartDate)} -{" "}
                        {formatDateBG(group.courseEndDate)}
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
          </GroupSection>
        )}

        {/* Completed Groups Section (Archive) */}
        {participantsByStatus.completed.length > 0 && (
          <GroupSection
            title={t("groups.completedSection")}
            count={groupStats.completed.count}
            isCollapsed={collapsedSections.completed}
            onToggle={() => toggleSection("completed")}
            variant="completed"
          >
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
                  />
                )
              )}
            </div>
          </GroupSection>
        )}
      </div>

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
