# Stinō Architecture: Frontend

For: what lives where in `frontend/src/` and what each part is for, without scanning the code.
Not here: behaviour, history and how-it-works; those live in the code and its tests.
This is §4 of [ARCHITECTURE.md](./ARCHITECTURE.md), split out so the frontend map only loads when it is the task; §4.x references elsewhere resolve here.
Paths are relative to `frontend/src/` unless they start with `frontend/`. Guards are the `it(...)` titles in `lib/test/architecture.test.ts` (ARCHITECTURE.md §7).

---

## 4. Frontend

### 4.1 Layer responsibilities

| Layer | Path | Responsibility | Must NOT |
| --- | --- | --- | --- |
| Shell | `App.svelte`, `NavTabs.svelte`, `Gear.svelte`, `Tag.svelte`, `main.ts`, `app.css` | `App.svelte` renders the header, the active view, the four overlays and starts `watchDayChange()`; `NavTabs.svelte` is the tab bar (header on wide, bottom on phone); `Gear.svelte` and `Tag.svelte` are its header icons; `main.ts` mounts the app, fonts and the press tracker | Import more than a feature folder's entry component (guard `keeps lib/components and lib/controllers shared, and feature folders private`) |
| Views | `views/<view>/` | One folder per tab: the entry component plus its single-caller components and rune controllers (§4.2) | Be imported from another feature folder (ESLint `stino/boundaries`) |
| Overlays | `overlays/<overlay>/` | One folder per header dialog, organised like a view (§4.2) | Same as views |
| Shared components | `lib/components/` | UI with ≥ 2 importers that are not all in one feature folder (§4.4) | Hold a one-folder component (guard `keeps lib/components and lib/controllers shared, and feature folders private`); expose composer internals (ESLint `stino/boundaries`) |
| Controllers | `lib/controllers/` | Shared rune factories that orchestrate views (§4.3) | Hold a one-folder controller (same guard) |
| Pure helpers | `lib/tasks/`, `lib/recurrence/`, `lib/dnd/` | Pure functions with a sibling test; DOM code beside them is `*.action.ts` / `*.action.svelte.ts` (§4.5) | Import `lib/api` (ESLint `stino/boundaries`); lack a test unless DOM-only (guard `keeps a test beside every helper and rune module`) |
| Lib single files | `lib/*.ts`, `lib/*.svelte.ts` | One concern each: HTTP, types, constants, copy, dates, module-level rune state (§4.5) | Call `fetch` outside `api.ts` (ESLint `no-restricted-globals`); read the viewport outside `viewport.svelte.ts` (guard `keeps isCompact() the only JS breakpoint`) |
| Styles | `app.css`, `frontend/tailwind.config.js` | Theme CSS variables and their Tailwind mapping (§4.7) | Be bypassed by a hex, `rgb()`, `dark:` variant, `text-[Npx]` or off-scale shadow (guard `styles only with design tokens`) |
| Tests | `*.test.ts` beside the module, `lib/test/` | Vitest in Node with client-compiled runes, no DOM; `api` stubbed with `vi.mock` | Use a UTC date in production code (guard `keeps dates as local calendar dates`); suppress a check (guard `keeps comments short, current and free of lint suppressions`) |

### 4.2 Feature folders and placement

| Folder | Entry | Also holds |
| --- | --- | --- |
| `views/inbox/` | `InboxView` | Quick capture: `QuickCapture`, `CapturePreview`, `LabelListbox`, `quick-capture.svelte.ts`; Batch edit: `BulkBar`, `LabelSelect`, `SelectableTaskRow`, `inbox-select.svelte.ts`; one toast for an undo offer or a dated capture's notice: `UndoToast`, `inbox-complete.svelte.ts`; the row outro `fold-away.ts` |
| `views/today/` | `TodayView` | Nothing else: today's `DayAgenda`, an Add task button and the composer |
| `views/week/` | `WeekView` | `DaySheet`: the phone full-screen day zoom; `scroll-to-day.action.ts`: scrolls the phone stack to today |
| `views/month/` | `MonthView` | `MonthGridCompact`, `CalendarCellMobile`, `grid-expand.svelte.ts` (bottom dwell exposes the phone grid mid-drag), `month-period.ts` (period step and fetched range) |
| `overlays/search/` | `SearchDialog` | `SearchResults`, `search.svelte.ts` (debounced query, inline editor), `ArrowLeft` |
| `overlays/labels/` | `LabelManager` | `LabelRow`, `LabelForm`, `label-store.svelte.ts` |
| `overlays/settings/` | `SettingsDialog` | `ThemeToggle`, `Upload` |
| `overlays/import/` | `ImportDialog` | `import.svelte.ts` (one import at a time, summary) |

1. Code used by one feature folder lives in that folder; it moves to `lib/components/` or `lib/controllers/` once a second folder imports it.
2. A feature folder is private: only its own files import it, and `App.svelte` imports only its entry.
3. The composer is used through `ComposerDialog` or `ComposerForm` only.
4. An icon used by one folder stays there (`Gear.svelte`, `Tag.svelte`, `ArrowLeft`, `Upload`); a shared icon goes to `lib/components/icons/` on `Icon`.
5. A rune controller is a `*.svelte.ts` factory with a sibling test, in a feature folder or in `lib/controllers/`.

### 4.3 Shared controllers and state model

| File | Owns | Bound by |
| --- | --- | --- |
| `task-core.svelte.ts` | `createTaskCore()`: tasks, labels, `bindLoad` / `loadThrough` / `reload`, and every task or label write behind one lock (`toggle`, `reopen`, `reorder`, `reorderLabels`, `remove`, `removeOccurrence`, `moveToDay`, `moveOccurrence`, `optimistic`, `save`, `run`); `toggleIn` ticks a row in another list; `ensureLabel` creates a label outside the lock | Every view; `search.svelte.ts` |
| `lock.svelte.ts` | `createLock()`: `pending` until every write is done, and `error`; `run`, `optimistic` (apply, persist, revert on failure) and `save` (keeps the lock through the follow-up) are dropped while pending; `queue` applies at once and persists after every earlier write | `task-core.svelte.ts`, `label-store.svelte.ts`, `import.svelte.ts` |
| `toggles.ts` | `createToggles(lock)`: queued ticks; only an occurrence's newest tick writes its row, a failure restores its last server state; `persistToggle` | `task-core.svelte.ts` |
| `composer.svelte.ts` | `createComposer(core, { afterSave })`: the add/edit dialog state, submit, delete a task or one occurrence; `dismiss` closes an open form and reports whether it did | Every view, `DaySheet`, `search.svelte.ts` |
| `drop-list.svelte.ts` | `createDropList(source)`: owned dnd lists keyed by zone; `settle` puts the source back after a write that did not land | `calendar-board.svelte.ts`, `DayAgenda`, `InboxView`, `LabelManager` |
| `period-nav.svelte.ts` | `createPeriodNav(core, options)`: the shown period, `go`, `goToday` (then `onToday` once it has slid in); binds the core's load to the period's range | `MonthView`, `WeekView` |
| `calendar-board.svelte.ts` | `createCalendarBoard(core, keys, open)`: per-day drop lists, `consider` / `finalize`, the drop plan and tap-to-open | `MonthView`, `WeekView` |
| `calendar-selection.svelte.ts` | `createCalendarSelection(core)`: the open day, its tasks, the anchor rect for `DayPanel` | `MonthView`, `WeekView` |
| `calendar-context.ts` | `setCalendarContext` / `getCalendarContext`: core, board, selection and composer for calendar components | Set by `MonthView` and `WeekView`; read by the day surfaces, `PeriodShell` and `DaySheet` |

| Concern | Model |
| --- | --- |
| Server data | One `createTaskCore()` per view or overlay; components read it, never keep a copy (review) |
| Writes | Through the core's one lock: optimistic apply, persist, revert on failure; a tick queues behind a busy lock, any other write is dropped; `save` when a reload follows, so a failed refresh never reads as a failed write; only the newest load commits |
| Add/edit | `createComposer`; `afterSave` defaults to the core's `reload`, Inbox passes its own to drop a task that gained a date |
| Drag lists | `createDropList`, re-projected only while no gesture is live (§4.6) |
| Period navigation | `createPeriodNav` → `core.loadThrough` fetches the target range first, then commits inside `navigateWithSlide` (`nav-transition.ts`), a View Transition that never mounts the outgoing grid twice |
| Refresh | `bumpRefresh()` (`refresh.svelte.ts`) after a change outside a view's core: `App.svelte` on closing Search or Labels, `import.svelte.ts` after an import, `day-change.svelte.ts` after a new day or a rollover; every `bindLoad` core reloads quietly |
| Today and rollover | `watchDayChange()` (`day-change.svelte.ts`, started by `App.svelte`) posts the browser's date to the rollover endpoint on mount and on tab return, once per day, then advances `today.svelte.ts`, its only writer |
| Preferences | Persisted through `storage.ts`: the theme (`theme.ts`, applied pre-paint by `frontend/index.html`) and the by-label order (`group-view.svelte.ts`, default on) |
| Layout | `isCompact()` and `isCoarsePointer()` (`viewport.svelte.ts`) |

### 4.4 Shared components (`lib/components/`)

| Group | Component | For |
| --- | --- | --- |
| Shells | `ListViewShell` | Today and Inbox frame: title, actions, error, loading and empty states, optional edge scroll |
| | `PeriodShell` | Month and Week frame: title, previous / today / next, swipe, error |
| | `Modal` | The native `<dialog>` scaffold of every dialog; sizes from `MODAL_SIZES`; `error` shows under the header, `onEscape` lets Escape end an inner state first, `onHeaderClose` overrides the X, `dismiss="closerequest"` turns off the outside click; presses and clicks stop at the dialog |
| | `PanelHeader` | Title, subtitle and close button of `Modal`, `DayPanel` and Search's edit mode; optional `leading` snippet and `closeLabel` |
| Calendar | `DayCell` | Wide month or week cell with pills (`variant`) |
| | `DayListSection` | A day heading over its task rows: the phone month agenda and the phone week stack |
| | `DayPanel` | The desktop floating, non-modal day zoom beside its cell |
| | `DayAgenda` | One day's list, flat or in label sections, with the order toggle: Today and `DaySheet` |
| | `DateBadge` | The day number, filled for today |
| | `QuickAddButton`, `AddTaskButton` | Per-day "+" button; full-width "Add a task" button under a day list |
| Tasks | `TaskRow` | List row: toggle, title, `TaskMeta`, label tint; `slim`, `holdToDrag`, `completing`, `leading` / `trailing` |
| | `TaskPill` | Compact grid task with label tint and toggle; `wrap` shows the full title (`DayPanel`) |
| | `TaskMeta` | A row's meta line: date, time, repeat, label |
| | `CheckToggle` | The completion checkbox, safe inside a drag item |
| | `ReorderList` | A reorderable list: grip zone on wide, press-and-hold zone on phone |
| Labels | `LabelChip`, `LabelMark` | Label pill; its dot, emoji (`font-emoji` in a fixed box) and name in a chip, option or toggle look |
| Controls | `IconButton`, `SegmentedControl` | Labelled icon-only button (`sm`/`md` size, label as tooltip); generic segmented choice |
| | `GroupViewToggle` | The List / By label control for `group-view.svelte.ts` |
| | `DeleteConfirm` | Delete button that opens a small confirmation (`title`, optional `detail`) with Cancel focused |
| Feedback | `ErrorAlert`, `EmptyState` | Error banner; dashed empty message |
| Brand | `Cairn` | The logo mark, filled from theme tokens |
| `lib/components/composer/` | `ComposerDialog`, `ComposerForm` | The add/edit dialog and its form, embedded inline by `DaySheet` and Search; the other files are internal parts (schedule, label, recurrence pickers, recurring-delete confirm) |
| `lib/components/icons/` | `Icon`, `Check`, `Chevron`, `Close`, `Plus`, `Search` | `Icon` is the SVG frame; the rest are shared glyphs |

### 4.5 Helper map

`lib/tasks/` holds pure task logic:

| File | Exports |
| --- | --- |
| `predicates.ts` | `isUntimed`, `isRecurring`, `sameOccurrence`, `occurrenceKey` (the per-row key), `skippableOccurrence`, `canSkipOccurrence` |
| `sort.ts` | `sortForView` (the backend's day order), `compareSortOrder`, `completedLast` (display only), `sortForSearch` (upcoming first) |
| `projection.ts` | `buildBoard` (per-day cell items, by label when given labels), `dayViewGroups`, `hasLabelGroups`, `withoutMissedOccurrences`; types `TaskGroup`, `CellItem` |
| `day-order.ts` | `untimedReadingOrder`, `isUntimedOrder`, `appendedUntimedOrder`: the id lists a reorder sends |
| `drop.ts` | `dropKind`: none, reorder, move, or move one occurrence |
| `optimistic.ts` | Optimistic mirrors of server writes: `applyUntimedOrder`, `applyMove`, `applyLabelOrder`, `replaceOccurrence`, `withoutTasks`, `withoutOccurrence`, `restoreOccurrence` |

`lib/recurrence/` maps picker options ⇄ RRULE and typed phrases; the backend validates and expands:

| File | Exports |
| --- | --- |
| `model.ts` | `RecurrenceValue` and the picker types, weekday codes, defaults, updaters (`withFreq`, `withUnit`, `monthlyDefaultsFor`, `followStart`: a monthly rule follows a changed start date) |
| `options.ts` | Option lists and labels for the picker controls |
| `rrule-build.ts` | `buildRRule` |
| `rrule-parse.ts` | `parseRRule`, `isUnmodeledRule` (a shape the picker shows read-only) |
| `describe.ts` | `summarize`, `summarizeRule`, `monthlySkipNote` |
| `phrase-grammar.ts` | The typed-phrase vocabulary and `PHRASE_RULES` |
| `phrase-parse.ts` | `parseRecurrencePhrase(text, start)`: the RRULE and the text to strip |
| `first-occurrence.ts` | `firstOccurrenceOnOrAfter(rule, start)`: snaps a quick-add start to the rule's first date |

`lib/dnd/` holds gesture and drag helpers; `*.action.ts` files touch the DOM and have no unit test:

| File | Exports |
| --- | --- |
| `zone-options.ts` | `calendarZone` (options of every calendar zone), `isShadowItem` |
| `tap.ts` | `trustedClick`, `activateOnKey`, `createPressTracker`, `tappedItem`, `opensFromEmptySpace` |
| `cell-click.action.ts` | `clickOnEmptySpace`: a click on a `DayCell`'s empty space opens the day |
| `autofocus.action.ts` | `autofocus`: the control `showModal()` focuses first |
| `presses.action.ts` | `presses` (the app-wide press tracker), `trackPresses` (started in `main.ts`) |
| `drag-scroll.ts` | `edgeScrollStep`, `pointFrom`, `createBottomDwell` |
| `drag-scroll.action.ts` | `dragEdgeScroll`, `dragIsLive`, `trackPointer` |
| `swipe.ts`, `swipe.action.ts` | `swipeDirection`; `swipe`: touch-only period swipe, ignored while a drag is live |
| `fit.ts`, `line-fit.action.svelte.ts` | `visibleLineCount`; `createLineFit`: measures a cell list, `overflow`, `hides` |
| `panel-pos.ts` | `panelPosition`: `DayPanel` beside its cell and on screen |
| `cell-tone.ts` | `dayCellToneClass`: today, in-month and open cell looks |

Single files in `lib/`:

| File | Exports |
| --- | --- |
| `api.ts` | `api`: one typed function per endpoint, the only `fetch`; every failure throws an `ApiError` |
| `types.ts` | API shapes (`Task`, `Label`, `TaskInput`, `LabelInput`, `BatchOp`, `ImportSummary`, `RolloverSummary`), `ViewId`, `ThemePref` |
| `constants.ts` | Mirrored caps, `API_BASE`, `COMPACT_MAX_WIDTH`, calendar counts, gesture timings and sizes, storage keys, option lists (`VIEWS`, `THEME_OPTIONS`, `GROUP_VIEW_OPTIONS`), look-token classes (§4.7) |
| `messages.ts` | User-facing copy: load and save failures and `failureWithReason`, network and refresh messages, titles, button text, aria-label builders |
| `format.ts` | Copy that needs a count or a date (`pluralize`, `dayTaskCount`, `dayCellLabel`, `taskDateLabel`, `scheduledNotice`); imports `messages.ts`, never the reverse |
| `storage.ts` | `readStored`, `writeStored`: `localStorage` that never throws |
| `date.ts` | Local date math and formats: `toISODate`, `fromISODate`, `toLocalTime`, `currentDateKey`, grids, steps, English day and range labels |
| `quickadd.ts` | `parseQuickAdd(input, ref)`, `quickAddInput`, `describeDraft`; `#tag` menu helpers (`activeLabelToken`, `removeActiveToken`, `labelSuggestions`, `listboxStep`) |
| `labels.ts` | `nextPaletteColor`, `labelColorVar`, `labelTint`, `labelLookup`, `findLabelByName`, `mergeLabelOrder`, `moveId` |
| `composer.ts` | `ComposerDraft`, `emptyDraft`, `taskToDraft`, `draftToInput`, `dateForRule` (a first repeat on an undated draft starts today) |
| `errors.ts` | `ApiError` (`kind` network, server or rejected; a 4xx carries the API's `{"error"}` text as `reason`), `rejectionReason`; `errorMessage`: network → `NETWORK_ERROR_MESSAGE`, rejected with a reason → action message plus reason (`failureWithReason`), else the action message |
| `theme.ts` | `getThemePref`, `setThemePref` |
| `nav-transition.ts` | `navigateWithSlide(dir, apply)` |
| `palette.ts` | `LABEL_PALETTE`, `PaletteHex` |
| `day-change.svelte.ts` | `watchDayChange`, `createDayChange` |
| `viewport.svelte.ts` | `isCompact`, `isCoarsePointer` |
| `today.svelte.ts` | `todayKey`, `todayDate`, `setToday` |
| `refresh.svelte.ts` | `bumpRefresh`, `onRefresh` |
| `group-view.svelte.ts` | `groupByLabelView`, `setGroupByLabelView` |

`lib/test/` holds `factories.ts` (named dates, RRULE strings, `makeTask`, `makeLabel`, `dndDetail`), `rune-environment.ts` (the Vitest environment), `architecture.test.ts` (the guards) and `guards/repo.ts` (repo scan helpers).

### 4.6 Responsive and drag-and-drop contract

1. **One layout per view.** `isCompact()` (width ≤ `COMPACT_MAX_WIDTH`) picks exactly one layout in markup; never render both and hide one with CSS, which mounts duplicate drag zones.
2. **Flat zones.** `svelte-dnd-action` zones never nest; a nested inner zone stops dragging. `DayAgenda` label sections are sibling zones with distinct `type`s, reordered with up/down buttons.
3. **Owned drop lists.** A zone renders a `createDropList` list, changed only by `consider` / `finalize` and re-projected from source only while no gesture is live.
4. **One live zone per day.** Calendar zones share one `type` (`calendarZone`) and one board; while the phone agenda or `DayPanel` shows a day, that day's grid cell renders its items without a zone.
5. **Hide mid-drag with `hidden`.** A zone hidden during a drag gets `hidden`, which drops it from hit-testing; never unmount it (the origin zone must stay registered) and never `invisible` (it keeps its rects and captures the pointer).
6. **One child per item.** A zone renders every item; a cell's overflow lines stay as `invisible` children (`createLineFit`), the "+N" hint sits outside the zone, and the drag shadow stays visible.
7. **Only the landing zone commits** (`dropKind`): a same-day drop reorders, a cross-day drop reschedules, a recurring row's cross-day drop moves one occurrence.
8. **Grip on wide, hold on phone.** Every reorder list follows `ReorderList`: grip + `dragHandleZone` on wide, whole-row `dndzone` with `delayTouchStart` on phone; no grips at phone width.
9. **Taps on drag items.** Handlers act on trusted clicks only (`trustedClick`); a stationary press dropped in place opens the editor (`tappedItem` with `presses`).
   A hold-to-drag row edits through a `div role=button` (`activateOnKey`): the library never drags a native button. Space starts a keyboard drag, Enter opens (`main.ts`).
10. **The pointer picks the drop day**, not the dragged tile (`useCursorForDetection` in `calendarZone`).
11. **Scrollable drop surfaces** attach `dragEdgeScroll`: the phone Week stack, the `DaySheet` body, `ListViewShell` with `edgeScroll` (Inbox).
12. **Navigation keeps one grid.** Month and Week navigate through `createPeriodNav`; the swipe sits on `PeriodShell`'s section, never on the `vt-calendar` pane; Month keeps the open day (`monthRange`), Week clears it.

| View | Phone | Wide |
| --- | --- | --- |
| Month | `CalendarCellMobile` drop-only zones; the open day's `DayListSection` is its live zone and its cell is frozen; `grid-expand.svelte.ts` hides that agenda with `hidden` mid-drag | `DayCell` grip zones; the open day's `DayPanel` is its live zone and its cell is frozen; `DayPanel` is `hidden` while `board.dragging` |
| Week | `DayListSection` hold zones in one scrolling stack; `DaySheet` (full-screen modal) holds a `DayAgenda` while the stack behind it is inert | `DayCell` grip zones plus `DayPanel`, as in Month |
| Today | `DayAgenda` hold zones | `DayAgenda` grip zones |
| Inbox | One `ReorderList` hold zone; Batch edit renders static rows | One `ReorderList` grip zone with Edit and Delete |
| Labels overlay | One `ReorderList` hold zone | One `ReorderList` grip zone |

### 4.7 Design tokens

| What | Lives in |
| --- | --- |
| Chrome colours | RGB-triplet CSS variables in `app.css` (`:root`, re-pointed by the dark `@media` block and `:root[data-theme='dark']`), mapped in `frontend/tailwind.config.js` as `fog`, `surface`, `pine`, `pine-deep`, `moss`, `bark`, `cell`, `cell-out`, `ink`, `sage`, `lichen`, `scrim` |
| Background gradient | `body::before` in `app.css`, on `--mist` |
| Shadows | `shadow-soft`, `shadow-lift`, `shadow-overlay` in `frontend/tailwind.config.js`, on `--shadow` / `--shadow-deep` with dark values in `app.css`; no other shadow class |
| Font sizes and fonts | Tailwind's scale plus `text-wordmark`, `text-2xs`, `text-3xs`; `font-sans` (Inter), `font-display` (Hanken Grotesk), loaded in `main.ts` |
| z-index | `z-sticky`, `z-chrome`, `z-popover`, `z-floating` |
| Motion | Keyframes, `--duration-*` and `--ease-soft` in `app.css`, with a `prefers-reduced-motion` block; the period slide on `vt-calendar` |
| Label colours | `LABEL_PALETTE` (`palette.ts`), set as `--label` by `labelColorVar` (or `labelTint` for a tinted surface); `.label-tint` (rows, pills) and `.label-dot` (chips) in `app.css` |
| Look-token class strings | `constants.ts`: `BTN_SM_CLASS` / `BTN_MD_CLASS` (one control height, shared by fields), `INPUT_CLASS`, `COMPACT_INPUT_CLASS`, `TEXTAREA_CLASS`, `TITLE_INPUT_CLASS`, `EMOJI_INPUT_CLASS`, `PRIMARY_BTN_CLASS`, `SECONDARY_BTN_CLASS`, `DESTRUCTIVE_BTN_CLASS`, `GHOST_BTN_CLASS`, `CLEAR_BTN_CLASS`, `ICON_BTN_CLASS`, `CHIP_ON_CLASS`, `CHIP_OFF_CLASS`, `DISPLAY_TITLE_CLASS`, `EYEBROW_CLASS`, `TASK_CARD_CLASS`, `FIELD_LABEL_CLASS`, `MUTED_CENTER_CLASS`, `POPOVER_CLASS`, `TODAY_CELL_CLASS`, `OPEN_CELL_CLASS`, `DROP_TARGET_RING_CLASSES`, `MODAL_SIZES`, `MODAL_BODY_CLASS` (every dialog body's padding) |
| Browser chrome colour | The `theme-color` metas in `frontend/index.html`, equal to `--fog` per theme |
