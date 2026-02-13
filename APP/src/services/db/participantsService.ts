import { db, Participant } from '../../db/database';

export async function listParticipantsByCourseStartDate(): Promise<Participant[]> {
  return db.participants.orderBy('courseStartDate').toArray();
}

export async function getParticipantById(id: string): Promise<Participant | undefined> {
  return db.participants.get(id);
}

export async function addParticipantRecord(participant: Participant): Promise<void> {
  await db.participants.add(participant);
}

export async function updateParticipantRecord(id: string, updates: Partial<Participant>): Promise<void> {
  await db.participants.update(id, updates);
}

export async function deleteParticipantRecord(id: string): Promise<void> {
  await db.participants.delete(id);
}

export async function countParticipantsByCourseStartDate(courseStartDate: string): Promise<number> {
  return db.participants.where('courseStartDate').equals(courseStartDate).count();
}
