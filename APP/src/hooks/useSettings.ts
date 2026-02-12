import { useLiveQuery } from 'dexie-react-hooks';
import { db, Settings } from '../db/database';
import { resetYearlySequence as resetSeq } from '../utils/uniqueNumberUtils';

export function useSettings() {
  // Get settings (always single row with id=1)
  const settings = useLiveQuery(() => db.settings.get(1));

  // Update settings
  const updateSettings = async (updates: Partial<Settings>): Promise<void> => {
    await db.settings.update(1, updates);
  };

  // Reset yearly sequence
  const resetYearlySequence = async (): Promise<void> => {
    await resetSeq();
  };

  return {
    settings,
    updateSettings,
    resetYearlySequence
  };
}
