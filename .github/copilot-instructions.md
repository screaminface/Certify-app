# Copilot Instructions for SPI Course Management PWA

## Project Overview
- **Type:** Offline-first Progressive Web App (PWA)
- **Stack:** React 18, TypeScript, Vite, Tailwind CSS, Dexie (IndexedDB), vite-plugin-pwa, SheetJS (xlsx)
- **Purpose:** Manage course participants, auto-assign groups, generate unique numbers, and support full offline operation.

## Architecture & Data Flow
- **Main entry:** `src/App.tsx` (root component)
- **State/data:** Managed in browser IndexedDB via Dexie (`src/db/database.ts`).
- **Key logic:**
  - Date calculations: `src/utils/dateUtils.ts`
  - Unique number generation: `src/utils/uniqueNumberUtils.ts`
  - Group management: `src/utils/groupUtils.ts`
- **Hooks:**
  - Participants: `src/hooks/useParticipants.ts`
  - Groups: `src/hooks/useGroups.ts`
  - Settings: `src/hooks/useSettings.ts`
- **UI:** Modular components in `src/components/` and `src/components/ui/`.
- **Export/Import:** Data backup/restore via JSON, Excel, CSV (see `ExportImport.tsx`).

## Developer Workflows
- **Install dependencies:** `npm install`
- **Start dev server:** `npm run dev` (http://localhost:5173)
- **Build production:** `npm run build`
- **Preview build:** `npm run preview`
- **Test offline:** Use browser DevTools > Network > Offline, reload page.
- **PWA install:** Chrome/Edge: install icon in address bar; Android/iOS: add to home screen.
- **Icons:** Place PNGs in `public/` as per `vite.config.ts`.

## Project-Specific Conventions
- **Unique numbers:** Format `NNNN-NNN` (e.g., 3532-001), strictly sequential, reset yearly via UI.
- **Groups:** Created automatically on participant assignment, deleted if empty.
- **Completed status:** Auto-computed from checkboxes, can be manually overridden.
- **Manual sync only:** No server, no analytics, no authentication.
- **Data persistence:** Only cleared by browser data clear or destructive import.

## Integration Points
- **IndexedDB:** All persistent data via Dexie (`src/db/database.ts`).
- **SheetJS:** Used for Excel/CSV export.
- **vite-plugin-pwa:** Service worker, manifest, and offline shell.

## Key Files & Directories
- `src/db/database.ts` — Dexie schema/init
- `src/utils/` — Core business logic
- `src/hooks/` — Data access/manipulation
- `src/components/` — UI and workflow
- `public/` — Static assets, icons
- `vite.config.ts` — Build/PWA config

## Example Patterns
- **Adding participant:** Use `useParticipants` hook, triggers group/number logic.
- **Export/Import:** Use `ExportImport.tsx` for backup/restore, see JSON format in README.
- **Filtering/sorting:** Controlled via `Filters.tsx` and table headers in `ParticipantList.tsx`.

## Troubleshooting
- **App not updating:** Clear browser cache, unregister service worker, hard refresh.
- **Import errors:** Validate JSON format, try smaller datasets.

---
For more details, see [README.md](../../README.md) and source files referenced above.
