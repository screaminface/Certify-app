import { db, Group } from '../../db/database';

export async function listGroupsSortedByCourseStartDate(): Promise<Group[]> {
  const groups = await db.groups.toArray();
  return groups.sort((a, b) => a.courseStartDate.localeCompare(b.courseStartDate));
}

export async function getGroupByNumber(groupNumber: number): Promise<Group | undefined> {
  return db.groups.where('groupNumber').equals(groupNumber).first();
}

export async function getGroupsByCourseStartDate(courseStartDate: string): Promise<Group[]> {
  return db.groups.where('courseStartDate').equals(courseStartDate).toArray();
}

export async function getFirstGroupByCourseStartDate(courseStartDate: string): Promise<Group | undefined> {
  return db.groups.where('courseStartDate').equals(courseStartDate).first();
}
