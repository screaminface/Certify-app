import { db, Settings } from '../../db/database';

export async function getSettingsRecord(): Promise<Settings | undefined> {
  return db.settings.get(1);
}

export async function updateSettingsRecord(updates: Partial<Settings>): Promise<void> {
  await db.settings.update(1, updates);
}
