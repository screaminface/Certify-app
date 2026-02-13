import { useLiveQuery } from 'dexie-react-hooks';
import { Settings } from '../db/database';
import { resetYearlySequence as resetSeq } from '../utils/uniqueNumberUtils';
import { getSettingsRecord, updateSettingsRecord } from '../services/db';

export function useSettings() {
  // Get settings (always single row with id=1)
  const settings = useLiveQuery(() => getSettingsRecord());

  // Update settings
  const updateSettings = async (updates: Partial<Settings>): Promise<void> => {
    await updateSettingsRecord(updates);
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
