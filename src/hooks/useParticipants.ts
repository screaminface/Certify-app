import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db, Participant } from '../db/database';
import { computeCourseDates } from '../utils/dateUtils';
import { generateNextUniqueNumber, isUniqueNumberAvailable } from '../utils/uniqueNumberUtils';
import { recalculateAllAutoGroups, syncGroups, getSuggestedGroup, createGroup, getActiveGroup, isGroupReadOnly } from '../utils/groupUtils';
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
    const { courseStartDate, courseEndDate } = computeCourseDates(input.medicalDate);

    // MEDICAL VALIDATION - Check if medical is valid for this course
    // Medical must be within 6 months BEFORE the course start date
    if (!isMedicalValidForCourse(input.medicalDate, courseStartDate)) {
      throw new Error(MEDICAL_EXPIRED_MESSAGE);
    }

    // Determine group assignment
    let groupNumber: number;
    let autoGroup: number;
    let manualGroup: number | null = null;
    let actualCourseStart = courseStartDate;
    let actualCourseEnd = courseEndDate;

    if (input.groupNumber !== undefined) {
      // Manual group assignment
      manualGroup = input.groupNumber;
      groupNumber = input.groupNumber;
      
      // Get the group to match its dates
      const selectedGroup = await db.groups.where('groupNumber').equals(groupNumber).first();
      if (selectedGroup) {
        // Block adding to ANY completed group (even if unlocked)
        if (selectedGroup.status === 'completed') {
          throw new Error('Не може да добавяте нови участници към приключила група. Отключването е само за корекции на съществуващи записи.');
        }
        
        // Validate medical is valid for this group's course start date
        if (!isMedicalValidForCourse(input.medicalDate, selectedGroup.courseStartDate)) {
          throw new Error('Медицинският преглед трябва да е преди началото на курса и в рамките на 6 месеца.');
        }
        
        // Use group's existing dates without modifying them
        actualCourseStart = selectedGroup.courseStartDate;
        actualCourseEnd = selectedGroup.courseEndDate;
      }
      
      // Still need to calculate autoGroup for the suggested courseStart
      const { group: suggestedGroup } = await getSuggestedGroup(courseStartDate);
      autoGroup = suggestedGroup ? suggestedGroup.groupNumber : 1;
    } else {
      // Auto assignment: use suggested group
      const { group: suggestedGroup, shouldCreate } = await getSuggestedGroup(courseStartDate);
      
      if (suggestedGroup) {
        groupNumber = suggestedGroup.groupNumber;
        autoGroup = suggestedGroup.groupNumber;
      } else if (shouldCreate) {
        // Create new planned group
        const activeGroup = await getActiveGroup();
        const status = activeGroup ? 'planned' : 'active'; // First group is active
        const newGroup = await createGroup(courseStartDate, status);
        groupNumber = newGroup.groupNumber;
        autoGroup = newGroup.groupNumber;
      } else {
        // Fallback
        autoGroup = 1;
        groupNumber = 1;
      }
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
      const targetGroup = await db.groups.where('groupNumber').equals(groupNumber).first();
      if (targetGroup?.status === 'active') {
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
      courseStartDate: actualCourseStart,
      courseEndDate: actualCourseEnd,
      groupNumber,
      autoGroup,
      manualGroup,
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
    
    // Recalculate all auto groups and sync groups table
    await recalculateAllAutoGroups();
    await syncGroups();
    
    return participant;
  };

  // Update a participant
  const updateParticipant = async (id: string, updates: Partial<ParticipantInput> & Partial<Participant>): Promise<void> => {
    const participant = await db.participants.get(id);
    if (!participant) {
      throw new Error('Participant not found');
    }

    // Check if participant's group is read-only
    const participantGroup = await db.groups.where('groupNumber').equals(participant.groupNumber).first();
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

    // If medical date changed, validate it
    if (updates.medicalDate && updates.medicalDate !== participant.medicalDate) {
      // Compute new course dates
      const { courseStartDate, courseEndDate } = computeCourseDates(updates.medicalDate);
      
      // Validate medical is valid for this course
      if (!isMedicalValidForCourse(updates.medicalDate, courseStartDate)) {
        throw new Error(MEDICAL_EXPIRED_MESSAGE);
      }

      participantUpdates.medicalDate = updates.medicalDate;
      participantUpdates.courseStartDate = courseStartDate;
      participantUpdates.courseEndDate = courseEndDate;
      
      // Recalculate auto group for the new courseStartDate
      const { group: suggestedGroup } = await getSuggestedGroup(courseStartDate);
      participantUpdates.autoGroup = suggestedGroup ? suggestedGroup.groupNumber : participant.autoGroup;
      
      // If no manual override, update groupNumber
      if (participant.manualGroup === null) {
        participantUpdates.groupNumber = participantUpdates.autoGroup;
      }
    }

    // Handle groupNumber from ParticipantInput (for manual group assignment)
    if (updates.groupNumber !== undefined) {
      participantUpdates.manualGroup = updates.groupNumber;
      participantUpdates.groupNumber = updates.groupNumber;
      
      // Match the group's dates
      const selectedGroup = await db.groups.where('groupNumber').equals(updates.groupNumber).first();
      if (selectedGroup) {
        // Block moving to completed groups
        if (selectedGroup.status === 'completed') {
          throw new Error('Не може да преместите участник към приключила група. Отключването е само за корекции на съществуващи записи.');
        }
        
        // Validate medical is valid for this group's course start date
        if (!isMedicalValidForCourse(participant.medicalDate, selectedGroup.courseStartDate)) {
          throw new Error('Медицинският преглед трябва да е преди началото на курса и в рамките на 6 месеца.');
        }
        
        participantUpdates.courseStartDate = selectedGroup.courseStartDate;
        participantUpdates.courseEndDate = selectedGroup.courseEndDate;
      }
    }

    // If manual group is being cleared
    if (updates.manualGroup !== undefined) {
      if (updates.manualGroup === null) {
        // Clearing manual override - use auto group
        participantUpdates.manualGroup = null;
        participantUpdates.groupNumber = participant.autoGroup;
        // Restore suggested dates
        const { courseStartDate, courseEndDate } = computeCourseDates(participant.medicalDate);
        participantUpdates.courseStartDate = courseStartDate;
        participantUpdates.courseEndDate = courseEndDate;
      } else {
        // Setting manual override
        participantUpdates.manualGroup = updates.manualGroup;
        participantUpdates.groupNumber = updates.manualGroup;
        // Match the group's dates
        const selectedGroup = await db.groups.where('groupNumber').equals(updates.manualGroup).first();
        if (selectedGroup) {
          // Block moving to completed groups (even unlocked - no new additions)
          if (selectedGroup.status === 'completed') {
            throw new Error('Не може да преместите участник към приключила група. Отключването е само за корекции на съществуващи записи.');
          }
          
          // Validate medical is valid for this group's course start date
          if (!isMedicalValidForCourse(participant.medicalDate, selectedGroup.courseStartDate)) {
            throw new Error('Медицинският преглед трябва да е преди началото на курса и в рамките на 6 месеца.');
          }
          
          // Use group's existing dates without modifying them
          participantUpdates.courseStartDate = selectedGroup.courseStartDate;
          participantUpdates.courseEndDate = selectedGroup.courseEndDate;
        }
      }
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

    // Recalculate all auto groups and sync groups table
    await recalculateAllAutoGroups();
    await syncGroups();
  };

  // Delete a participant
  const deleteParticipant = async (id: string): Promise<void> => {
    await db.participants.delete(id);
    
    // Recalculate all auto groups and sync groups table
    await recalculateAllAutoGroups();
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
