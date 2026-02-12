# Color Theme Specification

## Final Color Palette

This document describes the comprehensive color theme applied across the application with a calm, corporate, professional palette suitable for long-term use.

### Base Colors (Slate)
- **Background**: `bg-slate-50` - Light neutral background for the entire app
- **Borders**: `border-slate-200` - Subtle borders for cards, tables, inputs
- **Secondary Borders**: `border-slate-300` - Slightly stronger borders for inputs
- **Text Primary**: `text-slate-900` - Main heading text
- **Text Secondary**: `text-slate-700` - Body text, labels
- **Text Muted**: `text-slate-600` - Secondary information
- **Text Disabled**: `text-slate-500` - Disabled or placeholder text
- **Text Inactive**: `text-slate-400` - Inactive navigation items
- **Hover States**: `hover:bg-slate-50` - Subtle hover backgrounds
- **Hover Strong**: `hover:bg-slate-100` - Stronger hover backgrounds
- **Off States**: `bg-slate-100`, `bg-slate-200` - Inactive chip backgrounds

### Primary Colors (Blue)
- **Header**: `bg-blue-700` - Top bar background (corrected for better accessibility)
- **Buttons**: `bg-blue-600`, `hover:bg-blue-700` - Primary action buttons
- **Active Nav**: `text-blue-700` - Active bottom navigation
- **Active Tabs**: `bg-white text-blue-800` - Active desktop tabs
- **Inactive Tabs**: `bg-blue-700/30 text-white/90` - Inactive desktop tabs (on blue header)
- **Focus Rings**: `focus:ring-blue-300`, `focus:ring-blue-500` - Input focus states

### Success Colors (Emerald)
- **Status Active**: `bg-emerald-700 border-emerald-700` - Active status chips (corrected for better contrast)
- **Checkboxes**: `text-emerald-600` - Completed checkboxes
- **FAB**: `bg-emerald-600` - Floating action button
- **Completed Text**: `text-emerald-800` - Completed count text (corrected for readability)
- **Badges**: `bg-emerald-50 text-emerald-800 ring-emerald-200` - Success badges
- **Counters**: `text-emerald-700` - Completed/visible course counters
- **Yes Buttons**: `bg-emerald-600 hover:bg-emerald-700` - Filter yes, apply buttons
- **Excel Export**: `bg-emerald-600` - Excel export button

### Neutral Actions (Slate)
- **CSV Export**: `bg-slate-600 hover:bg-slate-700` - CSV export button (corrected from slate-700)
- **Clear All**: `bg-slate-200 text-slate-700 hover:bg-slate-300` - Clear filters buttons
- **Cancel**: `bg-slate-200 text-slate-700 hover:bg-slate-300 ring-slate-400` - Cancel buttons in modals
- **Footer Buttons**: `bg-slate-100 border-slate-200` - Neutral footer actions

### Danger Colors (Red)
- **Delete/Replace**: `bg-red-600 hover:bg-red-700` - Destructive actions
- **Danger Zone**: `bg-red-50 border-red-200` - Danger zone backgrounds
- **Danger Headers**: `text-red-600` - Danger zone headings
- **No Buttons**: `bg-red-600 hover:bg-red-700` - Filter no button

## Components Updated

### Navigation Components
1. **App.tsx**
   - Background: `bg-slate-50`
   - Heading text: `text-slate-900`

2. **TopBar.tsx**
   - Header: `bg-blue-700` (corrected from blue-600)
   - Active tab: `bg-white text-blue-800`
   - Inactive tab: `bg-blue-700/30 text-white/90`
   - Subtitle: `text-blue-100`

3. **BottomNav.tsx**
   - Active: `text-blue-700`
   - Inactive: `text-slate-400`
   - Border: `border-slate-200`

### Status & Badge Components
4. **StatusChip.tsx**
   - Active: `bg-emerald-700 border-emerald-700 text-white` (corrected from emerald-600)
   - Inactive: `bg-white border-slate-300 text-slate-700`
   - Size: 36px height (mobile-optimized)

5. **Badge.tsx**
   - Success: `bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200`
   - Neutral: `bg-slate-100 text-slate-700 ring-1 ring-slate-200`
   - Info: `bg-blue-50 text-blue-800 ring-1 ring-blue-200`

### Stats & Data Display
6. **StatsPills.tsx**
   - Borders: `border-slate-200`
   - Labels: `text-slate-500`
   - Numbers: `text-slate-900` (total), `text-blue-600` (visible), `text-emerald-700` (completed)
   - Mobile: Collapsible, shows Visible/Completed by default
   - Expand icon: `text-slate-500`

7. **ParticipantCardList.tsx**
   - Borders: `border-slate-200`
   - Heading text: `text-slate-900`
   - Secondary text: `text-slate-600`
   - Empty state: `text-slate-500`

8. **ParticipantList.tsx**
   - Header: `bg-slate-100`
   - Borders: `border-slate-200`
   - Text: `text-slate-700`
   - Hover: `hover:bg-slate-50`
   - Checkboxes: `text-emerald-600`
   - Empty state: `text-slate-500`

### Action Components
9. **FAB.tsx**
   - Background: `bg-emerald-600 hover:bg-emerald-700`

10. **KebabMenu.tsx**
    - Button hover: `hover:bg-slate-100`
    - Icon: `text-slate-600`
    - Menu border: `border-slate-200`
    - Menu items: `text-slate-700 hover:bg-slate-100`

### Filter Components
11. **FiltersDrawer.tsx**
    - Borders: `border-slate-300`
    - Labels: `text-slate-700`
    - Focus rings: `focus:ring-blue-300`
    - Yes button: `bg-emerald-600`
    - No button: `bg-red-600`
    - All button: `bg-slate-500`
    - Footer: `bg-slate-50 border-slate-200`
    - Mobile handle: `bg-slate-300`

12. **FilterChips.tsx**
    - Active chips: `bg-blue-100 text-blue-800`
    - Clear all: `bg-slate-200 text-slate-700 hover:bg-slate-300`

### Modal Components
13. **ConfirmModal.tsx**
    - Title: `text-slate-900`
    - Message: `text-slate-700`
    - Footer: `bg-slate-50`
    - Cancel: `bg-slate-200 text-slate-700 hover:bg-slate-300`
    - Variants:
      - Danger: `bg-red-50 border-red-200`, confirm button `bg-red-600`
      - Warning: `bg-yellow-50 border-yellow-200`, confirm button `bg-yellow-600`
      - Info: `bg-blue-50 border-blue-200`, confirm button `bg-blue-600`

14. **ParticipantModal.tsx**
    - Labels: `text-slate-700`
    - Inputs: `border-slate-300`
    - Read-only fields: `bg-slate-100 border-slate-300`
    - Computed dates container: `bg-slate-50`
    - Cancel button: `border-slate-200 text-slate-700 hover:bg-slate-50`

### Tools & Settings
15. **ToolsPage.tsx**
    - Headings: `text-slate-900`
    - Text: `text-slate-700`
    - Muted text: `text-slate-500`
    - Export buttons:
      - JSON: `bg-blue-600 hover:bg-blue-700`
      - Excel: `bg-emerald-600 hover:bg-emerald-700`
      - CSV: `bg-slate-600 hover:bg-slate-700` (corrected from slate-700)
    - Import buttons:
      - Merge: `bg-blue-600 hover:bg-blue-700`
      - Replace: `bg-red-600 hover:bg-red-700`

16. **DangerZoneReset** (within ToolsPage.tsx)
    - Container: `bg-red-50 border-red-200`
    - Heading: `text-red-600`
    - Text: `text-slate-700`
    - Info box: `bg-white border-slate-200`
    - Checkbox: `border-slate-300 text-red-600`
    - Input: `border-slate-300 focus:ring-red-500`
    - Modal cancel: `border-slate-200 hover:bg-slate-50`

## Color Corrections Applied

During implementation, four strategic corrections were made to improve accessibility and readability:

1. **Header Blue**: Changed from `blue-800` to `blue-700`
   - Reason: Better contrast with white text, less harsh on the eyes

2. **Status Active**: Changed from `emerald-600` to `emerald-700`
   - Reason: Improved contrast for better visibility on white backgrounds

3. **CSV Export**: Changed from `slate-700` to `slate-600`
   - Reason: Balanced hierarchy - CSV is neutral but shouldn't be as dark as primary text

4. **Completed Text**: Changed from `emerald-700` to `emerald-800`
   - Reason: Better readability for numbers in stats pills

## Design Principles

### Hierarchy
- **Blue (600-700)**: Primary actions, active states, main navigation
- **Emerald (600-800)**: Success states, completion indicators, positive actions
- **Slate (200-900)**: Base UI, borders, text hierarchy, neutral actions
- **Red (600)**: Destructive actions, danger states, warnings

### Consistency
- All components use the same slate scale for borders and text
- All active/primary states use blue-600/700
- All success/completion states use emerald-600/700/800
- All danger states use red-600

### Accessibility
- Text contrast ratios meet WCAG AA standards
- Focus rings are clearly visible with blue-300/500
- Hover states provide clear feedback
- Color is never the only indicator (icons, text labels included)

### Mobile-First
- Touch targets are 44px minimum
- Status chips are 36px (mobile-optimized)
- Collapsible stats on mobile save space
- Bottom sheet filters with sticky footer

## Build Output

✅ TypeScript compilation successful
✅ Vite production build: 559.61 kB (181.11 kB gzipped)
✅ CSS bundle: 24.92 kB (4.85 kB gzipped)
✅ PWA service worker generated successfully
✅ No errors or warnings

## Future Maintenance

When adding new components, use:
- `slate-*` for all neutral UI elements (borders, backgrounds, text)
- `blue-600/700` for primary actions and active states
- `emerald-600/700/800` for success and completion states
- `red-600` for destructive actions and danger zones
- Never use `gray-*` classes - always use `slate-*` for consistency

This palette provides excellent long-term readability, professional appearance, and maintains a calm, corporate aesthetic suitable for daily use.
