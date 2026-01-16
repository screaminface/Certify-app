import { db, Participant } from '../db/database';

export interface BulkActionResult {
  success: number;
  failed: number;
  errors: string[];
}

export function useBulkActions() {
  // Bulk set a flag (sent, documents, handedOver, paid)
  const bulkSetFlag = async (
    participantIds: string[],
    flag: 'sent' | 'documents' | 'handedOver' | 'paid',
    value: boolean
  ): Promise<BulkActionResult> => {
    const result: BulkActionResult = { success: 0, failed: 0, errors: [] };
    const now = new Date().toISOString();

    for (const id of participantIds) {
      try {
        const participant = await db.participants.get(id);
        if (!participant) {
          result.failed++;
          result.errors.push(`Participant ${id} not found`);
          continue;
        }

        // Check if group is locked
        const group = await db.groups.where('courseStartDate').equals(participant.courseStartDate).first();
        if (group && group.status === 'completed' && group.isLocked) {
          result.failed++;
          result.errors.push(`Participant ${participant.personName} belongs to locked group (${group.courseStartDate})`);
          continue;
        }

        // Update the flag
        const updates: Partial<Participant> = {
          [flag]: value,
          updatedAt: now
        };

        // Recompute completedComputed
        const newSent = flag === 'sent' ? value : participant.sent;
        const newDocuments = flag === 'documents' ? value : participant.documents;
        const newHandedOver = flag === 'handedOver' ? value : participant.handedOver;
        const newPaid = flag === 'paid' ? value : participant.paid;
        const newCompletedComputed = newSent && newDocuments && newHandedOver && newPaid;
        updates.completedComputed = newCompletedComputed;

        // Handle completedAt
        const currentlyCompleted = participant.completedOverride !== null 
          ? participant.completedOverride 
          : participant.completedComputed;
        const willBeCompleted = participant.completedOverride !== null 
          ? participant.completedOverride 
          : newCompletedComputed;
        
        if (!currentlyCompleted && willBeCompleted) {
          updates.completedAt = now;
        }

        await db.participants.update(id, updates);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to update ${id}: ${(error as Error).message}`);
      }
    }

    return result;
  };

  // Bulk set completed override (only if all 4 flags are true)
  const bulkSetCompleted = async (participantIds: string[]): Promise<BulkActionResult> => {
    const result: BulkActionResult = { success: 0, failed: 0, errors: [] };
    const now = new Date().toISOString();

    for (const id of participantIds) {
      try {
        const participant = await db.participants.get(id);
        if (!participant) {
          result.failed++;
          result.errors.push(`Participant ${id} not found`);
          continue;
        }

        // Check if group is locked
        const group = await db.groups.where('courseStartDate').equals(participant.courseStartDate).first();
        if (group && group.status === 'completed' && group.isLocked) {
          result.failed++;
          result.errors.push(`Participant ${participant.personName} belongs to locked group (${group.courseStartDate})`);
          continue;
        }

        // Check if all 4 flags are true
        if (!participant.sent || !participant.documents || !participant.handedOver || !participant.paid) {
          result.failed++;
          result.errors.push(`Participant ${participant.personName} does not have all 4 flags set`);
          continue;
        }

        const updates: Partial<Participant> = {
          completedOverride: true,
          updatedAt: now,
          completedAt: now
        };

        await db.participants.update(id, updates);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to update ${id}: ${(error as Error).message}`);
      }
    }

    return result;
  };

  return {
    bulkSetFlag,
    bulkSetCompleted
  };
}
