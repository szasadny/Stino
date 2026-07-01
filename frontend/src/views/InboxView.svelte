<script lang="ts">
  // Inbox: captured-but-unscheduled tasks (due_date IS NULL). Capture fast with a title
  // (quick-add, with natural-language dates and `#tag` labels) or open "Details" for the
  // full editor; complete, edit, or schedule a task by giving it a date — scheduling moves
  // it out of the Inbox onto the calendar, like TickTick. Task orchestration (load, toggle,
  // reorder, remove, the in-flight lock) lives in the shared TaskCore; the Inbox-specific
  // quick-capture, `#tag` label menu, and bulk multi-select stay here.
  import { onMount, tick, untrack } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action'
  import type { DndEvent } from 'svelte-dnd-action'
  import { api, type TaskInput } from '../lib/api'
  import type { BatchOp, Label, Task } from '../lib/types'
  import {
    activeLabelToken,
    describeDraft,
    parseQuickAdd,
    removeActiveToken,
  } from '../lib/quickadd'
  import { type ComposerDraft, taskToDraft } from '../lib/composer'
  import {
    LABEL_NAME_MAX_LENGTH,
    LABEL_PALETTE,
    PRIMARY_BTN_CLASS,
    TITLE_MAX_LENGTH,
  } from '../lib/constants'
  import { errorMessage } from '../lib/errors'
  import { labelLookup } from '../lib/labels'
  import { createTaskCore } from '../lib/controllers/task-core.svelte'
  import TaskRow from '../lib/components/TaskRow.svelte'
  import LabelChip from '../lib/components/LabelChip.svelte'
  import LabelSelect from '../lib/components/LabelSelect.svelte'
  import TaskComposerDialog from '../lib/components/TaskComposerDialog.svelte'
  import EmptyState from '../lib/components/EmptyState.svelte'

  // FLIP animation duration for the drag-reorder list (kept in sync with the dndzone
  // option below so the placeholder and the moving rows settle together).
  const FLIP_MS = 150

  const core = createTaskCore()

  // Quick capture. A natural-language date in the title ("call mum tomorrow 9am") is parsed
  // client-side; `capturePreview` shows what it resolved to. A `#tag` attaches a label (see
  // below). "Details" opens the full editor seeded from whatever's typed.
  let newTitle = $state('')
  const draft = $derived(parseQuickAdd(newTitle))
  const capturePreview = $derived(describeDraft(draft))

  // Inline label capture (TickTick-style `#tag`). A label can be set two ways: picked from
  // the suggestion menu — tracked here as `captureLabelId`, shown as a chip — or just typed
  // as a `#tag` and resolved on submit (`draft.label`). The chip wins; typing a fresh `#`
  // clears it so text drives again. `caret` tracks the cursor so the menu knows which tag is
  // being typed; `menuDismissed` hides it after Escape / an outside click until the next key.
  let captureLabelId = $state<number | null>(null)
  let inputEl = $state<HTMLInputElement | null>(null)
  let captureContainer = $state<HTMLDivElement | null>(null)
  let caret = $state(0)
  let menuDismissed = $state(false)
  let highlight = $state(0)

  // The tag the cursor is currently inside, or null. Drives the suggestion menu.
  const activeTag = $derived(activeLabelToken(newTitle, caret))

  // Case-insensitive lookup of an existing label by name.
  function existingLabel(name: string): Label | undefined {
    const wanted = name.trim().toLowerCase()
    return core.labels.find((l) => l.name.toLowerCase() === wanted)
  }

  // The label the capture will apply: the chip if one is chosen, else the typed `#tag`
  // resolved to an existing label, or a "pending" new one to be created.
  const captureLabel = $derived.by((): { label: Label } | { pending: string } | null => {
    if (captureLabelId != null) {
      const chip = core.labels.find((l) => l.id === captureLabelId)
      return chip ? { label: chip } : null
    }
    if (!draft.label) return null
    const found = existingLabel(draft.label)
    return found ? { label: found } : { pending: draft.label }
  })

  // Menu items for the active tag: existing labels matching the partial, plus a "Create" row
  // when the partial names a label that doesn't exist yet.
  const suggestions = $derived.by(() => {
    if (!activeTag || menuDismissed) return []
    const query = activeTag.query.trim().toLowerCase()
    const matches = core.labels.filter((l) => l.name.toLowerCase().includes(query))
    const items: ({ type: 'label'; label: Label } | { type: 'create'; name: string })[] =
      matches.map((label) => ({ type: 'label', label }))
    if (query && !core.labels.some((l) => l.name.toLowerCase() === query)) {
      items.push({ type: 'create', name: activeTag.query.trim() })
    }
    return items
  })

  const menuOpen = $derived(suggestions.length > 0)

  // Dismiss the suggestion menu when a click lands outside the capture field (Escape is
  // handled on the input itself). Mirrors LabelSelect's pattern.
  function onWindowClick(event: MouseEvent) {
    if (menuOpen && captureContainer && !captureContainer.contains(event.target as Node)) {
      menuDismissed = true
    }
  }

  // The full editor (TaskComposerDialog): 'create' adds a task, a number edits the task with
  // that id. `composerInitial` seeds the form.
  let composerMode = $state<'create' | number>('create')
  let composerInitial = $state<Partial<ComposerDraft>>({})
  let composerOpen = $state(false)

  // Two-step delete confirm (inline row).
  let confirmingId = $state<number | null>(null)

  // Multi-select / bulk-edit mode. While `selecting`, rows become checkboxes and a sticky bar
  // applies one action (label, schedule, complete, delete) to every selected task at once.
  // `bulkDate` backs the schedule input; the delete action gets its own two-step confirm.
  let selecting = $state(false)
  const selectedIds = new SvelteSet<number>()
  let bulkDate = $state('')
  let confirmingBulkDelete = $state(false)

  const allSelected = $derived(core.tasks.length > 0 && selectedIds.size === core.tasks.length)

  const labelFor = $derived(labelLookup(core.labels))

  onMount(load)

  function load() {
    return core.loadWith(async () => {
      const [tasks, labels] = await Promise.all([api.tasks.inbox(), api.labels.list()])
      return { tasks, labels }
    }, 'Could not load your inbox')
  }

  // Keep `caret` in step with the cursor so the suggestion menu tracks the tag being typed;
  // any keystroke also un-dismisses a menu closed with Escape.
  function syncCaret() {
    caret = inputEl?.selectionStart ?? newTitle.length
  }

  function onCaptureInput() {
    syncCaret()
    menuDismissed = false
    highlight = 0
    // Typing a fresh `#tag` re-drives the label from text, so drop a chosen chip.
    if (activeLabelToken(newTitle, caret)) captureLabelId = null
  }

  // Find (or create) a label by name, reusing the palette-by-position convention the importer
  // uses so on-the-fly colors stay stable. Returns null on failure.
  async function resolveLabel(name: string): Promise<Label | null> {
    const clean = name.trim().slice(0, LABEL_NAME_MAX_LENGTH)
    const found = existingLabel(clean)
    if (found) return found
    try {
      const color = LABEL_PALETTE[core.labels.length % LABEL_PALETTE.length].hex
      const created = await api.labels.create({ name: clean, color, emoji: null })
      core.labels = [...core.labels, created]
      return created
    } catch (err) {
      core.error = errorMessage(err, 'Could not create the label')
      return null
    }
  }

  // Choose a menu item: an existing label, or create a new one. Either way set the chip, cut
  // the half-typed `#tag` out of the title, and restore the cursor.
  async function chooseSuggestion(item: (typeof suggestions)[number]) {
    const label = item.type === 'label' ? item.label : await resolveLabel(item.name)
    if (!label) return
    captureLabelId = label.id
    const next = removeActiveToken(newTitle, caret)
    newTitle = next.text
    await tick()
    inputEl?.focus()
    inputEl?.setSelectionRange(next.caret, next.caret)
    caret = next.caret
    menuDismissed = false
    highlight = 0
  }

  function clearCaptureLabel() {
    captureLabelId = null
  }

  // Keyboard within the capture input: drive the suggestion menu when it's open (so Enter
  // picks a tag instead of submitting the form).
  function onCaptureKeydown(event: KeyboardEvent) {
    if (!menuOpen) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      highlight = (highlight + 1) % suggestions.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      highlight = (highlight - 1 + suggestions.length) % suggestions.length
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void chooseSuggestion(suggestions[highlight])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      menuDismissed = true
    }
  }

  // Resolve the capture's label to an id: the chosen chip, else a typed `#tag` (created on the
  // fly). Returns undefined only when label creation failed.
  async function resolveCaptureLabelId(): Promise<number | null | undefined> {
    if (captureLabelId != null) return captureLabelId
    if (!draft.label) return null
    const label = await resolveLabel(draft.label)
    return label ? label.id : undefined
  }

  // Quick capture: parse the line, attach its label, and create straight away. A parsed date
  // schedules it onto its day, so it leaves the Inbox.
  async function addTask(event: SubmitEvent) {
    event.preventDefault()
    if (!draft.title) return
    await core.run(async () => {
      const labelId = await resolveCaptureLabelId()
      if (labelId === undefined) return // label creation failed; error already shown
      const created = await api.tasks.create({
        title: draft.title,
        label_id: labelId,
        due_date: draft.due_date,
        due_time: draft.due_time,
        recurrence_rule: draft.recurrence_rule,
      })
      if (!created.due_date) core.tasks = [...core.tasks, created]
      newTitle = ''
      captureLabelId = null
    }, 'Could not add the task')
  }

  // Open the full editor to add a task, seeded from whatever's in the quick bar (so "call mum
  // tomorrow #work" carries its parsed title/date/time/label into the form). A typed-but-not-
  // yet-created `#tag` only seeds when it already names a label — the editor creates labels
  // itself, so nothing leaks on cancel.
  function openDetails() {
    const labelId =
      captureLabelId ?? (draft.label ? (existingLabel(draft.label)?.id ?? null) : null)
    composerInitial = {
      title: draft.title,
      labelId,
      date: draft.due_date ?? '',
      time: draft.due_time ?? '',
      rule: draft.recurrence_rule,
    }
    composerMode = 'create'
    composerOpen = true
  }

  // Open the full editor for an existing Inbox task.
  function startEdit(task: Task) {
    composerInitial = taskToDraft(task)
    composerMode = task.id
    composerOpen = true
    confirmingId = null
    core.error = null
  }

  // Submit from the editor — create or update depending on the mode. Scheduling a task (giving
  // it a date) moves it out of the Inbox, so it drops from this list.
  async function onComposerSubmit(input: TaskInput) {
    if (!input.title) return
    await core.run(async () => {
      if (composerMode === 'create') {
        const created = await api.tasks.create(input)
        if (!created.due_date) core.tasks = [...core.tasks, created]
        newTitle = ''
        captureLabelId = null
      } else {
        const id = composerMode
        const updated = await api.tasks.update(id, input)
        if (updated.due_date) core.tasks = core.tasks.filter((t) => t.id !== id)
        else core.tasks = core.tasks.map((t) => (t.id === id ? updated : t))
      }
      composerOpen = false
    }, 'Could not save the task')
  }

  async function removeTask(id: number) {
    if (await core.remove(id)) {
      confirmingId = null
      composerOpen = false
    }
  }

  // Delete the task open in the editor (the guard narrows `composerMode` to its id).
  function deleteEditing() {
    if (composerMode !== 'create') removeTask(composerMode)
  }

  // Drag-to-reorder (svelte-dnd-action) — the flat single-zone pattern. The drop list is a
  // locally-owned `$state` mutated solely by `consider`/`finalize`; it re-projects from the
  // source `core.tasks` ONLY while no gesture is live (the `dragging` flag, read untracked so
  // the projection doesn't fight the live drag). Persisting goes through `core.reorder`, which
  // holds the in-flight lock and reverts `core.tasks` on failure — never a bespoke API call.
  let dragging = $state(false)
  let dragOrder = $state<Task[]>([])
  $effect(() => {
    const src = core.tasks
    if (untrack(() => dragging)) return
    dragOrder = src
  })

  function reorderConsider(event: CustomEvent<DndEvent<Task>>) {
    dragging = true
    dragOrder = event.detail.items
  }

  function reorderFinalize(event: CustomEvent<DndEvent<Task>>) {
    dragOrder = event.detail.items
    dragging = false // clear before persisting so the revert/resync can re-project
    void core.reorder(dragOrder.map((t) => t.id))
  }

  // --- Multi-select / bulk edit ---

  function enterSelect() {
    selecting = true
    composerOpen = false
    confirmingId = null
    core.error = null
  }

  function exitSelect() {
    selecting = false
    selectedIds.clear()
    confirmingBulkDelete = false
    bulkDate = ''
  }

  function toggleSelect(id: number) {
    if (selectedIds.has(id)) selectedIds.delete(id)
    else selectedIds.add(id)
  }

  function toggleSelectAll() {
    if (allSelected) selectedIds.clear()
    else for (const t of core.tasks) selectedIds.add(t.id)
  }

  // Apply one bulk op to the selected tasks, then update the list locally (`apply`) and leave
  // select mode. Local updates avoid a reload flash: a label change keeps the rows,
  // scheduling/deleting removes them, completing marks them.
  async function runBatch(op: BatchOp, apply: (ids: Set<number>) => void) {
    if (selectedIds.size === 0) return
    const ids = [...selectedIds]
    await core.run(async () => {
      await api.tasks.batch(ids, op)
      apply(new Set(ids))
      exitSelect()
    }, 'Could not update the selected tasks')
  }

  function bulkSetLabel(labelId: number | null) {
    void runBatch({ type: 'label', label_id: labelId }, (ids) => {
      core.tasks = core.tasks.map((t) => (ids.has(t.id) ? { ...t, label_id: labelId } : t))
    })
  }

  function bulkSchedule() {
    if (!bulkDate) return
    void runBatch({ type: 'schedule', due_date: bulkDate }, (ids) => {
      // A date moves each task onto the calendar, so it leaves the Inbox.
      core.tasks = core.tasks.filter((t) => !ids.has(t.id))
    })
  }

  function bulkComplete() {
    void runBatch({ type: 'complete' }, (ids) => {
      core.tasks = core.tasks.map((t) => (ids.has(t.id) ? { ...t, completed: true } : t))
    })
  }

  function bulkDelete() {
    void runBatch({ type: 'delete' }, (ids) => {
      core.tasks = core.tasks.filter((t) => !ids.has(t.id))
    })
  }
</script>

<svelte:window onclick={onWindowClick} />

<section class="mx-auto flex h-full w-full max-w-2xl flex-col px-4">
  <header class="shrink-0 pt-6 sm:pt-8">
    <h1 class="font-display text-2xl font-semibold tracking-tight text-pine-deep">Inbox</h1>
    <p class="mt-1 text-sm text-sage">Capture now, schedule later.</p>
  </header>

  {#if core.error}
    <p
      role="alert"
      class="mt-4 rounded-lg border border-bark/30 bg-bark/10 px-3 py-2 text-sm text-bark"
    >
      {core.error}
    </p>
  {/if}

  <!-- Capture a new task -->
  <form
    class="mt-5 shrink-0 rounded-xl border border-lichen bg-surface p-3 shadow-soft"
    onsubmit={addTask}
  >
    <div class="flex items-center gap-2">
      <!-- Relative wrapper anchors the #tag suggestion menu under the input. -->
      <div class="relative min-w-0 flex-1" bind:this={captureContainer}>
        <input
          bind:this={inputEl}
          bind:value={newTitle}
          oninput={onCaptureInput}
          onkeydown={onCaptureKeydown}
          onkeyup={syncCaret}
          onclick={syncCaret}
          type="text"
          placeholder="Add a task — “call mum tomorrow 9am #work”"
          maxlength={TITLE_MAX_LENGTH}
          autocomplete="off"
          aria-label="New task title"
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls="capture-label-menu"
          aria-autocomplete="list"
          class="w-full rounded-lg border border-lichen bg-fog px-3 py-2 text-sm text-ink outline-none transition placeholder:text-sage focus:border-pine focus:bg-surface"
        />
        {#if menuOpen}
          <ul
            id="capture-label-menu"
            role="listbox"
            class="absolute z-20 mt-1 max-h-56 w-full min-w-[12rem] overflow-y-auto rounded-lg border border-lichen bg-surface p-1 shadow-md"
          >
            {#each suggestions as item, i (item.type === 'label' ? item.label.id : '+new')}
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  onpointerdown={(e) => e.preventDefault()}
                  onclick={() => chooseSuggestion(item)}
                  onmouseenter={() => (highlight = i)}
                  class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition hover:bg-pine/5 {i ===
                  highlight
                    ? 'bg-pine/5'
                    : ''}"
                >
                  {#if item.type === 'label'}
                    <span
                      class="h-2.5 w-2.5 shrink-0 rounded-full"
                      style="background-color: {item.label.color}"
                    ></span>
                    {#if item.label.emoji}
                      <span class="shrink-0 text-base leading-none" aria-hidden="true"
                        >{item.label.emoji}</span
                      >
                    {/if}
                    <span class="truncate text-sm text-ink">{item.label.name}</span>
                  {:else}
                    <span class="grid h-2.5 w-2.5 shrink-0 place-items-center text-pine">＋</span>
                    <span class="truncate text-sm text-pine-deep"
                      >Create “<span class="font-medium">{item.name}</span>”</span
                    >
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <button
        type="button"
        onclick={openDetails}
        disabled={core.pending}
        title="Add with full details"
        class="flex shrink-0 items-center gap-1.5 rounded-lg border border-lichen px-3 py-2 text-sm font-medium text-sage transition hover:border-pine/40 hover:text-pine-deep disabled:opacity-40"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <span class="hidden sm:inline">Details</span>
      </button>
      <button
        type="submit"
        disabled={!newTitle.trim() || core.pending}
        class="{PRIMARY_BTN_CLASS} shrink-0 px-4 py-2"
      >
        Add
      </button>
    </div>
    {#if captureLabel || capturePreview}
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-sage">
        {#if captureLabel}
          {#if 'label' in captureLabel}
            <span class="inline-flex items-center gap-1.5">
              <LabelChip
                name={captureLabel.label.name}
                color={captureLabel.label.color}
                emoji={captureLabel.label.emoji}
              />
              {#if captureLabelId != null}
                <button
                  type="button"
                  onclick={clearCaptureLabel}
                  aria-label="Remove label"
                  class="grid h-4 w-4 place-items-center rounded-full text-sage transition hover:bg-bark/10 hover:text-bark"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    class="h-3 w-3"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              {/if}
            </span>
          {:else}
            <span
              class="inline-flex items-center gap-1.5 rounded-full border border-dashed border-pine/40 px-2.5 py-0.5 text-pine-deep"
            >
              <span aria-hidden="true">＋</span>
              <span class="truncate font-medium">{captureLabel.pending}</span>
              <span class="text-sage">new label</span>
            </span>
          {/if}
        {/if}
        {#if capturePreview}
          <span class="inline-flex items-center gap-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-3.5 w-3.5 text-pine"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
            Scheduling for {capturePreview}
          </span>
        {/if}
      </div>
    {/if}
  </form>

  <!-- Inbox list -->
  <div class="mt-5 min-h-0 flex-1 overflow-y-auto pb-6">
    {#if core.loading}
      <p class="py-8 text-center text-sm text-sage">Loading…</p>
    {:else if core.tasks.length === 0}
      <EmptyState message="Your inbox is clear." />
    {:else if selecting}
      <!-- Sticky bulk-action bar: count + select-all on top, the actions below. Sticks to the
           top of the scrolling list region (top-0, not the header). -->
      <div
        class="sticky top-0 z-10 rounded-xl border border-lichen bg-fog/95 p-3 shadow-sm backdrop-blur"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-medium text-ink">
            {selectedIds.size} selected
          </span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              onclick={toggleSelectAll}
              class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
            <button
              type="button"
              onclick={exitSelect}
              class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sage transition hover:text-pine-deep"
            >
              Done
            </button>
          </div>
        </div>

        {#if selectedIds.size > 0}
          <div class="mt-3 flex flex-wrap items-end gap-3 border-t border-lichen pt-3">
            {#if core.labels.length > 0}
              <div class="min-w-[10rem]">
                <span class="mb-1 block text-xs font-medium text-sage">Set label</span>
                <LabelSelect labels={core.labels} value={null} onChange={bulkSetLabel} />
              </div>
            {/if}
            <div>
              <label for="bulk-date" class="mb-1 block text-xs font-medium text-sage"
                >Schedule</label
              >
              <input
                id="bulk-date"
                bind:value={bulkDate}
                onchange={bulkSchedule}
                type="date"
                disabled={core.pending}
                class="rounded-lg border border-lichen bg-fog px-2.5 py-1.5 text-sm text-ink outline-none transition hover:border-sage focus:border-pine focus:bg-surface disabled:opacity-40"
              />
            </div>
            <div class="ml-auto flex items-end gap-1.5">
              <button
                type="button"
                onclick={bulkComplete}
                disabled={core.pending}
                class="rounded-lg border border-lichen px-3 py-1.5 text-sm font-medium text-pine transition hover:bg-pine/5 disabled:opacity-40"
              >
                Complete
              </button>
              {#if confirmingBulkDelete}
                <button
                  type="button"
                  onclick={bulkDelete}
                  disabled={core.pending}
                  class="rounded-lg bg-bark/10 px-3 py-1.5 text-sm font-medium text-bark transition hover:bg-bark/20 disabled:opacity-40"
                >
                  Delete {selectedIds.size}?
                </button>
                <button
                  type="button"
                  onclick={() => (confirmingBulkDelete = false)}
                  class="rounded-lg px-2 py-1.5 text-sm font-medium text-sage transition hover:text-pine-deep"
                >
                  No
                </button>
              {:else}
                <button
                  type="button"
                  onclick={() => (confirmingBulkDelete = true)}
                  class="rounded-lg px-3 py-1.5 text-sm font-medium text-bark transition hover:bg-bark/10"
                >
                  Delete
                </button>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Selectable list: tap a row to toggle it; no drag / inline edit here. -->
      <ul class="mt-3 flex flex-col gap-2">
        {#each core.tasks as task (task.id)}
          <li>
            <TaskRow
              {task}
              label={labelFor(task)}
              selectable
              selected={selectedIds.has(task.id)}
              onSelect={() => toggleSelect(task.id)}
            />
          </li>
        {/each}
      </ul>
    {:else}
      <div class="mb-3 flex justify-end">
        <button
          type="button"
          onclick={enterSelect}
          class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep"
        >
          Batch edit
        </button>
      </div>
      <ul
        class="flex flex-col gap-2"
        use:dragHandleZone={{
          items: dragOrder,
          flipDurationMs: FLIP_MS,
          dragDisabled: core.pending,
          dropTargetStyle: {},
        }}
        onconsider={reorderConsider}
        onfinalize={reorderFinalize}
      >
        {#each dragOrder as task (task.id)}
          <li>
            <TaskRow {task} label={labelFor(task)} onToggle={() => core.toggle(task)}>
              {#snippet leading()}
                <div
                  use:dragHandle
                  title="Drag to reorder"
                  class="grid h-6 w-5 cursor-grab touch-none place-items-center rounded text-sage transition hover:text-pine-deep active:cursor-grabbing"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.4" />
                    <circle cx="9" cy="12" r="1.4" />
                    <circle cx="9" cy="18" r="1.4" />
                    <circle cx="15" cy="6" r="1.4" />
                    <circle cx="15" cy="12" r="1.4" />
                    <circle cx="15" cy="18" r="1.4" />
                  </svg>
                </div>
              {/snippet}
              {#snippet trailing()}
                {#if confirmingId === task.id}
                  <span class="text-xs text-sage">Delete?</span>
                  <button
                    type="button"
                    onclick={() => removeTask(task.id)}
                    disabled={core.pending}
                    class="rounded-lg px-2 py-1 text-xs font-medium text-bark transition hover:bg-bark/10 disabled:opacity-40"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onclick={() => (confirmingId = null)}
                    class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:text-pine-deep"
                  >
                    No
                  </button>
                {:else}
                  <button
                    type="button"
                    onclick={() => startEdit(task)}
                    class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onclick={() => {
                      confirmingId = task.id
                      core.error = null
                    }}
                    class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:bg-bark/10 hover:text-bark"
                  >
                    Delete
                  </button>
                {/if}
              {/snippet}
            </TaskRow>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <TaskComposerDialog
    open={composerOpen}
    title={composerMode === 'create' ? 'New task' : 'Edit task'}
    submitLabel={composerMode === 'create' ? 'Add' : 'Save'}
    labels={core.labels}
    initial={composerInitial}
    busy={core.pending}
    onSubmit={onComposerSubmit}
    onDelete={composerMode === 'create' ? undefined : deleteEditing}
    onClose={() => (composerOpen = false)}
  />
</section>
