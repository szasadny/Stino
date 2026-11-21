import '@fontsource-variable/inter'
import '@fontsource-variable/hanken-grotesk'
import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { setKeyboardDragTrigger } from 'svelte-dnd-action'
import { presses, trackPresses } from './lib/tap'

// Enter stays the open key on drag items (TaskPill, TaskRow); Space starts a keyboard drag.
setKeyboardDragTrigger('space')
trackPresses(window, presses)

const app = mount(App, { target: document.getElementById('app')! })

export default app
