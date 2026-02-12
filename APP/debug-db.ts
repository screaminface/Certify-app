// Debug script to check database state
import { db } from './src/db/database';

async function debugDatabase() {
  console.log('=== DATABASE DEBUG ===');
  
  // Check version
  console.log('Database version:', db.verno);
  
  // Check all groups
  const groups = await db.groups.toArray();
  console.log('\n=== GROUPS ===');
  console.log('Total groups:', groups.length);
  groups.forEach(g => {
    console.log(`Group ${g.id}:`, {
      groupNumber: g.groupNumber,
      status: g.status,
      courseStartDate: g.courseStartDate,
      courseEndDate: g.courseEndDate
    });
  });
  
  // Check all participants
  const participants = await db.participants.toArray();
  console.log('\n=== PARTICIPANTS ===');
  console.log('Total participants:', participants.length);
  participants.forEach(p => {
    console.log(`Participant ${p.personName}:`, {
      courseStartDate: p.courseStartDate,
      uniqueNumber: p.uniqueNumber,
      // @ts-ignore - checking if old field exists
      groupNumber: (p as any).groupNumber,
      // @ts-ignore
      autoGroup: (p as any).autoGroup,
      // @ts-ignore
      manualGroup: (p as any).manualGroup
    });
  });
}

// Run in browser console
(window as any).debugDB = debugDatabase;
console.log('Run debugDB() in console to check database state');
