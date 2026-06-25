import '@fontsource-variable/inter'
// Hanken Grotesk is the display face for titles/wordmark — a neutral, minimal
// grotesque with just a touch of humanist warmth (calm, not boring, not frilly).
// Inter still carries body/UI. Same self-hosted, offline-safe pattern as Inter.
import '@fontsource-variable/hanken-grotesk'
import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'

const app = mount(App, { target: document.getElementById('app')! })

export default app
