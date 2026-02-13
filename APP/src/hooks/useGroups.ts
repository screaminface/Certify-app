import { useLiveQuery } from 'dexie-react-hooks';
import { Group } from '../db/database';
import {
  countParticipantsByCourseStartDate,
  getGroupByNumber,
  listGroupsSortedByCourseStartDate
} from '../services/db';

export function useGroups() {
  // Get all groups (including planned with null groupNumber)
  const groups = useLiveQuery(async () => listGroupsSortedByCourseStartDate());

  // Get a specific group by number
  const getGroup = async (groupNumber: number): Promise<Group | undefined> => {
    return getGroupByNumber(groupNumber);
  };

  // Get groups with participant counts
  const getGroupsWithCounts = async (): Promise<Array<Group & { participantCount: number }>> => {
    const allGroups = await listGroupsSortedByCourseStartDate();
    const groupsWithCounts = await Promise.all(
      allGroups.map(async (group) => {
        const count = await countParticipantsByCourseStartDate(group.courseStartDate);
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
