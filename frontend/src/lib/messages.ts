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
export const DRAG_TO_REORDER = 'Drag to reorder'
export const ADD_A_TASK = 'Add a task'
export const NEW_TASK_TITLE = 'New task'
export const EDIT_TASK_TITLE = 'Edit task'
export const SUBMIT_ADD = 'Add'
export const SUBMIT_SAVE = 'Save'
export const CANCEL = 'Cancel'
export const DELETE = 'Delete'
export const DELETE_TASK_TITLE = 'Delete task?'
export const DELETE_RECURRING_TITLE = 'Delete recurring task?'
export const CANNOT_UNDO = 'This can’t be undone.'
export const LABEL_DELETE_KEEPS_TASKS = 'Its tasks stay, without a label.'

export function addTaskOnLabel(day: string): string {
  return `${ADD_A_TASK} on ${day}`
}

export function editTaskLabel(title: string): string {
  return `Edit “${title}”`
}

export function toggleTaskLabel(title: string, done: boolean): string {
  return `Mark “${title}” as ${done ? 'not done' : 'done'}`
}

export function deleteLabelTitle(name: string): string {
  return `${DELETE} “${name}”?`
}

// The backend's reason is lower-case prose, so it reads as the second half of the sentence.
export function failureWithReason(actionMessage: string, reason: string): string {
  const end = /[.!?…]$/.test(reason) ? '' : '.'
  return `${actionMessage.replace(/\.$/, '')}: ${reason}${end}`
}
