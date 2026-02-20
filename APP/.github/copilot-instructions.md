# Copilot Instructions for SPI CERTIFY

## Project Overview
**SPI CERTIFY** is a hybrid offline-first PWA + multi-tenant SaaS application for managing safety course participants.

- **Stack:** React 18, TypeScript, Vite, Tailwind CSS, Dexie (IndexedDB), Supabase (optional), Capacitor (mobile), Tauri (desktop)
- **Architecture:** Offline-first with optional cloud sync/multi-tenancy via Supabase
- **Purpose:** Manage course participants, auto-assign groups (active/planned/completed workflow), generate sequential unique numbers, enforce subscription-based read-only mode, support Bulgarian + English localization

## Hybrid Architecture & Data Flow

### Two-Mode Operation
1. **Offline/Standalone Mode:** Pure IndexedDB via Dexie, no authentication, no server
2. **Multi-Tenant SaaS Mode:** Supabase authentication + PostgreSQL backend with subscription/entitlement system

### Graceful Degradation
- Supabase configured via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars
- When env vars missing → standalone mode (no auth, no entitlement checks)
- When Supabase enabled → full multi-tenant with read-only enforcement based on subscription status
- See `src/lib/supabaseClient.ts` for client initialization, `src/contexts/EntitlementContext.tsx` for entitlement logic

### Data Storage
- **Local:** IndexedDB via Dexie (`src/db/database.ts`) - groups, participants, settings, yearlyArchives
- **Cloud (if enabled):** Supabase PostgreSQL (`supabase/*.sql` migrations) - tenants, memberships, subscriptions, entitlements, devices

### Read-Only Mode Enforcement
- **Trigger:** Subscription expired (status=expired, period_end < now, grace period exhausted)
- **State:** Set via `setAppReadOnlyMode(true)` in `EntitlementContext`, stored in `database.ts`
- **Enforcement:** Dexie hooks (`creating`, `updating`, `deleting`) throw `APP_READ_ONLY_ERROR` when in read-only
- **UX:** User sees banner, all mutating UI actions disabled
- **Grace Period:** 10 calendar days after `current_period_end` (see `002_entitlement_functions.sql`)

## Multi-Tenant Billing/Entitlement System

### Schema (PostgreSQL)
- **Tenants:** Organization accounts (`app.tenants`)
- **Memberships:** User-tenant relationships with roles (owner/admin/manager/member) (`app.memberships`)
- **Subscriptions:** Billing state per tenant (`app.subscriptions`) - provider (stripe/paddle/manual), plan_code (monthly/yearly), status (active/past_due/expired)
- **Entitlements:** Computed access rights (`app.entitlements`) - read_only flag, grace_until, status
- **Profiles:** User display info linked to auth.users (`app.profiles`)
- **Devices:** Optional device fingerprinting for security (`app.devices`)

### Key Functions
- `app.refresh_entitlement_for_tenant(tenant_id)`: Recompute entitlement from subscription (run after billing changes)
- `app.entitlement_me()`: Client-side query for current user's entitlement (requires authenticated session)
- `app.manual_set_paid_until()`: Extend subscription period for manual billing
- `app.manual_mark_unpaid()`: Mark subscription as past_due/expired

### Manual Billing Workflow
**Operations SQL File:** `supabase/OPS_manual_billing_quick.sql` (comprehensive billing toolbox)

**Common operations:**
1. **Extend subscription:** `app.manual_set_paid_until(tenant_id, 'monthly', 30, 'payment memo')`
2. **Plan switch (preserve period):** Update `plan_code` in subscriptions, call `refresh_entitlement_for_tenant`
3. **Force lock:** Set `status='expired'` AND `current_period_end` to past date, refresh entitlement
4. **Unlock:** Call `manual_set_paid_until` with new period

**Critical pattern:** ALWAYS call `app.refresh_entitlement_for_tenant(tenant_id)` after direct subscription table updates

## Business Logic Constraints

### Course Dates (Monday-Based)
- **Medical Date:** Input by user (date of medical exam)
- **Course Start:** Next Monday after medical date (or same day if medical is Monday) - see `src/utils/dateUtils.ts:nextMonday()`
- **Course End:** Course start + 7 days (always next Monday)
- **Medical Validity:** 6 calendar months from medical date (see `src/utils/medicalValidation.ts`)
- **Auto-computation:** UI shows computed dates as read-only, not editable

### Unique Number Generation (NNNN-NNN format)
- **Format:** 4-digit prefix + hyphen + sequence (e.g., 3532-001, 3533-002)
- **Strict Ordering:** Each new participant: prefix+1, seq+1 (double increment)
- **Source of Truth:** `db.settings` table stores `lastUniquePrefix` and `lastUniqueSeq`
- **Collision Handling:** If duplicate detected, auto-increment until unique (see `src/utils/uniqueNumberUtils.ts`)
- **Yearly Reset:** Manual operator action sets new prefix, resets seq to 0
- **NEVER:** Use zero-padding on sequence in display (3532-1, not 3532-001 in logic, but format displays as needed)

### Group Workflow (Active/Planned/Completed)
- **Status States:**
  - `active`: Current group accepting participants (only ONE active at a time)
  - `planned`: Future group, no group number yet (`groupNumber: null`)
  - `completed`: Closed group, locked by default (`isLocked: true`)
- **Group Assignment:** Participant assigned by `courseStartDate` (identifies which period/group)
- **Group Numbers:** Sequential integers (1, 2, 3...), assigned ONLY when group activates
- **Lifecycle:**
  1. Create planned group when new courseStartDate has no group
  2. Activate planned group → assign next groupNumber, set `status='active'`, record `activatedAt`
  3. Close active group → set `status='completed'`, `isLocked=true`, `closedAt`, auto-promote next planned
- **Key Functions:** See `src/utils/groupUtils.ts` - `getActiveGroup()`, `createGroup()`, `closeActiveGroup()`, `activateGroup()`

### Completed Status (Checkboxes)
- **Auto-computed:** `sent && documents && handedOver && paid` → `completedComputed: true`
- **Override:** User can manually toggle via `completedOverride` (boolean | null)
- **Display:** Shows computed unless override set, then shows override value
- **Timestamp:** `completedAt` recorded when first becomes completed (preserved for audit)

## Localization (i18n)

- **Languages:** Bulgarian (primary), English (secondary)
- **Auto-detect:** Browser locale → defaults to 'bg' if starts with 'bg', else 'en'
- **Storage:** localStorage key `spi.language`
- **Translation Files:** `src/locales/bg.ts`, `src/locales/en.ts` (flat key-value objects)
- **Access:** `useLanguage()` hook → `t(key, params)` function for translation with interpolation
- **Pattern:** Always use translation keys in UI, NEVER hardcode Bulgarian or English text

## Developer Workflows

### Environment Setup
```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (localhost:5173)
npm run build                  # TypeScript compile + Vite build
npm run preview                # Preview production build
```

### Multi-Platform Builds
- **Web PWA:** Standard Vite build to `dist/`
- **Android (Capacitor):** `npx cap sync android`, `npx cap open android`, build in Android Studio
- **Desktop (Tauri):** `npm run tauri:dev` or `npm run tauri:build` (Rust + WebView)
- **Config:** `capacitor.config.ts` (mobile), `src-tauri/tauri.conf.json` (desktop)

### Supabase Local Development
1. Apply migrations: `001_multi_tenant_auth.sql` → `002_entitlement_functions.sql` → `003_seed_first_tenant.sql` → `004_manual_billing_stripe_ready.sql` → `005_public_entitlement_proxy.sql`
2. Use SQL Editor in Supabase Dashboard
3. Test with `OPS_manual_billing_quick.sql` operations
4. Auth URL config must include: `Site URL: http://localhost:5173/Certify-app/`, `Redirect URLs: http://localhost:5173/**`

### Testing Offline Mode
1. Open DevTools → Application → Service Workers → Check "Offline"
2. Reload page → App should work normally
3. Test PWA install: Chrome address bar → Install icon

## Project-Specific Conventions

### Code Organization
- **Contexts:** `src/contexts/` - React contexts for global state (Entitlement, Language)
- **Hooks:** `src/hooks/` - Data access/mutation hooks (useParticipants, useGroups, useSettings, useBulkActions)
- **Utils:** `src/utils/` - Pure business logic (date, unique numbers, groups, certificate generation, crypto, medical validation)
- **Services:** `src/services/db/` - Backend sync services (if Supabase enabled)
- **Components:** `src/components/` - UI components (modals, lists, filters, stats)
- **Locales:** `src/locales/` - Translation dictionaries

### Color System (Tailwind)
- **Base:** Slate (neutral backgrounds, borders, text)
- **Primary:** Blue-600/700 (headers, buttons, active states)
- **Success:** Emerald-600/700 (completed status, FAB, success actions)
- **Danger:** Red-600/700 (delete, destructive actions)
- **Reference:** `COLOR_THEME_SPEC.md` for comprehensive color usage guide

### Database Migrations
- **Dexie Versioning:** Sequential `.version(N)` calls in `database.ts` constructor
- **Upgrade Logic:** ALWAYS provide `.upgrade(tx => {...})` for data migrations
- **Testing:** Clear IndexedDB (`DevTools → Application → Storage → IndexedDB → Delete`) and reload to test fresh schema

### Error Handling
- **Read-Only Mode:** Catch `APP_READ_ONLY_ERROR` by name, show subscription upgrade prompt
- **Supabase Errors:** Handle gracefully, allow fallback to offline mode if server unavailable
- **Validation Errors:** Show inline in forms (e.g., medical date expired, duplicate unique number)

## Key Files & Directories

### Core Architecture
- `src/db/database.ts` - Dexie schema, migrations, read-only hooks
- `src/lib/supabaseClient.ts` - Supabase client singleton
- `src/contexts/EntitlementContext.tsx` - Entitlement state + auth methods
- `src/contexts/LanguageContext.tsx` - i18n state + translation function

### Business Logic
- `src/utils/dateUtils.ts` - Monday calculations, course date computation
- `src/utils/uniqueNumberUtils.ts` - Unique number generation, collision handling
- `src/utils/groupUtils.ts` - Group lifecycle (create, activate, close, cleanup)
- `src/utils/medicalValidation.ts` - Medical date 6-month validity check
- `src/utils/certificateGenerator.ts` - DOCX certificate generation from templates

### Data Access
- `src/hooks/useParticipants.ts` - Participant CRUD + completed status logic
- `src/hooks/useGroups.ts` - Group CRUD + workflow operations
- `src/hooks/useSettings.ts` - Settings management (unique number state, archive)
- `src/hooks/useBulkActions.ts` - Bulk operations (archive, delete filtered)

### UI Components
- `src/components/ParticipantList.tsx` - Main table with inline editing
- `src/components/ParticipantModal.tsx` - Add/edit form with validation
- `src/components/Filters.tsx` - Search/filter controls
- `src/components/ExportImport.tsx` - JSON backup, Excel/CSV export
- `src/components/AboutModal.tsx` - Version info, language toggle, entitlement status

### Backend (Supabase)
- `supabase/001_multi_tenant_auth.sql` - Core schema (tenants, memberships, profiles)
- `supabase/002_entitlement_functions.sql` - Entitlement computation logic
- `supabase/004_manual_billing_stripe_ready.sql` - Billing functions (manual_set_paid_until, etc.)
- `supabase/OPS_manual_billing_quick.sql` - Operator toolbox for billing operations

## Common Patterns & Examples

### Adding a Participant (with group assignment)
```typescript
// 1. Validate medical date (must be within 6 months)
if (!isMedicalDateValid(medicalDate)) {
  throw new Error(MEDICAL_EXPIRED_MESSAGE);
}

// 2. Compute course dates
const { courseStartDate, courseEndDate } = computeCourseDates(medicalDate);

// 3. Get suggested group or create planned
const suggestedGroup = await getSuggestedGroup(courseStartDate);
const group = suggestedGroup || await createGroup(courseStartDate, 'planned');

// 4. Generate unique number
const uniqueNumber = await generateNextUniqueNumber();

// 5. Create participant (triggers Dexie hooks, blocked if read-only)
await db.participants.add({
  id: uuidv4(),
  companyName,
  personName,
  medicalDate,
  courseStartDate,
  courseEndDate,
  uniqueNumber,
  // ... other fields
});
```

### Checking Entitlement Before Mutation
```typescript
// In component (via EntitlementContext)
const { entitlement } = useEntitlement();

if (entitlement.readOnly) {
  // Show upgrade prompt, disable buttons
  return;
}

// Dexie hooks automatically throw APP_READ_ONLY_ERROR if read-only
try {
  await db.participants.delete(id);
} catch (err) {
  if (err.name === APP_READ_ONLY_ERROR) {
    // Show subscription expired message
  }
}
```

### Manual Billing Operation (SQL)
```sql
-- Extend subscription by 30 days (monthly)
select * from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,  -- tenant_id
  'monthly',
  30,
  'bank transfer 2026-02-16'
);

-- Switch plan without changing period
with params as (
  select 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid as tenant_id,
         'yearly'::text as target_plan
)
update app.subscriptions s
set plan_code = p.target_plan, updated_at = now()
from params p
where s.tenant_id = p.tenant_id and s.provider = 'manual';

-- ALWAYS refresh entitlement after subscription change
select app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid);
```

## Troubleshooting

- **App not updating:** Hard refresh (Ctrl+Shift+R), clear service worker, clear IndexedDB
- **Read-only mode stuck:** Check `localStorage` for cached entitlement, force entitlement refresh in UI
- **Supabase auth issues:** Verify auth redirect URLs in Supabase Dashboard → Authentication → URL Configuration
- **Unique number collision:** Check `db.settings`, compare with max participant unique number, run collision resolution
- **Group lifecycle broken:** Verify only one active group exists, check for planned groups with `groupNumber` assigned (should be null)

---
See [README.md](../README.md), [PROJECT_COMPLETE.md](../PROJECT_COMPLETE.md), [QUICKSTART.md](../QUICKSTART.md) for user-facing documentation.
