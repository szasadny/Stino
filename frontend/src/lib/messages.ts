export const NETWORK_ERROR_MESSAGE = 'Couldn’t reach Stinō. Check your connection.'

// A landed write must never read as failed, because a retry would duplicate the task.
export const REFRESH_FAILED_MESSAGE =
  'Saved, but refreshing the view failed. Switch tabs to reload it.'

export const LOAD_FAILED = 'Couldn’t load your tasks.'
export const LOAD_CALENDAR_FAILED = 'Couldn’t load the calendar.'
export const LOAD_WEEK_FAILED = 'Couldn’t load the week.'
export const LOAD_TODAY_FAILED = 'Couldn’t load today.'
export const LOAD_INBOX_FAILED = 'Couldn’t load your inbox.'
export const LOAD_LABELS_FAILED = 'Couldn’t load the labels.'

export const SAVE_TASK_FAILED = 'Couldn’t save the task.'
export const ADD_TASK_FAILED = 'Couldn’t add the task.'
export const UPDATE_TASK_FAILED = 'Couldn’t update the task.'
export const UPDATE_SELECTED_FAILED = 'Couldn’t update the selected tasks.'
export const DELETE_TASK_FAILED = 'Couldn’t delete the task.'
export const REOPEN_TASK_FAILED = 'Couldn’t reopen the task.'
export const MOVE_TASK_FAILED = 'Couldn’t move the task.'
export const DELETE_OCCURRENCE_FAILED = 'Couldn’t delete the occurrence.'
export const MOVE_OCCURRENCE_FAILED = 'Couldn’t move the occurrence.'
export const SAVE_ORDER_FAILED = 'Couldn’t save the new order.'
export const SAVE_LABEL_ORDER_FAILED = 'Couldn’t save the label order.'
export const CREATE_LABEL_FAILED = 'Couldn’t create the label.'
export const SAVE_LABEL_FAILED = 'Couldn’t save the label.'
export const DELETE_LABEL_FAILED = 'Couldn’t delete the label.'
export const SEARCH_FAILED = 'Couldn’t run the search.'
export const IMPORT_FAILED = 'Couldn’t import the file.'

export const DOES_NOT_REPEAT = 'Does not repeat'
export const LOADING = 'Loading…'
export const NOTHING_SCHEDULED = 'Nothing scheduled'
export const NOTHING_DUE_TODAY = 'Nothing due today.'
export const DROP_OR_ADD_HINT = 'Drag a task here or add one below.'
export const DRAG_TO_REORDER = 'Drag to reorder'
export const ADD_A_TASK = 'Add a task'
export const NEW_TASK_TITLE = 'New task'
export const EDIT_TASK_TITLE = 'Edit task'
export const SUBMIT_ADD = 'Add'
export const SUBMIT_SAVE = 'Save'
export const CANCEL = 'Cancel'
export const DELETE = 'Delete'
export const CLEAR = 'Clear'
export const CLOSE = 'Close'
export const DONE = 'Done'
export const EDIT = 'Edit'
export const UNDO = 'Undo'
export const DELETE_TASK_TITLE = 'Delete task?'
export const DELETE_RECURRING_TITLE = 'Delete recurring task?'
export const CANNOT_UNDO = 'This can’t be undone.'
export const LABEL_DELETE_KEEPS_TASKS = 'Its tasks stay, without a label.'
export const SCHEDULED_TODAY = 'Scheduled for today'
export const SCHEDULED_TOMORROW = 'Scheduled for tomorrow'

export const SEARCH = 'Search'
export const LABELS = 'Labels'
export const SETTINGS = 'Settings'
export const INBOX = 'Inbox'
export const TODAY = 'Today'
export const WEEK = 'Week'
export const MONTH = 'Month'
export const TOMORROW = 'Tomorrow'
export const NEXT_WEEK = 'Next week'
export const SAME_DAY_NEXT_WEEK = 'Same day next week'
export const SORT_TASKS = 'Sort tasks'
export const TASK_ORDER = 'Task order'
export const NO_LABEL = 'No label'

export const INBOX_SUBTITLE = 'Capture now, schedule later.'
export const INBOX_EMPTY = 'Your inbox is clear.'
export const BATCH_EDIT = 'Batch edit'
export const CAPTURE_INPUT_LABEL = 'New task title'
export const CAPTURE_PLACEHOLDER = 'call mum tomorrow 6pm #social'
export const CAPTURE_PLACEHOLDER_SHORT = 'gym tomorrow 9am'
export const ADD_WITH_DETAILS = 'Add with full details'
export const DETAILS = 'Details'
export const REMOVE_LABEL = 'Remove label'
export const NEW_LABEL_TAG = 'new label'
export const CREATE = 'Create'
export const SELECT_ALL = 'Select all'
export const CLEAR_ALL = 'Clear all'
export const SET_LABEL = 'Set label'
export const CHOOSE_LABEL = 'Choose a label'
export const SCHEDULE = 'Schedule'
export const APPLY = 'Apply'
export const COMPLETE = 'Complete'

export const TASK_NAME = 'Task name'
export const NOTES = 'Notes'
export const LABEL = 'Label'
export const DUE_DATE = 'Due date'
export const DUE_TIME = 'Due time'
export const PICK_A_DATE_FIRST = 'Pick a date first'
export const NO_DATE_STAYS_IN_INBOX = 'No date, so it stays in the Inbox.'
export const SERIES_EDIT_NOTE = 'Changes apply to the whole series.'
export const REPEAT = 'Repeat'
export const CUSTOM_SCHEDULE = 'Repeats on a custom schedule'
export const NEEDS_A_DATE = 'needs a date'
export const EVERY = 'Every'
export const REPEAT_INTERVAL = 'Repeat interval'
export const REPEAT_ON_THE = 'Repeat on the'
export const DAY_OF_MONTH = 'Day of the month'
export const LAST_DAY = 'Last day'
export const WHICH_WEEK = 'Which week'
export const WEEKDAY = 'Weekday'
export const ON_DAYS = 'On days'
export const WEEKDAYS_PRESET = 'Weekdays'
export const DAILY = 'Daily'
export const WEEKLY = 'Weekly'
export const MONTHLY = 'Monthly'
export const YEARLY = 'Yearly'
export const CUSTOM = 'Custom'
export const UNIT_DAYS = 'days'
export const UNIT_WEEKS = 'weeks'
export const UNIT_MONTHS = 'months'
export const ON_A_DATE = 'On a date'
export const ON_A_WEEKDAY = 'On a weekday'
export const WORKDAY = 'Workday'
export const ORDINAL_FIRST = 'First'
export const ORDINAL_SECOND = 'Second'
export const ORDINAL_THIRD = 'Third'
export const ORDINAL_FOURTH = 'Fourth'
export const ORDINAL_FIFTH = 'Fifth'
export const ORDINAL_LAST = 'Last'
export const ENDS = 'Ends'
export const REPEAT_END_DATE = 'Repeat end date'
export const NEVER = 'never'
export const TASK_REPEATS = 'This task repeats.'
export const THIS_OCCURRENCE = 'This occurrence'
export const SERIES_KEEPS_REPEATING = 'The series keeps repeating.'
export const COMPLETED_OCCURRENCE_KEPT = 'Completed, so it’s kept in your history.'
export const WHOLE_SERIES = 'Whole series'
export const EVERY_OCCURRENCE = 'Every past and future occurrence.'

export const SEARCH_TASKS = 'Search tasks'
export const SEARCH_PLACEHOLDER = `${SEARCH_TASKS}…`
export const CLOSE_SEARCH = 'Close search'
export const BACK_TO_RESULTS = 'Back to results'
export const SEARCH_PROMPT = 'Start typing to search across all your tasks.'
export const SEARCHING = 'Searching…'

export const LABELS_SUBTITLE = 'Colored labels you can assign to tasks.'
export const NO_LABELS_YET = 'No labels yet. Create your first above.'
export const NEW_LABEL = 'New label'
export const LABEL_NAME = 'Label name'
export const LABEL_NAME_PLACEHOLDER = 'e.g. Home'
export const LABEL_COLOR = 'Label color'
export const EMOJI = 'Emoji'
export const OPTIONAL = '(optional)'
export const LABEL_EMOJI = 'Label emoji'
export const EMOJI_SUGGESTIONS = 'Emoji suggestions'

export const SETTINGS_SUBTITLE = 'Appearance, tasks, and data.'
export const APPEARANCE = 'Appearance'
export const THEME_SYSTEM = 'System'
export const THEME_LIGHT = 'Light'
export const THEME_DARK = 'Dark'
export const APPEARANCE_HINT = `Follows your system unless you pick ${THEME_LIGHT} or ${THEME_DARK}.`
export const THEME = 'Theme'
export const TASKS = 'Tasks'
export const ORDER_LIST = 'List'
export const ORDER_BY_LABEL = 'By label'
export const TASK_ORDER_HINT = `${ORDER_LIST} keeps your own order; ${ORDER_BY_LABEL} groups each day’s tasks by label.`
export const DATA = 'Data'
export const DATA_HINT = 'Bring tasks in from another app.'

export const IMPORT = 'Import'
export const IMPORTING = 'Importing…'
export const IMPORT_TITLE = 'Import from TickTick'
export const IMPORT_OPEN = `${IMPORT_TITLE}…`
export const IMPORT_SUBTITLE =
  'Adds tasks from a TickTick CSV backup. Nothing is changed or deleted.'
export const IMPORT_INSTRUCTIONS =
  'Export your data from TickTick as a CSV backup, then choose the file here.'
export const IMPORT_FILE_LABEL = 'TickTick CSV file'
export const IMPORT_REPEAT_NOTE = 'Importing the same file again adds its tasks again.'
export const IMPORT_DONE_NOTE = 'Your calendar and lists are updated.'
export const IMPORT_ANOTHER = 'Import another'

export function addTaskOnLabel(day: string): string {
  return `${ADD_A_TASK} on ${day}`
}

export function editTaskLabel(title: string): string {
  return `Edit “${title}”`
}

export function toggleTaskLabel(title: string, done: boolean): string {
  return `Mark “${title}” as ${done ? 'not done' : 'done'}`
}

export function openTaskPillLabel(title: string, time: string | null, draggable: boolean): string {
  const at = time ? `, ${time}` : ''
  return `${title}${at}${draggable ? ', drag to move to another day' : ''}`
}

export function moreTasks(count: number): string {
  return `${count} more`
}

export function selectedCount(count: number): string {
  return `${count} selected`
}

export function deleteCount(count: number): string {
  return `${DELETE} ${count}`
}

export function periodStepLabel(unit: string, step: -1 | 1): string {
  return `${step < 0 ? 'Previous' : 'Next'} ${unit}`
}

export function openDayLabel(day: string): string {
  return `Open ${day}`
}

export function hideDayLabel(day: string): string {
  return `Hide ${day}`
}

export function tasksOnDayLabel(day: string): string {
  return `Tasks on ${day}`
}

export function moveSectionLabel(name: string, dir: 'up' | 'down'): string {
  return `Move ${name} ${dir}`
}

export function completedToast(title: string): string {
  return `Completed “${title}”`
}

export function scheduledFor(day: string): string {
  return `Scheduled for ${day}`
}

export function schedulingFor(when: string): string {
  return `Scheduling for ${when}`
}

export function noSearchMatch(term: string): string {
  return `No tasks match “${term}”.`
}

export function deleteLabelTitle(name: string): string {
  return `${DELETE} “${name}”?`
}

// The backend's reason is lower-case prose, so it reads as the second half of the sentence.
export function failureWithReason(actionMessage: string, reason: string): string {
  const end = /[.!?…]$/.test(reason) ? '' : '.'
  return `${actionMessage.replace(/\.$/, '')}: ${reason}${end}`
}
