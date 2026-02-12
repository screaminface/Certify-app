# Course Management PWA

An offline-first Progressive Web App for managing course participants with automatic group assignment and unique number generation.

## Features

- **Offline-First**: Works completely offline using IndexedDB
- **PWA**: Installable on PC and mobile devices
- **Auto Group Assignment**: Automatically creates and assigns groups based on course start dates
- **Sequential Unique Numbers**: Generates unique participant numbers with strict ordering (e.g., 3532-001, 3533-002)
- **Manual Sync**: Export/import data via JSON backup files
- **Excel/CSV Export**: Export filtered data to Excel or CSV
- **Responsive UI**: Mobile-first design that works on all devices
- **Advanced Filtering**: Search, filter by group, status, and date range
- **Status Tracking**: Track sent, documents, handed over, paid, and completed status

## Installation

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Start development server:**

```bash
npm run dev
```

The app will open at `http://localhost:5173`

3. **Build for production:**

```bash
npm run build
```

4. **Preview production build:**

```bash
npm run preview
```

## PWA Installation

### On Desktop (Chrome/Edge)

1. Open the app in your browser
2. Click the install icon in the address bar (or menu > Install)
3. Confirm installation
4. The app will open as a standalone window

### On Mobile

**Android:**
1. Open the app in Chrome
2. Tap the menu (three dots)
3. Select "Add to Home screen"
4. Confirm

**iOS:**
1. Open the app in Safari
2. Tap the Share button
3. Select "Add to Home Screen"
4. Confirm

## Usage Guide

### Adding Participants

1. Click **"Add Participant"** button
2. Fill in:
   - Company Name (required)
   - Person Name (required)
   - Medical Date (required)
3. The app automatically:
   - Computes course start date (next Monday if medical date isn't Monday)
   - Computes course end date (7 days after start)
   - Assigns or creates a group
   - Generates a unique number

**Optional fields:**
- **Group**: Manually select an existing group (otherwise auto-assigned)
- **Unique Number**: Override auto-generation (must be format NNNN-NNN and unique)

### Managing Participants

- **Edit**: Click "Edit" button to modify participant details
- **Delete**: Click "Delete" button (with confirmation)
- **Checkboxes**: Click directly in the table to toggle:
  - Sent
  - Documents
  - Handed Over
  - Paid
  - Completed (auto-computed from other checkboxes, but can be overridden)
- **Reset Completed**: Click ⟲ next to Completed checkbox to reset to auto-computed value

### Filtering

Click **"Show Filters"** to access:

- **Search**: Search by company name, person name, or unique number
- **Group Filter**: Filter by specific group
- **Date Range**: Filter by course start date range
- **Status Filters**: Filter by checkbox status (Yes/No/All)

Click **"Clear All Filters"** to reset.

### Sorting

Click column headers to sort:
- **Course Start**: Sort by course start date
- **Group**: Sort by group number

### Export & Import

#### Export Full Backup (JSON)

- Exports all participants, groups, and settings
- Use for backup or transferring to another device
- Filename: `course-backup-YYYY-MM-DD.json`

#### Export Filtered to Excel

- Exports only visible participants (based on current filters)
- Includes all columns
- Filename: `course-export-YYYY-MM-DD.xlsx`

#### Export Filtered to CSV

- Same as Excel but in CSV format
- Compatible with any spreadsheet software

#### Import & Merge

- Imports data and merges with existing records
- Updates existing participants by ID
- Adds new participants
- Resolves unique number collisions automatically

#### Import & Replace All

- **DESTRUCTIVE**: Deletes all existing data first
- Imports the backup file
- Use with caution!

### Yearly Sequence Reset

At the start of each year:

1. Click **"Reset Yearly Sequence"** in Export/Import section
2. Confirm the action
3. Next unique number will reset sequence to 001 but prefix continues incrementing

**Example:**
- Last number of year: 3599-068
- After reset: 3600-001
- Next number: 3601-002

## Data Model

### Groups Table

- `id`: UUID
- `groupNumber`: Unique sequential number (1, 2, 3...)
- `courseStartDate`: ISO date (always Monday)
- `courseEndDate`: ISO date (start + 7 days)

**Rules:**
- No duplicate group numbers
- Groups are created automatically when first participant is assigned
- Empty groups are automatically deleted

### Participants Table

- `id`: UUID
- `companyName`: Company name
- `personName`: Person name
- `medicalDate`: Medical examination date
- `courseStartDate`: Computed course start (next Monday)
- `courseEndDate`: Computed course end (start + 7 days)
- `groupNumber`: Reference to group
- `uniqueNumber`: Format "NNNN-NNN" (e.g., 3532-001)
- `sent`: Boolean checkbox
- `documents`: Boolean checkbox
- `handedOver`: Boolean checkbox
- `paid`: Boolean checkbox
- `completedOverride`: Boolean or null (manual override)
- `completedComputed`: Boolean (auto: sent && documents && handedOver && paid)

### Settings Table

- `lastUniquePrefix`: Last used prefix (4 digits)
- `lastUniqueSeq`: Last used sequence (3 digits)
- `lastResetYear`: Year when sequence was last reset

## Technical Details

### Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 3
- **Database**: IndexedDB via Dexie 3
- **PWA**: vite-plugin-pwa
- **Excel Export**: SheetJS (xlsx)

### Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers with IndexedDB support

### Offline Functionality

- All data stored in browser's IndexedDB
- Service Worker caches app shell
- Works completely offline after first load
- No internet connection required

### Data Persistence

- Data persists in browser storage
- Cleared only when:
  - User clears browser data
  - User performs "Import & Replace All"
- Regular backups recommended!

## Troubleshooting

### App not updating after changes

1. Clear browser cache
2. Unregister service worker in browser DevTools
3. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Data not persisting

- Check if browser allows IndexedDB
- Check available storage space
- Try different browser

### PWA not installing

- Must be served over HTTPS (or localhost for development)
- Check if browser supports PWA
- Check if manifest.json is loading correctly

### Import fails

- Verify JSON file format matches export format
- Check file is not corrupted
- Try smaller data sets first

## Development

### Project Structure

```
src/
├── db/
│   └── database.ts          # Dexie schema and initialization
├── utils/
│   ├── dateUtils.ts         # Date computation logic
│   ├── uniqueNumberUtils.ts # Unique number generation
│   └── groupUtils.ts        # Group management
├── hooks/
│   ├── useParticipants.ts   # Participant operations
│   ├── useGroups.ts         # Group operations
│   └── useSettings.ts       # Settings operations
├── components/
│   ├── ParticipantList.tsx  # Main table component
│   ├── ParticipantModal.tsx # Add/Edit modal
│   ├── Filters.tsx          # Filter controls
│   ├── Counters.tsx         # Statistics counters
│   └── ExportImport.tsx     # Export/Import functionality
├── App.tsx                  # Main app component
├── main.tsx                 # Entry point
└── index.css                # Global styles
```

### Testing Offline Mode

1. Open app in browser
2. Open DevTools > Network tab
3. Select "Offline" from throttling dropdown
4. Reload page
5. App should work normally

### Building PWA Icons

Icons are configured in `vite.config.ts`. Place PNG icons in public folder:

- `pwa-192x192.png` (192x192px)
- `pwa-512x512.png` (512x512px)
- `apple-touch-icon.png` (180x180px)

Use tools like [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator) to generate all required sizes.

## Security & Privacy

- All data stored locally in browser
- No data sent to any server
- No analytics or tracking
- No user authentication required
- Manual backup/sync only

## License

MIT License - feel free to use for personal or commercial projects.

## Support

For issues or questions, please create an issue in the repository.

---

**Built with ❤️ for offline-first course management**
