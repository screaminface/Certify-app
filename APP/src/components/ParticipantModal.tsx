import React, { useState, useEffect } from 'react';
import { Participant, db } from '../db/database';
import { useParticipants } from '../hooks/useParticipants';
import { computeCourseDates } from '../utils/dateUtils';
import { isValidUniqueNumberFormat, isUniqueNumberAvailable, generateNextUniqueNumber, checkForGaps, parseUniqueNumber } from '../utils/uniqueNumberUtils';
import { isMedicalDateValid, isMedicalValidForCourse, formatDateBG, MEDICAL_EXPIRED_MESSAGE } from '../utils/medicalValidation';
import { getActiveGroup, getSuggestedGroup } from '../utils/groupUtils';
import { useLiveQuery } from 'dexie-react-hooks';
import { ConfirmModal } from './ui/ConfirmModal';
import { useLanguage } from '../contexts/LanguageContext';

interface ParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant?: Participant;
}

export const ParticipantModal: React.FC<ParticipantModalProps> = ({
  isOpen,
  onClose,
  participant
}) => {
  const { addParticipant, updateParticipant } = useParticipants();
  const { t } = useLanguage();

  const [formData, setFormData] = useState({
    companyName: '',
    personName: '',
    egn: '',
    birthPlace: '',
    citizenship: 'българско',
    medicalDate: '',
    groupAssignmentMode: 'auto' as 'auto' | 'manual',
    selectedGroupId: '',
    uniqueNumber: ''
  });

  const [computedDates, setComputedDates] = useState({
    courseStartDate: '',
    courseEndDate: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nextUniqueNumber, setNextUniqueNumber] = useState<string>('');
  const [gapNumber, setGapNumber] = useState<string | null>(null);
  const [warningModal, setWarningModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {}
  });

  const activeGroup = useLiveQuery(() => getActiveGroup(), []);
  const allGroups = useLiveQuery(() => db.groups.orderBy('groupNumber').toArray(), []);
  const [suggestedGroup, setSuggestedGroup] = useState<{ groupNumber: number | null; courseStartDate: string; courseEndDate: string; status: 'active' | 'planned' | 'completed' } | null>(null);

  // Calculate suggested group when medical date changes
  useEffect(() => {
    if (!formData.medicalDate) {
      setSuggestedGroup(null);
      return;
    }
    
    getSuggestedGroup(formData.medicalDate).then(result => {
      // If result.createsForDate is present, it means we are suggesting a new group for that date
      // We should construct a temporary group object for display if result.group is null
      if (result.group) {
        setSuggestedGroup(result.group);
      } else if (result.createsForDate) {
        // Create a dummy group object for display purposes
        const d = new Date(result.createsForDate);
        const endDate = new Date(d);
        endDate.setDate(d.getDate() + 7);
        
        setSuggestedGroup({
          groupNumber: null,
          courseStartDate: result.createsForDate,
          courseEndDate: endDate.toISOString().split('T')[0],
          status: 'planned'
        });
      } else {
        setSuggestedGroup(null);
      }
    });
  }, [formData.medicalDate]);

  useEffect(() => {
    if (participant) {
      setFormData({
        companyName: participant.companyName,
        personName: participant.personName,
        egn: participant.egn || '',
        birthPlace: participant.birthPlace || '',
        citizenship: participant.citizenship || 'българско',
        medicalDate: participant.medicalDate,
        groupAssignmentMode: 'auto',
        selectedGroupId: '',
        uniqueNumber: participant.uniqueNumber
      });
      setComputedDates({
        courseStartDate: participant.courseStartDate,
        courseEndDate: participant.courseEndDate
      });
      setNextUniqueNumber('');
    } else {
      setFormData({
        companyName: '',
        personName: '',
        egn: '',
        birthPlace: '',
        citizenship: 'българско',
        medicalDate: '',
        groupAssignmentMode: 'auto',
        selectedGroupId: '',
        uniqueNumber: ''
      });
      setComputedDates({
        courseStartDate: '',
        courseEndDate: ''
      });
      // Load the next available unique number and check for gaps
      if (isOpen) {
        Promise.all([
          generateNextUniqueNumber(),
          checkForGaps()
        ]).then(([num, gap]) => {
          setNextUniqueNumber(num);
          setGapNumber(gap);
        }).catch(err => {
          console.error('Failed to generate next unique number:', err);
          setNextUniqueNumber('');
          setGapNumber(null);
        });
      }
    }
    setErrors({});
  }, [participant, isOpen]);

  // Recompute dates when medical date changes or suggested group changes
  // Show the REAL group dates (where participant will actually go), not the computed dates
  useEffect(() => {
    if (suggestedGroup) {
      // Use the dates from the suggested/active group (this is where they'll actually go)
      setComputedDates({
        courseStartDate: suggestedGroup.courseStartDate,
        courseEndDate: suggestedGroup.courseEndDate
      });
      
      // Update suggested unique number for active groups
      if (suggestedGroup.status === 'active') {
        Promise.all([
          generateNextUniqueNumber(),
          checkForGaps()
        ]).then(([num, gap]) => {
          // Show gap number if exists, otherwise next number
          const suggestedNumber = gap || num;
          setNextUniqueNumber(suggestedNumber);
          setGapNumber(gap);
          
          // CRITICAL: If editing participant and moving to active, clear old number to use suggested
          if (participant) {
            setFormData(prev => ({ ...prev, uniqueNumber: '' }));
          }
        }).catch(err => {
          console.error('Failed to get unique number:', err);
        });
      } else {
        // Planned group - no unique number
        setNextUniqueNumber('');
        setGapNumber(null);
      }
    } else if (formData.medicalDate) {
      // Fallback to computing dates if no group suggested yet
      try {
        const dates = computeCourseDates(formData.medicalDate);
        setComputedDates(dates);
      } catch (error) {
        console.error('Error computing dates:', error);
      }
    }
  }, [formData.medicalDate, suggestedGroup, participant]);

  const validateForm = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {};

    if (!formData.companyName.trim()) {
      newErrors.companyName = t('modal.companyNameRequired');
    }

    if (!formData.personName.trim()) {
      newErrors.personName = t('modal.personNameRequired');
    }

    if (!formData.egn.trim()) {
      newErrors.egn = t('modal.egnRequired');
    } else if (!/^\d{10}$/.test(formData.egn)) {
      newErrors.egn = t('modal.egnInvalid');
    }

    if (!formData.birthPlace.trim()) {
      newErrors.birthPlace = t('modal.birthPlaceRequired');
    }

    if (!formData.medicalDate) {
      newErrors.medicalDate = t('modal.medicalDateRequired');
    } else {
      // Check medical date validity (6-month expiry)
      if (!isMedicalDateValid(formData.medicalDate)) {
        newErrors.medicalDate = MEDICAL_EXPIRED_MESSAGE;
      }
    }

    // Validate unique number if manually entered
    if (formData.uniqueNumber) {
      if (!isValidUniqueNumberFormat(formData.uniqueNumber)) {
        newErrors.uniqueNumber = t('modal.uniqueNumberInvalid');
      } else {
        const isAvailable = await isUniqueNumberAvailable(
          formData.uniqueNumber, 
          participant?.id
        );
        if (!isAvailable) {
          newErrors.uniqueNumber = t('modal.uniqueNumberExists');
        } else if (gapNumber && !participant) {
          // If there's a gap and user is creating new participant
          // They MUST use the gap number or leave it empty (auto-assign)
          const inputParsed = parseUniqueNumber(formData.uniqueNumber);
          const gapParsed = parseUniqueNumber(gapNumber);
          
          if (inputParsed && gapParsed) {
            // Check if the input number is after the gap
            if (inputParsed.prefix > gapParsed.prefix || 
                (inputParsed.prefix === gapParsed.prefix && inputParsed.seq > gapParsed.seq)) {
              newErrors.uniqueNumber = t('modal.cannotSkipGap', { number: gapNumber });
            }
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isValid = await validateForm();
    if (!isValid) return;

    // Block adding participants to completed groups
    if (formData.groupAssignmentMode === 'manual' && formData.selectedGroupId) {
      const selectedGroupNum = parseInt(formData.selectedGroupId, 10);
      const selectedGroup = allGroups?.find(g => g.groupNumber === selectedGroupNum);
      
      if (selectedGroup?.status === 'completed') {
        setErrors(prev => ({
          ...prev,
          selectedGroupId: t('modal.completedGroupError')
        }));
        return;
      }
      
      // Validate medical date is before course start and within 6 months
      if (!isMedicalValidForCourse(formData.medicalDate, selectedGroup!.courseStartDate)) {
        setErrors(prev => ({
          ...prev,
          medicalDate: t('modal.medicalDateCourseValidation')
        }));
        return;
      }
    } else {
      // Auto mode - validate with computed course start date
      if (!isMedicalValidForCourse(formData.medicalDate, computedDates.courseStartDate)) {
        setErrors(prev => ({
          ...prev,
          medicalDate: t('modal.medicalDateCourseValidation')
        }));
        return;
      }
    }

    // Check if manual group assignment differs from suggested
    if (formData.groupAssignmentMode === 'manual' && formData.selectedGroupId) {
      const selectedGroupNum = parseInt(formData.selectedGroupId, 10);
      const suggested = await getSuggestedGroup(computedDates.courseStartDate);
      
      if (suggested.group && suggested.group.groupNumber !== selectedGroupNum) {
        const selectedGroup = allGroups?.find(g => g.groupNumber === selectedGroupNum);
        setWarningModal({
          isOpen: true,
          message: t('modal.groupWarningMessage', {
            selected: String(selectedGroupNum),
            selectedDate: formatDateBG(selectedGroup!.courseStartDate),
            suggested: String(suggested.group.groupNumber ?? ''),
            suggestedDate: formatDateBG(suggested.group.courseStartDate)
          }),
          onConfirm: () => {
            setWarningModal({ isOpen: false, message: '', onConfirm: () => {} });
            performSave();
          }
        });
        return;
      }
    }

    await performSave();
  };

  const performSave = async () => {
    setIsSubmitting(true);
    try {
      const data = {
        companyName: formData.companyName.trim(),
        personName: formData.personName.trim(),
        egn: formData.egn.trim(),
        birthPlace: formData.birthPlace.trim(),
        citizenship: formData.citizenship.trim() || 'българско',
        medicalDate: formData.medicalDate,
        uniqueNumber: formData.uniqueNumber.trim() || gapNumber || undefined
      };

      if (participant) {
        await updateParticipant(participant.id, data);
      } else {
        await addParticipant(data);
      }

      onClose();
    } catch (error) {
      console.error('Error saving participant:', error);
      alert(`${t('error.saveFailed')}: ${(error as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      {/* Safety Buffer Wrapper - catches clicks near the modal */}
      <div 
        className="w-full max-w-2xl p-16 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className="bg-white rounded-lg w-full max-h-[85vh] overflow-y-auto shadow-xl"
        >
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">
            {participant ? t('modal.editParticipant') : t('modal.addParticipant')}
          </h2>

          {/* Timestamps for existing participants */}
          {participant && (
            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {participant.createdAt && (
                  <div>
                    <span className="text-slate-600">{t('timestamp.createdAt')}:</span>
                    <span className="ml-2 font-medium text-slate-900">
                      {formatDateBG(participant.createdAt.split('T')[0])} {new Date(participant.createdAt).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {participant.updatedAt && (
                  <div>
                    <span className="text-slate-600">{t('timestamp.updatedAt')}:</span>
                    <span className="ml-2 font-medium text-slate-900">
                      {formatDateBG(participant.updatedAt.split('T')[0])} {new Date(participant.updatedAt).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {participant.completedAt && (
                  <div className="col-span-2">
                    <span className="text-emerald-600">{t('timestamp.completedAt')}:</span>
                    <span className="ml-2 font-medium text-emerald-800">
                      {formatDateBG(participant.completedAt.split('T')[0])} {new Date(participant.completedAt).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('modal.companyName')} *
                </label>
                <select
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('modal.selectCompany')}</option>
                  <option value="Egida">Egida</option>
                  <option value="D-Max">D-Max</option>
                  <option value="Multiforce">Multiforce</option>
                </select>
                {errors.companyName && (
                  <p className="text-red-600 text-sm mt-1">{errors.companyName}</p>
                )}
              </div>

              {/* Person Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('modal.personName')} *
                </label>
                <input
                  type="text"
                  value={formData.personName}
                  onChange={(e) => setFormData({ ...formData, personName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.personName && (
                  <p className="text-red-600 text-sm mt-1">{errors.personName}</p>
                )}
              </div>

              {/* EGN */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ЕГН *
                </label>
                <input
                  type="text"
                  value={formData.egn}
                  onChange={(e) => setFormData({ ...formData, egn: e.target.value })}
                  placeholder="XXXXXXXXXX"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.egn && (
                  <p className="text-red-600 text-sm mt-1">{errors.egn}</p>
                )}
              </div>

              {/* Birth Place */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Месторождение *
                </label>
                <input
                  type="text"
                  value={formData.birthPlace}
                  onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
                  placeholder="гр./с. ..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.birthPlace && (
                  <p className="text-red-600 text-sm mt-1">{errors.birthPlace}</p>
                )}
              </div>

              {/* Citizenship */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Гражданство
                </label>
                <input
                  type="text"
                  value={formData.citizenship}
                  onChange={(e) => setFormData({ ...formData, citizenship: e.target.value })}
                  placeholder="българско"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Medical Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('modal.medicalDate')} *
                </label>
                <input
                  type="date"
                  value={formData.medicalDate}
                  onChange={(e) => setFormData({ ...formData, medicalDate: e.target.value })}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    errors.medicalDate ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                {errors.medicalDate && (
                  <p className="text-red-600 text-sm mt-1 font-medium">{errors.medicalDate}</p>
                )}
                {formData.medicalDate && !errors.medicalDate && (
                  <p className="text-emerald-600 text-sm mt-1">✓ {t('modal.medicalValid')}: {formatDateBG(formData.medicalDate)}</p>
                )}
              </div>

              {/* Computed Course Dates */}
              {computedDates.courseStartDate && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
                  <h3 className="font-semibold text-blue-900 mb-2">{t('modal.courseDates')}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-1">
                        {t('modal.courseStart')}
                      </label>
                      <div className="text-lg font-semibold text-blue-900">
                        {formatDateBG(computedDates.courseStartDate)}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-1">
                        {t('modal.courseEnd')}
                      </label>
                      <div className="text-lg font-semibold text-blue-900">
                        {formatDateBG(computedDates.courseEndDate)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Group Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('modal.groupAssignment')}
                </label>
                
                {/* Mode Selection */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, groupAssignmentMode: 'auto', selectedGroupId: '' })}
                    className={`flex-1 px-3 py-2 rounded-md border ${
                      formData.groupAssignmentMode === 'auto'
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {t('modal.auto')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, groupAssignmentMode: 'manual' })}
                    className={`flex-1 px-3 py-2 rounded-md border ${
                      formData.groupAssignmentMode === 'manual'
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {t('modal.manual')}
                  </button>
                </div>

                {/* Auto mode info */}
                {/* Auto mode info */}
                {formData.groupAssignmentMode === 'auto' && suggestedGroup && (
                  <>
                  {suggestedGroup.status === 'completed' ? (
                       <div className="bg-red-50 border border-red-200 p-3 rounded-md">
                        <p className="text-sm text-red-800 font-medium">
                          ⛔ {t('modal.periodClosed')}
                          <br />
                          <span className="text-xs font-normal mt-1 block">
                             {t('modal.cannotAddComp', { date: formatDateBG(suggestedGroup.courseStartDate) })}
                             <br />
                             {t('modal.selectOtherDate')}
                          </span>
                        </p>
                      </div>
                  ) : (
                      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-md">
                        <p className="text-sm text-emerald-800">
                          ✓ {t('modal.willBeAssigned')}{' '}
                          <span className="font-semibold">{t('group.number')} {suggestedGroup.groupNumber || '-'}</span>
                          {' '}({formatDateBG(suggestedGroup.courseStartDate)} - {formatDateBG(suggestedGroup.courseEndDate)})
                          {' '}
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            suggestedGroup.status === 'active' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {suggestedGroup.status === 'active' ? t('modal.active') : t('modal.planned')}
                          </span>
                        </p>
                      </div>
                  )}
                  </>
                )}

                {/* Manual mode selection */}
                {formData.groupAssignmentMode === 'manual' && (
                  <select
                    value={formData.selectedGroupId}
                    onChange={(e) => setFormData({ ...formData, selectedGroupId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{t('modal.selectGroup')}</option>
                    {activeGroup && (
                      <option value={(activeGroup.groupNumber || '').toString()}>
                        {t('group.number')} {activeGroup.groupNumber || '-'} - {formatDateBG(activeGroup.courseStartDate)} ({t('modal.active')})
                      </option>
                    )}
                    {allGroups?.filter(g => g.status === 'planned').map((group) => (
                      <option key={group.id} value={(group.groupNumber || '').toString()}>
                        {t('group.number')} {group.groupNumber || '-'} - {formatDateBG(group.courseStartDate)} ({t('modal.planned')})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Unique Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('modal.uniqueNumberAuto')}
                </label>
                {/* Show gap warning only for EDITING participants OR if gap is internal (not just next number) */}
                {gapNumber && participant && (
                  <div className="mb-2 p-2 bg-amber-50 border border-amber-300 rounded-md">
                    <p className="text-amber-800 text-sm font-medium">
                      ⚠️ Участникът ще получи попълващ номер: {gapNumber}
                    </p>
                  </div>
                )}
                {participant && suggestedGroup?.status === 'active' && nextUniqueNumber && !gapNumber && (
                  <div className="mb-2 p-2 bg-blue-50 border border-blue-300 rounded-md">
                    <p className="text-blue-800 text-sm font-medium">
                      ℹ️ Преместване в активна група → Уникален номер: <span className="font-bold">{nextUniqueNumber}</span>
                    </p>
                  </div>
                )}
                <input
                  type="text"
                  value={formData.uniqueNumber}
                  onChange={(e) => setFormData({ ...formData, uniqueNumber: e.target.value })}
                  placeholder={nextUniqueNumber ? `${t('modal.uniqueNumberNext')}: ${nextUniqueNumber}` : 'e.g., 3534-001'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                {errors.uniqueNumber && (
                  <p className="text-red-600 text-sm mt-1">{errors.uniqueNumber}</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end pb-2 md:pb-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50"
                disabled={isSubmitting}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting || (formData.groupAssignmentMode === 'auto' && suggestedGroup?.status === 'completed')}
              >
                {isSubmitting ? t('common.saving') : (participant ? t('modal.update') : t('common.add'))}
              </button>
            </div>
          </form>
        </div>
      </div> {/* Close Content */}
      </div> {/* Close Safety Buffer Wrapper */}

      {/* Warning Modal */}
      <ConfirmModal
        isOpen={warningModal.isOpen}
        onClose={() => setWarningModal({ isOpen: false, message: '', onConfirm: () => {} })}
        onConfirm={warningModal.onConfirm}
        title="Предупреждение за група"
        message={warningModal.message}
        confirmText="Продължи"
        cancelText="Отказ"
        variant="warning"
      />
    </div>
  );
};
