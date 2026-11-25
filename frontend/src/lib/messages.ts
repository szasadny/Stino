export const NETWORK_ERROR_MESSAGE = 'Couldn’t reach Stinō — check your connection.'
export const REQUEST_FAILED_MESSAGE = 'Something went wrong. Please try again.'

// A landed write must never read as failed — a retry would duplicate the task.
export const REFRESH_FAILED_MESSAGE =
  'Saved, but refreshing the view failed — switch tabs to reload it.'

export const LOAD_FAILED = 'Could not load'
export const LOAD_CALENDAR_FAILED = 'Could not load the calendar'
export const LOAD_WEEK_FAILED = 'Could not load the week'
export const LOAD_TODAY_FAILED = 'Could not load today'
export const LOAD_INBOX_FAILED = 'Could not load your inbox'
export const LOAD_LABELS_FAILED = 'Could not load labels'

export const SAVE_TASK_FAILED = 'Could not save the task'
export const ADD_TASK_FAILED = 'Could not add the task'
export const UPDATE_TASK_FAILED = 'Could not update the task'
export const UPDATE_SELECTED_FAILED = 'Could not update the selected tasks'
export const DELETE_TASK_FAILED = 'Could not delete the task'
export const REOPEN_TASK_FAILED = 'Could not reopen the task'
export const MOVE_TASK_FAILED = 'Could not move the task'
export const DELETE_OCCURRENCE_FAILED = 'Could not delete the occurrence'
export const MOVE_OCCURRENCE_FAILED = 'Could not move the occurrence'
export const SAVE_ORDER_FAILED = 'Could not save the new order'
export const SAVE_LABEL_ORDER_FAILED = 'Could not save the label order'
export const CREATE_LABEL_FAILED = 'Could not create the label'
export const SAVE_LABEL_FAILED = 'Could not save label'
export const DELETE_LABEL_FAILED = 'Could not delete label'
export const SEARCH_FAILED = 'Could not run the search'
export const IMPORT_FAILED = 'Could not import the file'

export const DOES_NOT_REPEAT = 'Does not repeat'
export const LOADING = 'Loading…'
export const NOTHING_SCHEDULED = 'Nothing scheduled'
export const DRAG_TO_REORDER = 'Drag to reorder'
export const ADD_A_TASK = 'Add a task'
export const NEW_TASK_TITLE = 'New task'
export const EDIT_TASK_TITLE = 'Edit task'
export const SUBMIT_ADD = 'Add'
export const SUBMIT_SAVE = 'Save'

export function addTaskOnLabel(day: string): string {
  return `${ADD_A_TASK} on ${day}`
}

export function editTaskLabel(title: string): string {
  return `Edit “${title}”`
}

export function toggleTaskLabel(title: string, done: boolean): string {
  return `Mark "${title}" as ${done ? 'not done' : 'done'}`
}
