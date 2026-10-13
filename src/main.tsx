import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans-thai/400.css'
import '@fontsource/ibm-plex-sans-thai/500.css'
import '@fontsource/ibm-plex-sans-thai/600.css'
import '@fontsource/mitr/400.css'
import '@fontsource/mitr/500.css'
import './index.css'
import App from './App.tsx'
import { DreamPage } from './components/dream/DreamPage.tsx'

// /lynch is the AI team's public page (/dream, its first name, still works); everything else is the portfolio app.
const dream = /^\/(lynch|dream)\/?$/.test(window.location.pathname)
if (dream) document.title = 'ทีม Lynch · ส่องพอร์ต Dime'

createRoot(document.getElementById('root')!).render(<StrictMode>{dream ? <DreamPage /> : <App />}</StrictMode>)
