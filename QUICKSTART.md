# Course Management PWA - Quick Start

## Install & Run

```bash
# Install dependencies
npm install

# Start development server (opens at http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Test Offline Mode

1. Open in browser (Chrome recommended)
2. Open DevTools > Application > Service Workers
3. Check "Offline" checkbox
4. Reload page - app should work normally

## Install as PWA

### Desktop
- Click install icon in browser address bar
- Or: Menu > Install "Course Management"

### Mobile
- **Android**: Menu > Add to Home screen
- **iOS**: Share > Add to Home Screen

## Key Features

✅ Works 100% offline  
✅ Auto group assignment by course date  
✅ Sequential unique number generation  
✅ Export/Import JSON backups  
✅ Export to Excel/CSV  
✅ Advanced filtering & search  
✅ Mobile responsive  

## Data Rules

- **Course Start**: Always Monday (auto-computed from medical date)
- **Group Numbers**: Sequential (1, 2, 3...) - no duplicates
- **Unique Numbers**: Format "NNNN-NNN" - strictly increasing
- **Completed Status**: Auto-computed from 4 checkboxes (can override)

## Common Tasks

### Add Participant
1. Click "Add Participant"
2. Enter company name, person name, medical date
3. Group and unique number auto-assigned
4. Click "Add"

### Export Backup
1. Scroll to "Export / Import" section
2. Click "Export Full Backup (JSON)"
3. Save file for backup/transfer

### Import Backup
1. Click "Import & Merge" (adds/updates) or "Import & Replace All" (wipes data first)
2. Select JSON backup file
3. Wait for import to complete

### Reset Yearly Sequence
1. At start of new year
2. Click "Reset Yearly Sequence"
3. Next unique number will be PREFIX+1 and SEQ=001

## Troubleshooting

**App not updating?**
- Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)
- Clear cache and service workers

**Data lost?**
- Export backups regularly!
- Data stored in browser (not cloud)

**Import collision?**
- Duplicate unique numbers auto-incremented
- Check imported data format

## Tech Stack

React + TypeScript + Vite + Tailwind + Dexie (IndexedDB) + PWA

---

See [README.md](README.md) for full documentation.
