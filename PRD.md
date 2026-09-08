# Tablz — Restaurant Management System
### Product Requirements Document (Reorganized)

---

## 1. Overview

**Tablz** is a multi-role restaurant management web application built with Angular. It covers the full operational loop of a restaurant: customer ordering, kitchen workflow, payment, employee/branch management, inventory deduction, waste logging, and end-of-day reporting.

**Roles:**
| Role | Summary |
|---|---|
| Customer | Browses menu, manages cart, places/tracks/cancels orders |
| Worker | Manages live orders (kitchen board), logs waste |
| Manager | Controls inventory, menu, reports, staff (per branch) |
| Admin | Full authority over branches, staff, roles & permissions |

Designed as a **production-grade portfolio project** demonstrating Angular architecture depth for interviews.

---

## 2. Problem Statement

Small/mid-size restaurants often rely on paper tickets, WhatsApp, and manual stock tracking — leading to inaccurate inventory, untracked waste, and no revenue visibility. Tablz digitizes this workflow end-to-end.

---

## 3. Goals

- Demonstrate strong Angular architecture (routing, RxJS, reactive forms, signals)
- Serve as an interview-ready portfolio project
- Follow TDD using Angular 21+ testing tools
- Meet accessibility requirements (SEO, social sharing)

---

## 4. Core Workflow (End-to-End)

1. Admin/manager registers branches and staff accounts (username/email + password), assigns roles & permissions
2. Manager builds the menu per branch, defining each item's ingredient consumption (amount, unit, price)
3. Manager registers inventory for the branch
4. Workers log in and begin receiving/updating orders
5. Customer places an order
6. Order status progresses: `PENDING → IN_PREPARATION → READY → DELIVERED`
   - On `DELIVERED`: inventory is auto-deducted
   - On `CANCELED`: no inventory change (customer can cancel only while `PENDING`)
7. Workers log waste at any time — logged waste is deducted from inventory immediately on entry
8. Manager performs end-of-day reconciliation (expected vs. physical stock), which surfaces only the waste that was **not** already logged
9. Manager generates reports: revenue, orders, waste cost, anomalies/insights

---

## 5. Role Workflows & Pain Points

| Role | Workflow | Key Pain Point Solved |
|---|---|---|
| Customer | Browse → Filter/Search → Cart → Order → Track | Knowing exactly when food is ready |
| Worker | View Pending → Start Prep → Mark Ready → Confirm Delivery | Communicating status + tracking waste |
| Manager | Manage Menu → Monitor Inventory → View Reports | Visibility into stock levels & daily profit |

---

## 6. Feature Breakdown by Phase

**Phasing philosophy:** Phase 1 must be complete and demoable with no unnecessary complication. Phase 2 turns the working app into a real product by adding a differentiator and converting it into a multi-tenant SaaS. Phase 3 makes the platform flexible enough to fit different real-world restaurant business models through admin configuration, instead of custom-building a new app per business type. Because of this, the data model must be **tenant-aware from Phase 1** (every record scoped by a `tenantId`/`restaurantId`, even while only one tenant exists) — retrofitting the schema later is far more expensive than retrofitting a UI.

### Phase 1 — Ship a Complete, Presentable App
- **Customer:** view menu, manage cart, checkout (payment UI only, no real integration)
- **Worker:** order management, waste logging
- **Manager/Admin:** basic staff, inventory, and menu management
- **Platform:** theme + RTL support; basic UI to preview roles without auth; single-tenant in practice, tenant-scoped in schema

### Phase 2 — Multi-Tenant SaaS + Full Feature Set
- **Multi-tenant conversion:** multiple restaurants run on one system; management access via login; customer UI gains a "choose your restaurant" home screen — this is what turns the project into a plausible SaaS revenue model. No single extra "differentiator" feature is needed on top of this — the complete, coherent product is the differentiator.
- **Customer:** real payment integration, order management + history, search/filter by branch, branch viewing, shareable digital receipts (for self or family pickup — customer shares an image proving they're linked to the order)
- **Worker:** per-worker granular permissions (see §7), notifications
- **Manager/Admin:** special offers, report generation, branch management, granular permission grants
- **Platform:** full auth (only admin/manager can register employee accounts), combo orders (a distinct menu-item type, configured — including its own price — at menu-creation time, not computed live from parts), bulk ordering for events, reservations: customers can reserve a table for *n* people at time slot *x*, and — only where an admin has allowed it — a quick "reserve the whole branch" action

### Phase 3 — Configurable Business Archetypes
- Admin-facing settings that let one codebase fit different real-world restaurant shapes without a custom build, e.g.:
  - a single factory/bakery with multiple outlets
  - a chain with multiple branches, each with its own menu
  - a small single-outlet business that's pickup/delivery-only
  - a large restaurant supporting events and table/branch reservations
- Per-tenant branding: logo, color theme, fonts, background, layout adjustments (card shape, navbar style, etc.)
- Customer notifications
- Loyalty features: points, coupons, loyalty programs (admin/manager-configurable)
- Alternate ordering channels: WhatsApp, Telegram, bots
- Resilience for weak/no connectivity — see §7.1 Offline Support for scope
- *(Still undecided — see Open Questions)* voice support for kitchen staff to query/update the order queue hands-free
- PWA support

---

## 7. Authentication

- JWT-based login
- Role-based route guards
- Lazy-loaded modules
- HTTP interceptor
- Auto logout on token expiry
- Password reset support
- Light/dark theme + Arabic/English support
- Must stay simple enough for non-tech-savvy staff/management to use

### 7.1 Permission Model
Two modes, so simple restaurants never have to touch the complex version:
- **Simple (default):** role defines permissions. Owner/Admin → everything. Manager → everything within their own branch. Worker → view/place/update-status/cancel orders, plus waste-log entries (e.g. a failed prep or a recipe overrun). Customer has an entirely separate UI, so roles don't apply there.
- **Detailed (opt-in by admin):** permissions assigned per user instead of by role alone — e.g. Worker A can only place/update orders, Worker B can only edit the menu, Worker C only manages inventory, Worker D only manages staff — while Manager keeps their full predefined permission set. UI-wise, this is an expandable checkbox matrix admins only see if they turn on detailed mode.
- **Data model:** a base `rolePermissions` matrix (role → default permission set) plus a `userPermissionOverrides` table (userId → permission → grant/revoke), rather than duplicating full permission sets per user.

### 7.2 Offline Support (scope)
The real-world failure mode this protects against: if a restaurant becomes fully dependent on the app and loses connectivity, the only fallback today is phone-called-in orders scribbled on paper — which then has to be manually re-entered later. Offline support targets the **worker-facing order flow**, not the full app:
- Service worker + local queue (IndexedDB) lets workers keep updating order status and logging waste while offline; queued actions replay against the server once connectivity returns.
- A manual order-entry screen lets a worker log a phone-called-in order locally, which syncs the same way as any other queued action.
- Conflict resolution on reconnect (e.g. inventory already deducted twice) uses a simple last-write-wins-with-a-log strategy for this project, called out explicitly as a simplification versus a production system.

---

## 8. Module Detail

### 8.1 Customer Module
- **Menu:** search by name, filter by category, responsive grid
- **Cart:** add/remove, adjust quantity, real-time total
- **Order tracking:** real-time status (polling/RxJS), order history, cancel (PENDING only)

### 8.2 Worker Module
- **Orders board:** Kanban-style (`PENDING`, `IN_PREPARATION`, `READY`)
- **Inventory actions:** mark `DELIVERED` (triggers auto-deduction), log waste (manual stock correction)

### 8.3 Manager Module
- **Menu management:** CRUD, archive, ingredients-per-item
- **Inventory:** stock tracking, restock form, low-stock alerts; supports single or multiple inventories per branch; item types: raw material / ready-to-buy / mixed (prepared in-house, e.g., a sauce made from raw ingredients and reused across recipes, with auto deduction from raw stock and auto addition to the prepared-item stock)
- **Reconciliation:** expected vs. physical stock; flags only waste that wasn't already manually logged (logged waste is deducted immediately on entry, so it's already accounted for)
- **Reports:** revenue, orders, waste cost, anomalies (e.g., illogical deductions)
- **Staff:** create/deactivate workers, assign permissions

---

## 9. Angular Architecture

**Modules:** `CoreModule` (services/guards/interceptors) · `SharedModule` (reusable UI) · `AuthModule` · `CustomerModule` · `WorkerModule` · `ManagerModule`

**Services:**
| Service | Responsibility |
|---|---|
| AuthService | Auth & token |
| OrderService | Orders & polling |
| MenuService | Menu CRUD |
| InventoryService | Stock & waste |
| ReportService | Data aggregation |
| CartService | Local cart (signals) |

**Key concepts used:** lazy loading, route guards, HTTP interceptors, reactive forms, RxJS (debounce, switchMap, interval), Angular Signals, OnPush change detection

**Core data models:** `User`, `MenuItem`, `Order`, `InventoryItem`, `WasteEntry`, `ReconciliationEntry`

**Screens:**
- Customer: Menu, Cart, Checkout, Order Tracking
- Worker: Orders Board, Order Details, Waste Form
- Manager: Dashboard, Menu Manager, Inventory, Reports, Staff

---

## 10. Tech Stack

- **Frontend:** Angular 21+ (standalone components)
- **State:** RxJS + Signals
- **Styling:** SCSS (BEM)
- **Testing:** Angular's built-in tools + Testing Library (test by role/what the user sees)
- **Icons:** Lucide Angular / FontAwesome
- **UI Components:** Angular Material
- **Charts:** ngx-charts
- **Backend:** the app runs completely without a real backend through Phase 1 and Phase 2 — JSON Server / Firebase (or local/mocked persistence) stands in for it; a real backend (Express, Mongo, Mongoose) is built afterward, on its own timeline, once Phase 2 is complete
- **Payments:** Paymob — Egypt-based, well-documented, offers a free developer sandbox mode for building/testing the full checkout flow without real transactions, and supports local payment methods (cards + Vodafone Cash / Orange Cash) alongside international cards

---

## 11. What This Project Optimizes For

- **UI:** must be genuinely easier and faster than old-fashioned bookkeeping — no added complication or wasted time for non-technical staff.
- **TDD:** tests written by role/what-the-user-sees, to prevent regressions and demonstrate real-world testing discipline.
- **Workflow:** a proper, organized, automated Git workflow with deployment to Vercel at each meaningful step.
- **Backend sequencing:** the app must work fully (no real backend) through Phase 2; the real backend (Express/Mongo) is expected to take a while and is only started afterward — but the database schema, including tenant-scoping, must be planned before any implementation begins so the mocked layer doesn't need to be redesigned when the real backend arrives.

---

## 12. Interview Talking Points

**Highlights:** multi-role architecture with lazy loading; inventory auto-deduction logic; RxJS for polling & filtering; reactive forms for complex workflows.

**30-sec pitch:**
> Tablz is a restaurant management system built with Angular that demonstrates multi-role architecture. It includes customer ordering, worker order handling, and manager inventory/reporting. The core logic revolves around inventory deduction on delivery, waste tracking, and reconciliation. I used RxJS for polling, reactive forms for workflows, and Angular Signals for state management.

---

## 13. Key Decisions Log

- **Reservations:** support both — a table reservation for *n* people at time slot *x*, and a quick "reserve the whole branch" action, available only where an admin has enabled it. See §14.3.
- **Combo items:** a distinct menu-item type configured entirely at menu-creation time (its required/optional choices and its own price are fixed then), not priced live per-part. See §14.3.
- **Voice support:** deprioritized — last item to build in Phase 3, not worth detailed design now.
- **SaaS differentiator:** no extra standalone feature is required — the complete, coherent product is the differentiator.
- **Receipt/pickup proof:** sharing is done as an image (a receipt screenshot/snapshot) that proves the holder is linked to the placed order — not a link or QR code.
- **Waste vs. reconciliation:** logged waste is deducted from inventory immediately on entry; end-of-day reconciliation only flags waste that was *not* already logged.
- **Backend timeline:** the app must work completely without a real backend through Phase 1 and Phase 2 (mocked/local persistence). The real backend is built afterward and may take a long time — it's a separate, later effort, not a Phase 2 dependency.

---

## 14. UI Design

### 14.1 Theme & Design System

**Modes:** light and dark, user-toggleable, persisted per account (local for guests). Arabic (RTL) and English (LTR), full mirroring of layout — not just text — including directional icons.

**Default color palette (used everywhere until a tenant overrides it in Phase 3):**
| Token | Role | Light | Dark |
|---|---|---|---|
| `bg` | App background | `#FAF7F2` (warm cream) | `#1B1815` (warm near-black) |
| `surface` | Cards, panels, modals | `#FFFFFF` | `#26221E` |
| `primary` | Brand color — CTAs, active states, links | `#D2601A` (burnt terracotta) | `#F0813C` (brighter terracotta for contrast) |
| `secondary` | Sparingly used accent — worker/manager highlights | `#2F6F62` (deep teal) | `#4FA695` |
| `text-primary` | Main text | `#2B2420` (warm charcoal) | `#F5EFE8` |
| `text-secondary` | Captions, metadata | `#6B5F55` | `#B9AFA3` |
| `border` | Dividers, outlines | `#E7DFD5` | `#3A342E` |

**Status colors (same hue across both modes, only luminance shifts for contrast):**
| Status | Color |
|---|---|
| Pending | `#E8A93A` (amber) |
| In Preparation | `#3B7DD8` (blue) |
| Ready | `#2F9E8F` (teal-green) |
| Delivered | `#3C9A5F` (green) |
| Canceled | `#C94C4C` (red) |
| Low stock / waste alert | `#C94C4C` (red) |

Reasoning: warm terracotta reads as food-appropriate without defaulting to the generic red/orange of most delivery apps; the cream/charcoal base keeps it calmer and more "operational tool" than "marketing app," which fits the no-time-wasting goal.

**Typography:** one typeface family, **Cairo** (strong Arabic + Latin support, geometric and friendly, avoids needing two separate font stacks). Weight carries hierarchy rather than mixing typefaces:
- H1: 28px / Bold — page titles
- H2: 22px / SemiBold — section headers
- H3: 18px / SemiBold — card titles
- Body: 15px / Regular — default text
- Caption: 13px / Regular — metadata, timestamps
- Button label: 15px / SemiBold

**Spacing scale:** `4 · 8 · 12 · 16 · 24 · 32 · 48` px, used consistently for padding/gaps.

**Corner radius:** `8px` inputs/buttons · `16px` cards · `20px` top corners on mobile bottom-sheets/modals.

**Elevation:** light mode uses a soft shadow (`0 2px 8px rgba(0,0,0,0.06)`) on cards/surfaces; dark mode uses a 1px lighter border instead of shadow (shadows barely read on dark backgrounds) plus a slightly lighter surface tone to imply elevation.

**Motion:** functional only — status transitions, drag feedback on the Kanban board, toast/snackbar entrances. No decorative animation.

**Iconography:** one icon set (Lucide) throughout. Staff-facing screens (worker/manager) always pair icons with text labels to avoid ambiguity; the customer UI can use icon-only where space is tight (cart, search, filter).

**Phase 3 branding reuse:** tenant customization (logo, color, font, layout) is implemented as overrides to this same token table — never a parallel theming system.

**Logo design:**
- **Concept:** a round plate/table viewed from above (a filled circle in `primary`), with a small rectangular notch cut from its top-right edge at 45° — a nod to a paper order "tab"/ticket — and a thin checkmark-shaped negative-space cut through the center-right, reading as "order served."
- **Wordmark:** "Tablz" set in Cairo Bold, tracked slightly tighter than body text, in `text-primary`.
- **Lockup:** icon + 8px gap + wordmark, used in headers/navbars; icon alone (centered in a rounded-square safe area, ~20% padding) for the app icon, favicon, and PWA icon.
- **Color variants:** full-color (terracotta icon + charcoal wordmark) on light/cream backgrounds; reversed (cream icon + cream wordmark) on dark or primary-colored backgrounds; single-color (charcoal or cream only) for constrained contexts like printed/shared receipts.
- **Minimum size:** below ~24px (e.g. a mobile tab-bar icon), drop the tab-notch detail and keep only the plate + checkmark silhouette for legibility.

---

### 14.2 Phase 1 Screens

#### Role Picker (dev/demo stand-in for auth)
**Actions:**
- Select a role (Customer / Worker / Manager / Admin) to preview that role's UI
- Toggle language (EN/AR) and theme (light/dark)

**Design:**
- **Mobile:** Full-height `bg`-colored screen; logo lockup centered at the top (32px top margin); 4 full-width role cards stacked with 16px gaps — each a `surface` rounded rectangle (16px radius) with a 48px `primary`-colored icon, 18px Bold role name, 14px `text-secondary` one-line description; language/theme toggle as small icon buttons top-right.
- **Tablet:** Cards reflow into a 2×2 grid (each ~45% width, 24px gutter); top margin increases to 48px.
- **Window:** Cards in a single centered row of 4 (220px each, 24px gaps), content max-width 960px centered on `bg`; icons enlarge to 64px.

**State-driven changes:** none — this screen only exists pre-auth and disappears entirely once real login ships in Phase 2.

#### Menu (Customer)
**Actions:**
- Search by item name
- Filter by category
- View item detail
- Add item to cart / adjust quantity from the grid
- Navigate to Cart

**Design:**
- **Mobile:** Sticky `surface` header (1px `border` bottom) with a rounded search input (12px radius, `border` outline) and a horizontally scrollable row of category chips beneath it (`primary` fill when selected, `surface`+`border` otherwise); single-column item grid below (16px side padding, 12px gaps) — each card: 4:3 image, 16px SemiBold name, 14px `primary`-colored price, small circular `primary` "+" button bottom-right; floating pill cart button (bottom-right, `primary` background, white text, e.g. "🛒 3 · $12.50") appears only once non-empty.
- **Tablet:** Grid becomes 2 columns (16px gutter); chips stop scrolling and wrap into a static row; floating cart button can instead dock as a slim bar along the bottom edge.
- **Window:** Grid becomes 3–4 columns; categories move into a fixed 240px `surface` left sidebar (`border`-right) with search above it; cart becomes a permanent 320px `surface` right-hand panel (`border`-left), always visible, replacing the floating button.

**State-driven changes:**
- Cart badge count/total update live as items are added
- Out-of-stock items/categories render at 40% opacity, non-tappable
- RTL mirrors the whole layout — sidebar and cart panel swap sides, chip scroll direction reverses

#### Cart
**Actions:**
- Adjust item quantity
- Remove an item
- View real-time subtotal
- Proceed to Checkout

**Design:**
- **Mobile:** Full-screen list on `bg`; each row is `surface`-colored (72px tall) with a 48×48 thumbnail (8px radius), name/price stacked, and a `border`-outlined quantity stepper right-aligned; sticky `surface` footer (`border`-top, 16px padding) shows "Total: $X" and a full-width `primary` "Checkout" button.
- **Tablet:** Same row styling, rendered as a 400px slide-over panel from the right edge (subtle drop shadow) instead of a full screen.
- **Window:** Rendered as the permanent 320px right-hand panel from Menu — no navigation needed; footer total/checkout pinned to the bottom of that same panel.

**State-driven changes:**
- Empty cart replaces the list with a centered illustration + `primary`-outlined "Browse the Menu" button
- Every quantity change recalculates the total instantly with a brief highlight flash
- Removing an item shows a "Removed — Undo" `surface` snackbar for ~4 seconds

#### Checkout
**Actions:**
- Review order summary
- Select payment method (UI only in Phase 1 — no real charge)
- Confirm order

**Design:**
- **Mobile:** Vertical stack on `bg` — a collapsible `surface` order-summary card (16px radius) on top; payment options as `border`-outlined radio cards below (`primary` border + check icon when selected); full-width `primary` "Confirm Order" button pinned to the bottom, disabled/gray until a method is chosen.
- **Tablet:** Two columns — order summary fixed left (40% width), payment selector + confirm button right (60%), centered container.
- **Window:** Same two-column split with wider (64px+) outer margins; order summary stays permanently expanded rather than collapsible.

**State-driven changes:**
- Confirm button shows a spinner + "Processing…" during the simulated payment
- On success, transitions directly into Order Tracking with a brief "Order placed!" toast

#### Order Tracking
**Actions:**
- View current order status
- Cancel order (only while `PENDING`)
- View basic order history

**Design:**
- **Mobile:** Horizontal-dot status stepper spanning the screen width (`Pending → In Preparation → Ready → Delivered`) — completed steps filled `primary`, current step pulsing `primary`-outlined, future steps `border`-gray; order details card below; full-width red-outlined "Cancel Order" button beneath, shown only in `PENDING`.
- **Tablet:** Same stepper; order details render beside it in a two-column split instead of stacked below.
- **Window:** Same stepper + two-column split, plus a persistent 300px right-hand panel listing past orders (compact rows: date, status dot, total).

**State-driven changes:**
- Stepper advances live as polling returns a new status, with a short fill animation on the connecting line
- "Cancel Order" disappears the instant status leaves `PENDING`
- A canceled order replaces the stepper entirely with a single muted-red "Canceled" state

#### Orders Board (Worker)
**Actions:**
- View orders grouped by status
- Move an order to the next status
- Open an order for detail
- Mark `DELIVERED` (triggers inventory deduction)
- Open the Waste Form

**Design:**
- **Mobile:** Three tabs at the top (Pending / In Prep / Ready), each with a live count badge; vertical stack of order cards below (`surface`, left border colored by status — amber/blue/teal) showing order #, item count, elapsed time; circular `primary` floating action button (bottom-right) opens the Waste Form.
- **Tablet:** Two Kanban columns visible side by side (~48% width each), third reachable via horizontal swipe; columns headed by status-colored bars.
- **Window:** Full three-column Kanban board (fixed ~320px columns, `border`-separated), drag-and-drop with a drop-shadow lift on drag; Waste Form opens as a centered modal instead of navigating away.

**State-driven changes:**
- New incoming orders slide into Pending with a brief amber highlight flash
- Column/tab counts update live
- Orders nearing an SLA threshold (if defined) get an amber left-border pulse

#### Order Details (modal)
**Actions:**
- View full item list, quantities, special instructions
- Advance status
- Cancel (if applicable)

**Design:**
- **Mobile:** Full-screen bottom sheet (slides up, 20px rounded top corners, `surface` background, drag-handle bar) covering ~90% of screen height; item rows with 12px spacing; primary action button (label changes per status) pinned to the bottom.
- **Tablet:** Centered modal, 70% screen width, 40%-opacity dark backdrop; same content with 24px internal padding.
- **Window:** Centered modal, fixed 560px width, same backdrop; item list and instructions can sit side by side if space allows.

**State-driven changes:**
- Primary action label/behavior changes with status: "Start Preparation" (`PENDING`) → "Mark Ready" (`IN_PREPARATION`) → "Mark Delivered" (`READY`)
- Cancel option only visible while `PENDING`

#### Waste Form (modal)
**Actions:**
- Select item
- Enter quantity wasted
- Select reason (failed prep, over-consumption vs. recipe, etc.)
- Submit

**Design:**
- **Mobile:** Full-screen bottom sheet; item selector as a searchable list; quantity as a large stepper (not a keyboard, for kitchen speed); reason as selectable chips; full-width `primary` "Log Waste" submit button at the bottom.
- **Tablet:** Centered modal, fields in two columns (item + reason left, quantity + submit right).
- **Window:** Same two-column modal, fixed ~480px width.

**State-driven changes:**
- Submit stays gray/disabled until item + quantity are set
- On submit, inventory is deducted immediately; a brief `surface` toast ("Waste logged, inventory updated") appears and the modal closes straight back to the board

#### Manager Dashboard
**Actions:**
- View KPIs (today's revenue, order count, low-stock alerts, waste cost)
- Navigate to Menu Manager / Inventory / Reports / Staff

**Design:**
- **Mobile:** Vertical stack of `surface` KPI cards (16px radius, 12px gaps) — a red-tinted low-stock alert card sorts to the top when active; bottom tab bar (5 icons + labels) for navigation.
- **Tablet:** KPI cards in a 2-column grid; navigation moves to a top tab bar.
- **Window:** KPI cards in a single row (4 equal-width cards) across the top; persistent 240px `surface` left sidebar (`border`-right) lists Dashboard/Menu/Inventory/Reports/Staff, active item marked with a `primary` left-border accent.

**State-driven changes:**
- Low-stock alert card only renders when ≥1 item is below threshold
- KPI numbers refresh on a polling interval with a small "updated Xs ago" `text-secondary` caption

#### Menu Manager (+ Add/Edit Item modal)
**Actions:**
- List/search menu items
- Create/edit/archive an item
- Define ingredient consumption per item (amount, unit, price)

**Design:**
- **Mobile:** Vertical list rows (thumbnail, name, price, "Active"/"Archived" status pill in green/gray); circular `primary` "+" button opens the Add/Edit modal as a full-screen form with a scrollable ingredient-rows sub-section.
- **Tablet:** List on the left (40%), selected item's detail/edit form on the right (60%) instead of a modal.
- **Window:** Sortable data table (image, name, category, price, status columns) with the same right-side detail/edit panel, widened to 480px.

**State-driven changes:**
- Archived items render at 50% opacity in the manager's list and are automatically excluded from the live Customer Menu
- The ingredient sub-form auto-adds a new blank row whenever the last row is filled

#### Inventory (+ Restock modal)
**Actions:**
- View stock levels per branch
- Restock an item
- View low-stock alerts
- View item type (raw material / ready-to-buy / mixed-prepared)

**Design:**
- **Mobile:** List rows with a compact horizontal stock-level bar (green→amber→red fill) beside each name; low-stock rows float to the top with a red dot badge; tapping opens the Restock modal (quantity, supplier note, submit).
- **Tablet:** Same list, but tapping expands the row inline (accordion) to reveal restock fields instead of a modal.
- **Window:** Data table with an inline-editable quantity cell for quick restocks, plus a "Restock" button per row opening a fuller modal (supplier, cost, notes) when needed.

**State-driven changes:**
- Stock-bar color shifts live as quantity crosses low/critical thresholds
- A mixed/prepared item's row expands to show its raw-ingredient breakdown, since its stock is derived rather than directly stocked

#### Reports
**Actions:**
- View revenue / orders / waste-cost charts
- Filter by date range
- View flagged anomalies

**Design:**
- **Mobile:** Date-range picker pinned at the top (`surface` bar); one chart at a time below it, swipeable between Revenue/Orders/Waste (dot indicator showing position); red-flagged anomaly list scrolls beneath.
- **Tablet:** Two charts visible at once in a 2-column grid above the anomaly list.
- **Window:** Full dashboard grid — all three charts plus the anomaly list visible simultaneously without scrolling.

**State-driven changes:**
- Anomaly rows are red-flagged and expand on tap to show the reasoning (e.g. "deduction 3× recipe expectation")
- Empty state ("No anomalies this period") replaces the list with a simple checkmark illustration

#### Staff
**Actions:**
- View staff list
- Create/deactivate a worker
- Assign a role

**Design:**
- **Mobile:** List rows (avatar initial, name, role badge, active/inactive toggle switch); `primary` "+" button opens a full-screen add-staff form (name, username/email, password, role dropdown).
- **Tablet:** Data table with inline role-badge dropdown editing; add-staff form opens as a centered modal.
- **Window:** Same table, wider layout with more visible columns at once.

**State-driven changes:** deactivated staff rows gray out (50% opacity) and are excluded from role/order assignment, but stay visible for history.

---

### 14.3 Phase 2 — New & Modified Screens

*Everything in 14.2 persists; the items below are additions or meaningful changes.*

#### Full Auth (Login / Register / Reset Password) — replaces the Role Picker
**Actions:**
- Log in
- Request password reset
- (admin/manager only) Register a new employee account

**Design:**
- **Mobile:** Centered single-column form on `bg`; `surface` input fields (12px radius, `border` outline, `primary` outline on focus); full-width `primary` "Log In" button; "Forgot password?" as a `text-secondary` link beneath it; language/theme toggle top-right.
- **Tablet:** Form inside a centered `surface` card (max-width 420px, 16px radius, soft shadow) instead of edge-to-edge.
- **Window:** Same centered card, widened to 480px, with the Tablz logo lockup above it.

**State-driven changes:**
- Role after login comes from the account itself — the Role Picker no longer exists
- Failed login shows inline red error text beneath the password field, not a separate screen
- "Reset link sent" replaces the form with a confirmation message + "Back to Login" link

#### Branch Picker (Customer)
**Actions:**
- Search/filter branches
- Select a branch to order from
- View branch details (address, hours)

**Design:**
- **Mobile:** List of `surface` branch cards (16px radius) — name, distance, open/closed pill (green/red); a toggle switches to a full-screen map view.
- **Tablet:** Map and list shown side by side (list ~40% left, map ~60% right) instead of toggling.
- **Window:** Same split, wider map (max-width layout ~1200px), list fixed at 360px.

**State-driven changes:**
- Nearest branch (with location permission) highlighted with a `primary` border + "Nearest" badge
- Closed branches render at 40% opacity, non-selectable

#### Order History (extends Order Tracking)
**Actions:**
- View past orders
- Reorder
- View/share a digital receipt

**Design:**
- **Mobile:** Vertical list of past-order rows (date, branch, total, status dot); tapping opens a read-only receipt view styled like a paper receipt, with a "Share" button that shares an image of the receipt.
- **Tablet/Window:** List/table on the left, receipt preview in a side panel on the right instead of full navigation.

**State-driven changes:**
- "Reorder" pre-fills the Cart with the same items/quantities and routes straight there
- The shared image is what proves the holder is linked to that order (for self, or family/whoever collects it at pickup) — not a link or QR code

#### Detailed Permissions (extends Staff)
**Actions:**
- Toggle "detailed permission mode" for a staff account
- Check/uncheck individual permissions

**Design:**
- **Mobile:** Staff-detail screen gains a collapsed "Detailed Permissions" section; expanding it reveals a single-column checkbox list (permission name + short description per row).
- **Tablet/Window:** Same expandable section as a 2-column checkbox grid instead of one column.

**State-driven changes:**
- Section only renders once detailed mode is toggled on for that user
- Checkboxes default to that user's role-based permissions, not blank, when first expanded

#### Special Offers
**Actions:**
- Create/edit/archive an offer
- Set conditions (date range, applicable items/branches)

**Design:**
- **Mobile:** List of offer cards (name, discount, active/expired pill); full-screen create/edit form (date-range pickers, item/branch multi-select chips).
- **Tablet/Window:** Data table + the same form as a centered modal.

**State-driven changes:**
- Active offers automatically surface as a small banner/badge on the relevant items in the Customer Menu
- Expired offers auto-gray-out in the manager's list without manual archiving

#### Combo Item (configured at menu-creation time, not a live pricing calculator)
**Actions:**
- (Manager, in Menu Manager) mark an item as a combo; define its required/optional choice groups and its own fixed price
- (Customer) pick among the combo's predefined choices when adding it to cart

**Design:**
- **Mobile:** Within the Add/Edit Item form, a "Combo Options" section appears once "This is a combo" is toggled on — required-choice groups and optional add-ons each as an expandable list with "+ Add option" rows. On the customer side, opening a combo item shows a full-screen sheet: required choices first, optional add-ons below, running price at the top.
- **Tablet/Window:** Same manager-side structure in two columns when there are many options; customer-side rendered as a centered modal instead of a full sheet.

**State-driven changes:**
- Customer's "Add to Cart" stays disabled until every required choice group has a selection
- The combo's base price is fixed at menu-creation time; the total only moves if paid add-ons are selected

#### Reservation
**Actions:**
- (Customer) reserve a table for *n* people at time slot *x*
- (Customer, only where enabled) make a quick "reserve the whole branch" request
- (Admin) enable/disable reservations per branch, define table/slot availability, allow/disallow whole-branch reservation

**Design:**
- **Mobile:** Stepped flow — branch → date → time → party size → (if enabled) table → confirm, each step full-screen with a progress-dots indicator; a visually distinct "Reserve Whole Branch" entry point appears only where an admin has allowed it, opening a shorter date/time/confirm-only flow.
- **Tablet/Window:** Single combined screen instead of steps — date/time/party-size/table selection all visible at once in a grid; whole-branch reservation offered as a secondary button beside the main flow.

**State-driven changes:**
- Table-level selection only appears if the admin enabled table reservations for that branch
- The whole-branch option only appears if the admin explicitly allowed it for that branch
- Fully booked slots/tables render disabled (gray, non-tappable)

---

### 14.4 Phase 3 — New & Modified Screens

*Builds on Phases 1–2; focus is admin-side configurability plus a few new customer/worker surfaces.*

#### Restaurant Selector (Customer home) — replaces the direct-to-Menu entry
**Actions:**
- Browse/search registered restaurants
- Select one to enter its ordering flow

**Design:**
- **Mobile:** Vertical list of restaurant cards (logo, name, tagline); a horizontally scrollable "Recent" shelf above it, shown only for returning customers.
- **Tablet:** 2-column card grid.
- **Window:** 3–4 column card grid, "Recent" rendered as a separate shelf above it.

**State-driven changes:**
- "Recent" only appears for customers with prior order history
- Once selected, every subsequent screen renders using that restaurant's Phase-3 branding tokens instead of the default Tablz theme

#### Business Archetype Settings (Admin)
**Actions:**
- Toggle which business model this tenant matches (delivery/pickup-only, dine-in-with-reservations, multi-outlet-shared-menu, etc.)

**Design:**
- **Mobile:** Settings list grouped by feature area, each a labeled toggle switch with a one-line explanation.
- **Tablet/Window:** Same list alongside a live preview panel showing which customer-facing screens appear/disappear as toggles are flipped.

**State-driven changes:** every other screen in the app reads this configuration directly — e.g. Reservation screens don't exist at all for a tenant with dine-in disabled; this is the mechanism that makes Phase 3 "configuration, not custom code."

#### Branding Settings (Admin)
**Actions:**
- Set logo, primary color, font, background, basic layout options (card shape, navbar style)

**Design:**
- **Mobile:** Simple form; each control (color picker, font dropdown, logo upload) has a small live-preview thumbnail directly above it.
- **Tablet/Window:** Split screen — settings form on one side, a full live preview of a sample customer screen on the other, updating in real time.

**State-driven changes:** changes apply instantly to the preview only; an explicit "Publish" action is required before they affect the live customer-facing app.

#### Loyalty / Coupons
**Actions:**
- (Customer) view points balance, apply a coupon at checkout
- (Admin) define point rules, create coupons

**Design:**
- **Mobile:** Points balance as a small persistent badge in the app header; a coupon-code field added to Checkout with inline validation.
- **Tablet/Window:** Same, plus a dedicated "Rewards" panel in the customer's account area showing point history.

**State-driven changes:**
- Balance updates immediately after a qualifying order completes
- Invalid/expired coupon codes show inline red validation text on Checkout, not a separate error screen

---
