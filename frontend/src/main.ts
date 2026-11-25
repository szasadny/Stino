import '@fontsource-variable/inter'
import '@fontsource-variable/hanken-grotesk'
import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { setKeyboardDragTrigger } from 'svelte-dnd-action'
import { presses, trackPresses } from './lib/dnd/presses.action'

// Enter stays the open key on drag items (TaskPill, TaskRow); Space starts a keyboard drag.
setKeyboardDragTrigger('space')
trackPresses(window, presses)

const target = document.getElementById('app')
if (!target) throw new Error('index.html is missing the #app mount point')

const app = mount(App, { target })

export default app
