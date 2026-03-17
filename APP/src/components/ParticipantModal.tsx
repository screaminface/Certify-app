import React, { useState, useEffect } from 'react';
import { Participant, db } from '../db/database';
import { useParticipants } from '../hooks/useParticipants';
import { computeCourseDates } from '../utils/dateUtils';
import { isValidUniqueNumberFormat, isUniqueNumberAvailable, generateNextUniqueNumber, checkForGaps, parseUniqueNumber } from '../utils/uniqueNumberUtils';
import { isMedicalValidForCourse, formatDateBG } from '../utils/medicalValidation';
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
  const [visible, setVisible] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
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
    }
    // Note: Medical validity is checked later against specific courseStartDate
    // using isMedicalValidForCourse() at lines 268/277

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
      // Normalize whitespace: replace multiple spaces with single space, trim
      const normalizeName = (name: string) => 
        name.trim().replace(/\s+/g, ' ').normalize('NFC');
      
      const data = {
        companyName: formData.companyName.trim(),
        personName: normalizeName(formData.personName),
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

  // Animate in/out
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Shared form fields rendered inside both desktop and mobile
  const formBody = (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      {/* Timestamps for existing participants */}
      {participant && (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
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

      {/* Company Name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {t('modal.companyName')} *
        </label>

        {/* Desktop: native select */}
        <select
          value={formData.companyName}
          onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
          className={`hidden sm:block w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
            errors.companyName ? 'border-red-400' : 'border-slate-200'
          }`}
        >
          <option value="">{t('modal.selectCompany')}</option>
          <option value="Egida">Egida</option>
          <option value="D-Max">D-Max</option>
          <option value="Multiforce">Multiforce</option>
        </select>

        {/* Mobile: bottom sheet trigger */}
        <button
          type="button"
          onClick={() => setCompanyPickerOpen(true)}
          className={`sm:hidden w-full px-3.5 py-2.5 border rounded-xl text-left flex items-center justify-between bg-white transition-colors ${
            errors.companyName ? 'border-red-400' : formData.companyName ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'
          }`}
        >
          <span className={formData.companyName ? 'text-slate-900 font-medium' : 'text-slate-400'}>
            {formData.companyName || t('modal.selectCompany')}
          </span>
          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {errors.companyName && (
          <p className="text-red-600 text-sm mt-1">{errors.companyName}</p>
        )}
      </div>

      {/* Company Picker Bottom Sheet (mobile only) */}
      {companyPickerOpen && (
        <>
          <div
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={() => setCompanyPickerOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[71] bg-white rounded-t-3xl shadow-2xl"
            style={{ maxHeight: '60vh' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>
            <div className="px-5 pt-2 pb-3 border-b border-slate-100">
              <p className="text-base font-bold text-slate-900">{t('modal.companyName')}</p>
            </div>
            <div className="py-2">
              {['Egida', 'D-Max', 'Multiforce'].map((company) => (
                <button
                  key={company}
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, companyName: company });
                    setCompanyPickerOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-5 py-4 active:bg-slate-100 transition-colors"
                >
                  <span className="text-lg font-medium text-slate-800">{company}</span>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    formData.companyName === company
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-slate-300 bg-white'
                  }`}>
                    {formData.companyName === company && (
                      <div className="w-2.5 h-2.5 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 pb-6 pt-2" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
              <button
                type="button"
                onClick={() => setCompanyPickerOpen(false)}
                className="w-full py-3 rounded-2xl bg-slate-100 text-slate-700 font-semibold text-sm"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Person Name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {t('modal.personName')} *
        </label>
        <input
          type="text"
          value={formData.personName}
          onChange={(e) => setFormData({ ...formData, personName: e.target.value })}
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className={`w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
            errors.medicalDate ? 'border-red-500' : 'border-slate-200'
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
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
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
            className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
              formData.groupAssignmentMode === 'auto'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t('modal.auto')}
          </button>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, groupAssignmentMode: 'manual' })}
            className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
              formData.groupAssignmentMode === 'manual'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t('modal.manual')}
          </button>
        </div>
        {/* Auto mode info */}
        {formData.groupAssignmentMode === 'auto' && suggestedGroup && (
          <>
            {suggestedGroup.status === 'completed' ? (
              <div className="bg-red-50 border border-red-200 p-3 rounded-xl">
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
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
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
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
        {gapNumber && participant && (
          <div className="mb-2 p-2 bg-amber-50 border border-amber-300 rounded-xl">
            <p className="text-amber-800 text-sm font-medium">
              ⚠️ Участникът ще получи попълващ номер: {gapNumber}
            </p>
          </div>
        )}
        {participant && suggestedGroup?.status === 'active' && nextUniqueNumber && !gapNumber && (
          <div className="mb-2 p-2 bg-blue-50 border border-blue-300 rounded-xl">
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
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
        {errors.uniqueNumber && (
          <p className="text-red-600 text-sm mt-1">{errors.uniqueNumber}</p>
        )}
      </div>
    </div>
  );

  const formFooterDesktop = (
    <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
      <button
        type="button"
        onClick={onClose}
        disabled={isSubmitting}
        className="px-5 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
      >
        {t('common.cancel')}
      </button>
      <button
        type="submit"
        disabled={isSubmitting || (formData.groupAssignmentMode === 'auto' && suggestedGroup?.status === 'completed')}
        className="px-5 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? t('common.saving') : (participant ? t('modal.update') : t('common.add'))}
      </button>
    </div>
  );

  const formFooterMobile = (
    <div className="px-4 py-3 border-t border-slate-100 flex gap-3 flex-shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      <button
        type="button"
        onClick={onClose}
        disabled={isSubmitting}
        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
      >
        {t('common.cancel')}
      </button>
      <button
        type="submit"
        disabled={isSubmitting || (formData.groupAssignmentMode === 'auto' && suggestedGroup?.status === 'completed')}
        className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? t('common.saving') : (participant ? t('modal.update') : t('common.add'))}
      </button>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[55] transition-opacity duration-300"
        style={{
          opacity: visible ? 1 : 0,
          background: 'rgba(0,0,0,0.45)',
        }}
        onClick={onClose}
      />

      {/* ── DESKTOP (sm+): Centered modal ── */}
      <div className="hidden sm:flex fixed inset-0 z-[56] items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden transition-all duration-300"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.96)' }}
        >
          {/* Top accent line */}
          <div className="h-[3px] flex-shrink-0" style={{ background: 'linear-gradient(90deg, #2563EB 0%, #7C3AED 50%, #059669 100%)' }} />
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {participant ? t('modal.editParticipant') : t('modal.addParticipant')}
              </h2>
              {participant && (
                <p className="text-xs text-slate-400 mt-0.5">{participant.personName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-3 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors flex-shrink-0"
              aria-label={t('common.close')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            {formBody}
            {formFooterDesktop}
          </form>
        </div>
      </div>

      {/* ── MOBILE: Bottom Sheet ── */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-white rounded-t-3xl shadow-2xl overflow-hidden"
        style={{
          maxHeight: '92vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
          <div className="w-10 rounded-full" style={{ height: '4px', background: '#D1D5DB' }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">
              {participant ? t('modal.editParticipant') : t('modal.addParticipant')}
            </h2>
            {participant && (
              <p className="text-xs text-slate-400 mt-0.5">{participant.personName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors flex-shrink-0"
            aria-label={t('common.close')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {formBody}
          {formFooterMobile}
        </form>
      </div>

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
    </>
  );
};
