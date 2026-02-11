import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db, Participant } from '../db/database';
import { computeCourseDates } from '../utils/dateUtils';
import { generateNextUniqueNumber, isUniqueNumberAvailable } from '../utils/uniqueNumberUtils';
import { syncGroups, getSuggestedGroup, createGroup, getActiveGroup, isGroupReadOnly } from '../utils/groupUtils';
import { isMedicalValidForCourse, MEDICAL_EXPIRED_MESSAGE } from '../utils/medicalValidation';

export interface ParticipantInput {
  companyName: string;
  personName: string;
  egn: string;
  birthPlace: string;
  citizenship: string;
  medicalDate: string;
  uniqueNumber?: string; // Optional for manual assignment
}

export function useParticipants() {
  // Get all participants
  const participants = useLiveQuery(() => 
    db.participants.orderBy('courseStartDate').toArray()
  );

  // Add a new participant
  const addParticipant = async (input: ParticipantInput): Promise<Participant> => {
    // Compute course dates first
    const { courseStartDate } = computeCourseDates(input.medicalDate);

    // MEDICAL VALIDATION - Check if medical is valid for this course
    // Medical must be within 6 months BEFORE the course start date
    if (!isMedicalValidForCourse(input.medicalDate, courseStartDate)) {
      throw new Error(MEDICAL_EXPIRED_MESSAGE);
    }

    // Check for smart group suggestion (handles completed groups by skipping to next)
    const { group: suggestedGroup, shouldCreate, createsForDate } = await getSuggestedGroup(input.medicalDate);
    
    // Determine the actual course start date to use
    // If a group was found, use its date. If creating, use strict date OR shifted date.
    const finalCourseStartDate = suggestedGroup 
      ? suggestedGroup.courseStartDate 
      : (createsForDate || courseStartDate);

    const finalCourseEndDate = (() => {
      const d = new Date(finalCourseStartDate);
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    })();

    // FINAL VALIDITY CHECK
    // Ensure medical is valid for the strictly determined date
    // Note: getSuggestedGroup already checks validity for candidate dates, but good to be safe.
    if (!isMedicalValidForCourse(input.medicalDate, finalCourseStartDate)) {
       throw new Error(MEDICAL_EXPIRED_MESSAGE);
    }
    
    // SAFETY NET: Check for completed groups on this date (handling duplicate scenarios)
    // Even if getSuggestedGroup skipped it, we must ensure we don't accidentally write to a date that has a completed group
    const groupsForDate = await db.groups.where('courseStartDate').equals(finalCourseStartDate).toArray();
    if (groupsForDate.some(g => g.status === 'completed')) {
      throw new Error('Не може да добавяте нови участници към приключила група (периодът е архивиран).');
    }

    // Block adding to completed groups (Extra safeguard, though getSuggestedGroup shouldn't return one)
    if (suggestedGroup?.status === 'completed') {
      throw new Error('Не може да добавяте нови участници към приключила група.');
    }

    // If no group/period exists for this courseStart, create it
    if (shouldCreate) {
      const activeGroup = await getActiveGroup();
      const status = activeGroup ? 'planned' : 'active'; // First group is active
      await createGroup(finalCourseStartDate, status);
    }

    // Generate or validate unique number
    let uniqueNumber: string;
    if (input.uniqueNumber) {
      const isAvailable = await isUniqueNumberAvailable(input.uniqueNumber);
      if (!isAvailable) {
        throw new Error('Unique number already exists');
      }
      uniqueNumber = input.uniqueNumber;
    } else {
      // Only generate unique numbers for active group
      // Planned groups get empty uniqueNumber (generated when group becomes active)
      if (suggestedGroup?.status === 'active') {
        uniqueNumber = await generateNextUniqueNumber();
      } else {
        uniqueNumber = ''; // Empty for planned groups
      }
    }

    // Compute completed status
    const completedComputed = false; // All checkboxes default to false

    const now = new Date().toISOString();

    const participant: Participant = {
      id: uuidv4(),
      companyName: input.companyName,
      personName: input.personName,
      egn: input.egn || '',
      birthPlace: input.birthPlace || '',
      citizenship: input.citizenship || 'българско',
      medicalDate: input.medicalDate,
      courseStartDate: finalCourseStartDate,
      courseEndDate: finalCourseEndDate,
      uniqueNumber,
      sent: false,
      documents: false,
      handedOver: false,
      paid: false,
      completedOverride: null,
      completedComputed,
      createdAt: now,
      updatedAt: now
      // completedAt is not set initially (undefined)
    };

    await db.participants.add(participant);
    
    // Sync groups table to ensure all periods exist
    await syncGroups();
    
    return participant;
  };

  // Update a participant
  const updateParticipant = async (id: string, updates: Partial<ParticipantInput> & Partial<Participant>): Promise<void> => {
    const participant = await db.participants.get(id);
    if (!participant) {
      throw new Error('Participant not found');
    }

    // Check if participant's period/group is read-only
    const participantGroup = await db.groups
      .where('courseStartDate')
      .equals(participant.courseStartDate)
      .first();
    if (isGroupReadOnly(participantGroup)) {
      throw new Error('Не може да редактирате участник от заключена група. Моля отключете групата първо от Tools.');
    }

    // Build the actual updates object for Participant type
    const participantUpdates: Partial<Participant> = {};

    // Copy simple fields if provided
    if (updates.companyName !== undefined) participantUpdates.companyName = updates.companyName;
    if (updates.personName !== undefined) participantUpdates.personName = updates.personName;
    if (updates.egn !== undefined) participantUpdates.egn = updates.egn;
    if (updates.birthPlace !== undefined) participantUpdates.birthPlace = updates.birthPlace;
    if (updates.citizenship !== undefined) participantUpdates.citizenship = updates.citizenship;

    // If medical date changed, recalculate course dates
    if (updates.medicalDate && updates.medicalDate !== participant.medicalDate) {
      // Use getSuggestedGroup logic (same as addParticipant) to respect active group priority
      const { group: suggestedGroup, shouldCreate, createsForDate } = await getSuggestedGroup(updates.medicalDate);
      
      // Compute strict course dates for validation
      const { courseStartDate: strictCourseStartDate } = computeCourseDates(updates.medicalDate);
      
      // Determine the actual course start date to use
      const finalCourseStartDate = suggestedGroup 
        ? suggestedGroup.courseStartDate 
        : (createsForDate || strictCourseStartDate);

      const finalCourseEndDate = (() => {
        const d = new Date(finalCourseStartDate);
        d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0];
      })();

      // Validate medical is valid for the determined course
      if (!isMedicalValidForCourse(updates.medicalDate, finalCourseStartDate)) {
        throw new Error(MEDICAL_EXPIRED_MESSAGE);
      }

      // Block if group is completed
      if (suggestedGroup?.status === 'completed') {
        throw new Error('Медицинският преглед отговаря на приключила група (периодът е архивиран).');
      }

      // If no group exists for this courseStart, create it
      if (shouldCreate) {
        const activeGroup = await getActiveGroup();
        const status = activeGroup ? 'planned' : 'active';
        await createGroup(finalCourseStartDate, status);
      }

      participantUpdates.medicalDate = updates.medicalDate;
      participantUpdates.courseStartDate = finalCourseStartDate;
      participantUpdates.courseEndDate = finalCourseEndDate;
    }

    // If unique number changed, validate it
    if (updates.uniqueNumber && updates.uniqueNumber !== participant.uniqueNumber) {
      const isAvailable = await isUniqueNumberAvailable(updates.uniqueNumber, id);
      if (!isAvailable) {
        throw new Error('Unique number already exists');
      }
      participantUpdates.uniqueNumber = updates.uniqueNumber;
    }

    // Copy checkbox updates if provided
    if (updates.sent !== undefined) participantUpdates.sent = updates.sent;
    if (updates.documents !== undefined) participantUpdates.documents = updates.documents;
    if (updates.handedOver !== undefined) participantUpdates.handedOver = updates.handedOver;
    if (updates.paid !== undefined) participantUpdates.paid = updates.paid;

    // Recompute completedComputed if checkboxes changed
    const newSent = participantUpdates.sent !== undefined ? participantUpdates.sent : participant.sent;
    const newDocuments = participantUpdates.documents !== undefined ? participantUpdates.documents : participant.documents;
    const newHandedOver = participantUpdates.handedOver !== undefined ? participantUpdates.handedOver : participant.handedOver;
    const newPaid = participantUpdates.paid !== undefined ? participantUpdates.paid : participant.paid;
    const newCompletedComputed = newSent && newDocuments && newHandedOver && newPaid;
    participantUpdates.completedComputed = newCompletedComputed;

    // Always update updatedAt timestamp on any change
    participantUpdates.updatedAt = new Date().toISOString();

    // Handle completedAt timestamp
    // If participant becomes completed (computed or override), set completedAt
    // If uncompleted, keep completedAt for audit trail (don't clear it)
    const currentlyCompleted = participant.completedOverride !== null 
      ? participant.completedOverride 
      : participant.completedComputed;
    const willBeCompleted = participantUpdates.completedOverride !== undefined && participantUpdates.completedOverride !== null
      ? participantUpdates.completedOverride
      : (participantUpdates.completedOverride === null ? newCompletedComputed : (participant.completedOverride !== null ? participant.completedOverride : newCompletedComputed));
    
    if (!currentlyCompleted && willBeCompleted) {
      // Participant is becoming completed - set completedAt
      participantUpdates.completedAt = new Date().toISOString();
    }
    // Note: We keep completedAt even if participant becomes uncompleted (audit trail)

    await db.participants.update(id, participantUpdates);

    // Sync groups table to ensure all periods exist
    await syncGroups();
  };

  // Delete a participant
  const deleteParticipant = async (id: string): Promise<void> => {
    // 1. Get participant before delete to know if we need to realign
    const participant = await db.participants.get(id);
    
    // 2. Delete from DB
    await db.participants.delete(id);
    
    // 3. Realign numbers if they had one
    if (participant && participant.uniqueNumber) {
        // Dynamic import to avoid circular dependencies if any
        const { realignUniqueNumbers } = await import('../utils/uniqueNumberUtils');
        await realignUniqueNumbers(participant.uniqueNumber);
    }
    
    // 4. Sync groups table to ensure all periods exist
    await syncGroups();
  };

  // Reset completed override to use auto-computed value
  const resetCompletedOverride = async (id: string): Promise<void> => {
    await db.participants.update(id, { completedOverride: null });
  };

  // Get participant by ID
  const getParticipant = async (id: string): Promise<Participant | undefined> => {
    return db.participants.get(id);
  };

  return {
    participants,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    resetCompletedOverride,
    getParticipant
  };
}
