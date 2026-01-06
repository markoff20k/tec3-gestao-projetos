# Design Guidelines: Enterprise Project & Commercial Management System

## Design Approach
**System Selected:** Material Design 3 (Material You)
**Rationale:** Enterprise productivity application requiring clear data hierarchy, robust form components, and professional polish for B2B context.

## Color Palette - TEC3 Engenharia Brand
**Brand Source:** https://www.tec3engenharia.com.br/

**Primary Colors:**
- Deep Navy Blue: HSL(207, 70%, 25%) - Main brand color, used for headers, primary buttons
- Gold/Amber Accent: HSL(45, 90%, 55%) - Highlight actions, sidebar active items, accents

**Light Mode:**
- Background: Soft off-white with slight blue tint
- Sidebar: Dark navy (HSL 207, 70%, 18%) with light text
- Cards: Light gray with subtle blue undertone
- Text: Deep navy for primary, muted blue-gray for secondary

**Dark Mode:**
- Background: Deep navy-black (HSL 207, 70%, 8%)
- Sidebar: Darker navy (HSL 207, 70%, 10%)
- Primary: Lighter blue (HSL 207, 70%, 45%) for visibility
- Accent remains gold for consistency

**Usage Guidelines:**
- Navy blue: Navigation, headers, primary actions, professional tone
- Gold accent: CTAs, active states, success indicators, important highlights
- Maintain high contrast for accessibility

## Typography System
**Primary Font:** Inter (Google Fonts)
- Headings: 600 weight, sizes: 2xl (32px), xl (24px), lg (20px)
- Body: 400 weight, base (16px) for content, sm (14px) for secondary
- Labels/Buttons: 500 weight, sm (14px)
- Data Tables: 400 weight, sm (14px)

**Hierarchy Rules:**
- Page titles: text-2xl font-semibold
- Section headers: text-xl font-semibold
- Card/Panel titles: text-lg font-semibold
- Form labels: text-sm font-medium
- Table headers: text-sm font-medium uppercase tracking-wide
- Body text: text-base
- Helper text/captions: text-sm

## Layout System
**Spacing Scale:** Consistent use of Tailwind units: 1, 2, 3, 4, 6, 8, 12, 16, 24
- Component padding: p-4 to p-6
- Section spacing: mb-6 to mb-8
- Card gaps: gap-4 to gap-6
- Form field spacing: space-y-4

**Grid Structure:**
- Main container: max-w-7xl mx-auto px-4
- Dashboard cards: 3-column grid on desktop (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Data tables: Full width with horizontal scroll
- Forms: max-w-2xl for optimal readability

## Component Library

**Navigation:**
- Persistent sidebar (260px width) with nested menu structure
- Top app bar with user profile, notifications, quick actions
- Breadcrumbs for deep navigation paths

**Data Display:**
- Tables: Striped rows, sticky headers, sorting indicators, row actions menu
- Cards: Elevated (shadow-md), rounded-lg, p-6
- Stat cards: Large numbers (text-3xl font-bold), labels below, icon top-right
- Status badges: Rounded-full px-3 py-1 text-xs font-medium

**Forms:**
- Input fields: Outlined style with floating labels, border-2, rounded-md, p-3
- Dropdowns: Consistent with inputs, chevron icon right-aligned
- Date pickers: Calendar icon, formatted display
- Required field indicators: Red asterisk after label
- Validation: Inline error messages (text-sm) below fields
- Form sections: Separated by subtle dividers (border-t) with py-6 spacing

**Action Elements:**
- Primary buttons: Filled, rounded-md, px-6 py-3, font-medium
- Secondary buttons: Outlined, matching radius/padding
- Icon buttons: Square (40px), centered icon, subtle hover state
- FAB (Floating Action Button): Bottom-right for primary actions like "New Proposal"

**Modals/Dialogs:**
- Overlay backdrop with blur
- Centered card (max-w-2xl), rounded-lg, shadow-2xl
- Header with title and close button
- Content area with scrollable body
- Footer with action buttons (right-aligned)

**Tables:**
- Header: Font-medium, uppercase text-xs, background treatment
- Rows: Consistent height (h-12), hover state
- Actions column: Right-aligned with icon buttons
- Pagination: Bottom-aligned with page numbers and navigation

**Dashboard Layout:**
- Top section: Key metrics in 4-column stat card grid
- Middle section: 2-column layout (main chart + summary cards)
- Bottom section: Recent activity table

**CRUD Pages:**
- Header: Page title, search bar, filter dropdowns, "Add New" button
- Content: Data table with inline edit/delete actions
- Bulk actions: Checkbox selection with action bar

**Form Pages:**
- Two-column layout for efficiency (labels left, inputs right on desktop)
- Sticky action bar at bottom with Save/Cancel buttons
- Progressive disclosure for advanced options (collapsible sections)

## Icons
**Library:** Material Icons (via CDN)
- Navigation items: 20px icons
- Action buttons: 20px icons
- Form inputs: 16px icons
- Status indicators: 16px icons

## Interaction Patterns
- Loading states: Linear progress bars at top of containers
- Empty states: Centered icon (48px), heading, description, CTA button
- Confirmation dialogs: For destructive actions
- Toast notifications: Top-right position, auto-dismiss
- Tooltips: On icon buttons and truncated text

## Responsive Behavior
- Desktop (lg+): Sidebar visible, multi-column layouts
- Tablet (md): Sidebar collapsible, 2-column layouts
- Mobile: Bottom navigation, single column, stacked cards

**Critical Design Principles:**
1. Data density over whitespace - maximize information visibility
2. Consistent elevation hierarchy for depth perception
3. Clear visual feedback for all interactions
4. Accessible contrast ratios throughout
5. Keyboard navigation support for power users