import { useLiveQuery } from 'dexie-react-hooks';
import { db, Group } from '../db/database';

export function useGroups() {
  // Get all groups ordered by group number
  const groups = useLiveQuery(() => 
    db.groups.orderBy('groupNumber').toArray()
  );

  // Get a specific group by number
  const getGroup = async (groupNumber: number): Promise<Group | undefined> => {
    return db.groups.where('groupNumber').equals(groupNumber).first();
  };

  // Get groups with participant counts
  const getGroupsWithCounts = async (): Promise<Array<Group & { participantCount: number }>> => {
    const allGroups = await db.groups.orderBy('groupNumber').toArray();
    const groupsWithCounts = await Promise.all(
      allGroups.map(async (group) => {
        const count = group.groupNumber !== null 
          ? await db.participants
              .where('groupNumber')
              .equals(group.groupNumber)
              .count()
          : 0;
        return { ...group, participantCount: count };
      })
    );
    return groupsWithCounts;
  };

  return {
    groups,
    getGroup,
    getGroupsWithCounts
  };
}
