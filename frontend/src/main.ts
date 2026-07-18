import '@fontsource-variable/inter'
// Self-hosted display font; Inter remains the body/UI face.
import '@fontsource-variable/hanken-grotesk'
import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'

const app = mount(App, { target: document.getElementById('app')! })

export default app
